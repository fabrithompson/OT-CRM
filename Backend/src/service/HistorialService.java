package service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import model.Agencia;
import model.Cliente;
import model.Dispositivo;
import model.Mensaje;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;
import util.PhoneUtil;

/**
 * Importa mensajes que no llegaron por el flujo en vivo: el historial que WhatsApp
 * o Telegram entregan al vincular una cuenta y los mensajes que el vendedor manda
 * desde su celular por Telegram.
 *
 * Reglas:
 * - Idempotente: cada mensaje trae su id real (WhatsApp/Telegram) y uno ya guardado
 *   se saltea, así que reenviar el mismo lote no duplica nada.
 * - Respeta la fecha original del mensaje (el chat se ordena por fecha).
 * - Crea los contactos que falten, respetando el límite de contactos del plan.
 * - El historial NO dispara notificaciones, contadores de no leídos ni el agente de IA:
 *   son conversaciones viejas, no mensajes nuevos.
 */
@Service
public class HistorialService {

    private static final Logger log = LoggerFactory.getLogger(HistorialService.class);

    public static final ZoneId ZONA = ZoneId.of("America/Argentina/Buenos_Aires");
    public static final int MAX_LOTE = 1000;
    public static final String WHATSAPP = "WHATSAPP";
    public static final String TELEGRAM = "TELEGRAM";
    private static final String PREFIJO_NOMBRE = "Cliente ";

    /**
     * Un mensaje a importar.
     *
     * @param telefono  teléfono del contacto (Telegram: teléfono o id de usuario, igual que el webhook en vivo)
     * @param saliente  true si lo mandó el dueño de la cuenta
     * @param tipo      TEXTO, IMAGEN, VIDEO, AUDIO, DOCUMENTO o STICKER (null = TEXTO)
     * @param timestamp segundos desde 1970 (UTC)
     * @param externoId id real del mensaje en WhatsApp/Telegram (para no duplicar)
     */
    public record MensajeHistorial(String telefono, String nombre, Boolean saliente, String texto,
                                   String tipo, Long timestamp, String externoId, String urlArchivo) {}

    public record Resultado(int mensajesNuevos, int duplicados, int contactosCreados,
                            int omitidosPorLimite, int invalidos) {
        static Resultado vacio() {
            return new Resultado(0, 0, 0, 0, 0);
        }
    }

    private final DispositivoRepository dispositivoRepository;
    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final EtapaRepository etapaRepository;
    private final SubscriptionValidationService subscriptionValidationService;
    private final SimpMessagingTemplate messaging;
    // Proxy a sí mismo: procesarContactoTx tiene que entrar por el proxy de Spring
    // para que @Transactional abra una transacción propia por contacto.
    private final HistorialService self;

    // Serializa el procesamiento de un mismo contacto dentro de esta instancia: evita
    // que un lote del historial y un mensaje en vivo (o dos lotes) creen el contacto o
    // guarden el mismo mensaje a la vez. Mismo patrón que WhatsAppService.phoneLocks.
    private final Cache<String, Object> contactoLocks = Caffeine.newBuilder()
            .expireAfterAccess(2, java.util.concurrent.TimeUnit.MINUTES)
            .maximumSize(10_000)
            .build();

    public HistorialService(DispositivoRepository dispositivoRepository, ClienteRepository clienteRepository,
                            MensajeRepository mensajeRepository, EtapaRepository etapaRepository,
                            SubscriptionValidationService subscriptionValidationService,
                            SimpMessagingTemplate messaging,
                            @org.springframework.context.annotation.Lazy HistorialService self) {
        this.dispositivoRepository = dispositivoRepository;
        this.clienteRepository = clienteRepository;
        this.mensajeRepository = mensajeRepository;
        this.etapaRepository = etapaRepository;
        this.subscriptionValidationService = subscriptionValidationService;
        this.messaging = messaging;
        this.self = self;
    }

    /**
     * @param enVivo true para mensajes recién enviados (se notifican al chat abierto uno por uno);
     *               false para historial (un solo aviso al final para refrescar el tablero)
     */
    public Resultado importar(String sessionId, String origen, List<MensajeHistorial> lote, boolean enVivo) {
        if (lote == null || lote.isEmpty()) {
            return Resultado.vacio();
        }
        if (lote.size() > MAX_LOTE) {
            throw new IllegalArgumentException("El lote no puede superar los " + MAX_LOTE + " mensajes");
        }

        Dispositivo dispositivo = sessionId == null ? null : dispositivoRepository.findBySessionId(sessionId).orElse(null);
        if (dispositivo == null || dispositivo.getAgencia() == null) {
            log.warn("Historial: sessionId '{}' desconocido, lote ignorado", sessionId);
            return Resultado.vacio();
        }
        // Las líneas de campañas viven aisladas del embudo; una línea inactiva (por límite de plan) no recibe
        if (dispositivo.getProposito() == Dispositivo.Proposito.CAMPANIAS
                || Boolean.FALSE.equals(dispositivo.getActivo())) {
            return Resultado.vacio();
        }
        Agencia agencia = dispositivo.getAgencia();

        // 1) Validar y agrupar por contacto (dedupe dentro del lote; contra la base se hace por contacto)
        int invalidos = 0;
        int duplicados = 0;
        Set<String> vistos = new HashSet<>();
        Map<String, List<MensajeHistorial>> porTelefono = new LinkedHashMap<>();
        for (MensajeHistorial m : lote) {
            String telefono = m == null ? null : normalizarTelefono(origen, m.telefono());
            boolean sinContenido = m == null || ((m.texto() == null || m.texto().isBlank()) && m.tipo() == null);
            if (telefono == null || telefono.isBlank() || m.externoId() == null || m.externoId().isBlank() || sinContenido) {
                invalidos++;
                continue;
            }
            if (!vistos.add(m.externoId())) {
                duplicados++;
                continue;
            }
            porTelefono.computeIfAbsent(telefono, k -> new ArrayList<>()).add(m);
        }

        // 2) Cada contacto se procesa en su propia transacción, serializado por un lock de
        //    contacto y con reintento ante colisión. Así una colisión en un contacto no
        //    tira abajo todo el lote y no se duplican ni contactos ni mensajes.
        int nuevos = 0;
        int creados = 0;
        int omitidos = 0;
        for (Map.Entry<String, List<MensajeHistorial>> e : porTelefono.entrySet()) {
            ResultadoContacto rc = procesarContactoConReintento(agencia, dispositivo, origen, e.getKey(), e.getValue(), enVivo);
            nuevos += rc.nuevos();
            duplicados += rc.duplicados();
            creados += rc.creado() ? 1 : 0;
            omitidos += rc.omitidos();
        }

        Resultado r = new Resultado(nuevos, duplicados, creados, omitidos, invalidos);
        if (!enVivo && nuevos > 0) {
            avisarTablero(agencia, origen, r);
        }
        log.info("Historial {} sessionId={}: {} mensajes nuevos, {} duplicados, {} contactos creados, {} omitidos por límite, {} inválidos",
                origen, sessionId, nuevos, duplicados, creados, omitidos, invalidos);
        return r;
    }

    private record ResultadoContacto(int nuevos, int duplicados, boolean creado, int omitidos) {
        static ResultadoContacto omitido(int cuantos) { return new ResultadoContacto(0, 0, false, cuantos); }
    }

    /**
     * Procesa un contacto serializando por teléfono dentro de esta instancia. El lock se
     * suelta recién cuando la transacción de procesarContactoTx ya commiteó (el método
     * entra por el proxy, así que al volver ya está confirmada), de modo que un segundo
     * hilo del mismo contacto ve el estado ya guardado y no duplica. El catch de
     * DataIntegrityViolationException es el respaldo si la colisión viene de otro proceso.
     */
    private ResultadoContacto procesarContactoConReintento(Agencia agencia, Dispositivo dispositivo, String origen,
                                                           String telefono, List<MensajeHistorial> mensajes, boolean enVivo) {
        Object lock = contactoLocks.get(agencia.getId() + "|" + telefono, k -> new Object());
        synchronized (lock) {
            try {
                return self.procesarContactoTx(agencia.getId(), dispositivo.getId(), origen, telefono, mensajes, enVivo);
            } catch (DataIntegrityViolationException e) {
                log.warn("Historial: colisión en contacto {} (agencia {}), reintentando", telefono, agencia.getId());
                try {
                    return self.procesarContactoTx(agencia.getId(), dispositivo.getId(), origen, telefono, mensajes, enVivo);
                } catch (DataIntegrityViolationException e2) {
                    log.error("Historial: contacto {} falló tras reintento: {}", telefono, e2.getMessage());
                    return ResultadoContacto.omitido(0);
                }
            } finally {
                contactoLocks.invalidate(agencia.getId() + "|" + telefono);
            }
        }
    }

    /**
     * Procesa los mensajes de un contacto en una transacción propia. Recibe ids (no
     * entidades) para que todo se cargue dentro de esta transacción. El dedupe contra la
     * base va acá adentro: un reintento tras una colisión ve los mensajes ya guardados.
     */
    @Transactional
    public ResultadoContacto procesarContactoTx(Long agenciaId, Long dispositivoId, String origen,
                                                String telefono, List<MensajeHistorial> mensajesEntrada, boolean enVivo) {
        Dispositivo dispositivo = dispositivoRepository.findById(dispositivoId).orElseThrow();
        Agencia agencia = dispositivo.getAgencia();

        List<MensajeHistorial> mensajes = new ArrayList<>(mensajesEntrada);
        mensajes.sort(Comparator.comparing(m -> m.timestamp() == null ? Long.MAX_VALUE : m.timestamp()));

        // Dedupe contra la base, ahora dentro de la transacción
        Set<String> ids = new HashSet<>();
        mensajes.forEach(m -> ids.add(m.externoId()));
        Set<String> yaGuardados = ids.isEmpty() ? Set.of() : new HashSet<>(mensajeRepository.findWhatsappIdsExistentes(ids));
        int duplicados = 0;
        List<MensajeHistorial> aProcesar = new ArrayList<>();
        for (MensajeHistorial m : mensajes) {
            if (yaGuardados.contains(m.externoId())) {
                duplicados++;
            } else {
                aProcesar.add(m);
            }
        }

        Optional<Cliente> existente = buscarCliente(agencia, telefono, dispositivo);
        Cliente cliente;
        boolean creado = false;
        if (existente.isPresent()) {
            cliente = completarCliente(existente.get(), dispositivo, nombreDe(mensajes));
        } else {
            if (aProcesar.isEmpty()) {
                // Todo duplicado y el contacto no existe: nada que crear
                return new ResultadoContacto(0, duplicados, false, 0);
            }
            if (!subscriptionValidationService.puedeRecibirNuevoContacto(agencia)) {
                return new ResultadoContacto(0, duplicados, false, aProcesar.size());
            }
            cliente = crearCliente(agencia, dispositivo, origen, telefono, nombreDe(mensajes),
                    fecha(aProcesar.get(0).timestamp()));
            creado = true;
        }

        if (aProcesar.isEmpty()) {
            return new ResultadoContacto(0, duplicados, creado, 0);
        }

        List<Mensaje> aGuardar = new ArrayList<>();
        for (MensajeHistorial m : aProcesar) {
            aGuardar.add(aMensaje(cliente, origen, m));
        }
        List<Mensaje> guardados = mensajeRepository.saveAll(aGuardar);
        actualizarResumen(cliente, guardados);

        if (enVivo) {
            guardados.forEach(g -> notificarMensaje(cliente, g));
        }
        return new ResultadoContacto(guardados.size(), duplicados, creado, 0);
    }

    // ── Contactos ───────────────────────────────────────────────────────────────

    private String normalizarTelefono(String origen, String telefono) {
        if (telefono == null) return null;
        // Telegram usa el teléfono tal cual o el id numérico del usuario (mismo criterio que
        // el webhook en vivo); normalizarlo como número argentino rompería los ids.
        return WHATSAPP.equals(origen) ? PhoneUtil.normalizar(telefono) : telefono.trim();
    }

    private Optional<Cliente> buscarCliente(Agencia agencia, String telefono, Dispositivo dispositivo) {
        Optional<Cliente> c = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivo(agencia.getId(), telefono, dispositivo);
        if (c.isEmpty()) {
            c = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivoIsNull(agencia.getId(), telefono);
        }
        return c;
    }

    private static String nombreDe(List<MensajeHistorial> mensajes) {
        return mensajes.stream()
                .map(MensajeHistorial::nombre)
                .filter(n -> n != null && !n.isBlank() && !"Usuario".equalsIgnoreCase(n.trim()))
                .reduce((a, b) -> b) // el más reciente
                .map(String::trim)
                .orElse(null);
    }

    private Cliente completarCliente(Cliente c, Dispositivo dispositivo, String nombre) {
        boolean cambio = false;
        if (c.getDispositivo() == null) {
            c.setDispositivo(dispositivo);
            cambio = true;
        }
        boolean nombreGenerico = c.getNombre() == null || c.getNombre().startsWith(PREFIJO_NOMBRE)
                || "Sin Nombre".equals(c.getNombre());
        if (nombre != null && nombreGenerico) {
            c.setNombre(recortar(nombre, 255));
            cambio = true;
        }
        if (c.getEtapa() == null) {
            etapaRepository.findFirstByAgenciaIdAndEsInicialTrue(c.getAgencia().getId()).ifPresent(c::setEtapa);
            cambio = true;
        }
        return cambio ? clienteRepository.save(c) : c;
    }

    private Cliente crearCliente(Agencia agencia, Dispositivo dispositivo, String origen, String telefono,
                                 String nombre, LocalDateTime primerMensaje) {
        Cliente c = new Cliente();
        c.setAgencia(agencia);
        c.setDispositivo(dispositivo);
        c.setTelefono(telefono);
        c.setNombre(recortar(nombre != null ? nombre : PREFIJO_NOMBRE + telefono, 255));
        c.setOrigen(origen);
        c.setFechaRegistro(primerMensaje);
        c.setMensajesSinLeer(0);
        c.setSaldo(java.math.BigDecimal.ZERO);
        c.setEtapa(etapaRepository.findFirstByAgenciaIdAndEsInicialTrue(agencia.getId())
                .orElseGet(() -> etapaRepository.findFirstByAgenciaIdOrderByOrdenAsc(agencia.getId())));
        return clienteRepository.save(c);
    }

    // ── Mensajes ────────────────────────────────────────────────────────────────

    private Mensaje aMensaje(Cliente cliente, String origen, MensajeHistorial h) {
        Mensaje.TipoMensaje tipo = tipoDe(h.tipo());
        boolean saliente = Boolean.TRUE.equals(h.saliente());

        Mensaje m = new Mensaje();
        m.setCliente(cliente);
        m.setEsSalida(saliente);
        m.setTipo(tipo);
        m.setContenido(h.texto() != null && !h.texto().isBlank() ? h.texto() : "[" + tipo.name() + "]");
        m.setUrlArchivo(h.urlArchivo() != null && !h.urlArchivo().isBlank() ? h.urlArchivo() : null);
        m.setFechaHora(fecha(h.timestamp()));
        m.setWhatsappId(recortar(h.externoId(), 128));
        m.setEstado(Mensaje.EstadoMensaje.READ);
        // Enviado desde el celular del vendedor (no desde el CRM)
        if (saliente) {
            m.setAutor(WHATSAPP.equals(origen) ? "EXTERNO_WSP" : "EXTERNO_TG");
        }
        return m;
    }

    private static Mensaje.TipoMensaje tipoDe(String tipo) {
        if (tipo == null) return Mensaje.TipoMensaje.TEXTO;
        try {
            return Mensaje.TipoMensaje.valueOf(tipo.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return Mensaje.TipoMensaje.DOCUMENTO;
        }
    }

    private static LocalDateTime fecha(Long epochSegundos) {
        if (epochSegundos == null || epochSegundos <= 0) {
            return LocalDateTime.now(ZONA);
        }
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSegundos), ZONA);
    }

    /** El contacto muestra su último mensaje real (sólo si el importado es más nuevo). */
    private void actualizarResumen(Cliente cliente, List<Mensaje> guardados) {
        Mensaje ultimo = guardados.stream().max(Comparator.comparing(Mensaje::getFechaHora)).orElse(null);
        if (ultimo == null) return;
        if (cliente.getUltimoMensajeFecha() == null || ultimo.getFechaHora().isAfter(cliente.getUltimoMensajeFecha())) {
            String resumen = ultimo.isEsSalida() && ultimo.getAutor() != null
                    ? ultimo.getAutor() + ": " + ultimo.getContenido()
                    : ultimo.getContenido();
            cliente.setUltimoMensajeResumen(recortar(resumen, 255));
            cliente.setUltimoMensajeFecha(ultimo.getFechaHora());
            clienteRepository.save(cliente);
        }
    }

    private static String recortar(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    // ── Avisos al front ────────────────────────────────────────────────────────

    private void avisarTablero(Agencia agencia, String origen, Resultado r) {
        try {
            Map<String, Object> ev = new HashMap<>();
            ev.put("tipo", "REFRESCAR_KANBAN");
            messaging.convertAndSend("/topic/agencia/" + agencia.getId(), ev);

            Map<String, Object> progreso = new HashMap<>();
            progreso.put("tipo", "HISTORIAL_IMPORTADO");
            progreso.put("origen", origen);
            progreso.put("mensajes", r.mensajesNuevos());
            progreso.put("contactos", r.contactosCreados());
            messaging.convertAndSend("/topic/agencia/" + agencia.getId(), progreso);
        } catch (MessagingException e) {
            log.warn("No se pudo avisar el historial importado por WebSocket: {}", e.getMessage());
        }
    }

    private void notificarMensaje(Cliente c, Mensaje m) {
        try {
            Map<String, Object> chat = new HashMap<>();
            chat.put("contenido", m.getContenido());
            chat.put("inbound", !m.isEsSalida());
            chat.put("fecha", m.getFechaHora().toString());
            chat.put("tipo", m.getTipo().name());
            chat.put("urlArchivo", m.getUrlArchivo());
            chat.put("autor", m.getAutor());
            chat.put("whatsappId", m.getWhatsappId());
            chat.put("estado", m.getEstado().name());
            chat.put("origenMensaje", m.isEsSalida() ? "EXTERNO_WSP" : "CLIENTE");
            messaging.convertAndSend("/topic/chat/" + c.getId(), chat);

            Map<String, Object> embudo = new HashMap<>();
            embudo.put("clienteId", c.getId());
            embudo.put("nombre", c.getNombre());
            embudo.put("ultimoMensaje", c.getUltimoMensajeResumen());
            embudo.put("mensajesSinLeer", c.getMensajesSinLeer());
            embudo.put("avatarUrl", c.getFotoUrl());
            embudo.put("ultimoMensajeFecha", c.getUltimoMensajeFecha() != null ? c.getUltimoMensajeFecha().toString() : null);
            embudo.put("etapaId", c.getEtapa() != null ? c.getEtapa().getId() : null);
            embudo.put("origen", c.getOrigen());
            embudo.put("esSalida", m.isEsSalida());
            messaging.convertAndSend("/topic/embudo/" + c.getAgencia().getId(), embudo);
        } catch (MessagingException e) {
            log.warn("No se pudo notificar el mensaje {} por WebSocket: {}", m.getWhatsappId(), e.getMessage());
        }
    }
}
