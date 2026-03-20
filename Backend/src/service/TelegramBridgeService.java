package service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import model.Agencia;
import model.Cliente;
import model.Dispositivo;
import model.Dispositivo.Plataforma;
import model.Etapa;
import model.Mensaje;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;

@Service
public class TelegramBridgeService {

    private static final Logger log = LoggerFactory.getLogger(TelegramBridgeService.class);

    private static final String ENDPOINT_REQUEST_CODE = "/request-code";
    private static final String ENDPOINT_SUBMIT_CODE = "/submit-code";
    private static final String ENDPOINT_LOGOUT = "/logout";
    private static final String ENDPOINT_SEND_MESSAGE = "/send-message";
    private static final String ENDPOINT_SEND_MEDIA = "/send-media";
    private static final String ORIGEN_TELEGRAM = "TELEGRAM";

    @Value("${telegram.bridge.url:http://127.0.0.1:5000}")
    private String pythonUrl;

    private final RestTemplate restTemplate;
    private final DispositivoRepository dispositivoRepository;
    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final MensajeRepository mensajeRepository;
    private final SimpMessagingTemplate messaging;
    private final CloudStorageService cloudStorageService;
    private final SubscriptionValidationService subscriptionValidationService;

    public TelegramBridgeService(DispositivoRepository dispositivoRepository,
            ClienteRepository clienteRepository,
            EtapaRepository etapaRepository,
            MensajeRepository mensajeRepository,
            SimpMessagingTemplate messaging,
            CloudStorageService cloudStorageService,
            SubscriptionValidationService subscriptionValidationService) {
        this.dispositivoRepository = dispositivoRepository;
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.mensajeRepository = mensajeRepository;
        this.messaging = messaging;
        this.cloudStorageService = cloudStorageService;
        this.subscriptionValidationService = subscriptionValidationService;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(20000);
        factory.setReadTimeout(20000);
        this.restTemplate = new RestTemplate(factory);
    }

    @SuppressWarnings("UseSpecificCatch")
    public void desvincular(Dispositivo dispositivo) {
        try {
            String url = pythonUrl + ENDPOINT_LOGOUT;
            Map<String, String> body = Map.of("user_id", dispositivo.getSessionId());
            log.info("Enviando petición de cierre de sesión real a Python para: {}", dispositivo.getSessionId());
            restTemplate.postForEntity(url, body, String.class);
        } catch (Exception e) {
            log.error("Error al pedir logout a Python: {}", e.getMessage());
        }
        // Actualizar estado en BD y notificar frontend
        dispositivo.setEstado("DESCONECTADO");
        dispositivoRepository.save(dispositivo);
        if (dispositivo.getAgencia() != null) {
            Map<String, Object> notif = new HashMap<>();
            notif.put("tipo", "DISCONNECTED");
            notif.put("sessionId", dispositivo.getSessionId());
            messaging.convertAndSend("/topic/bot/" + dispositivo.getAgencia().getId(), notif);
        }
    }

    private record ChatEvent(String contenido, boolean inbound, String fecha, String tipo, String origen,
            String urlArchivo, String autor) {
    }

    private record KanbanEvent(Long clienteId, String nombre, String ultimoMensaje, int mensajesSinLeer,
            String avatarUrl, String ultimoMensajeFecha, Long etapaId,
            String origen, String nombreInstancia, boolean esSalida) {
    }

    @SuppressWarnings("null")
    public void enviarMensajeDesdeCrm(@NonNull Cliente cliente, String texto, String autor) {
        try {
            String sessionId = obtenerSessionIdAgencia(cliente.getAgencia().getId());
            String url = pythonUrl + ENDPOINT_SEND_MESSAGE;

            Map<String, String> body = new HashMap<>();
            body.put("user_id", sessionId);
            body.put("chat_id", cliente.getTelefono());
            body.put("text", texto);

            restTemplate.postForEntity(url, body, String.class);

            Mensaje mensaje = crearMensajeSalida(cliente, texto, Mensaje.TipoMensaje.TEXTO, null, autor);
            mensajeRepository.save(mensaje);

            String nombreFinal = (autor != null && !autor.isEmpty()) ? autor : "Agente";
            cliente.setUltimoMensajeResumen(nombreFinal + ": " + texto);
            cliente.setUltimoMensajeFecha(mensaje.getFechaHora());
            cliente.setMensajesSinLeer(0);
            clienteRepository.save(cliente);

            String alias = obtenerAliasTelegramAgencia(cliente.getAgencia().getId());
            notificarCambio(cliente, mensaje, true, nombreFinal, alias);

        } catch (RestClientException e) {
            log.error("Error enviando mensaje Telegram: {}", e.getMessage());
            throw new RestClientException("Fallo al enviar mensaje", e);
        }
    }

    @SuppressWarnings({ "UseSpecificCatch", "null" })
    public void enviarArchivoDesdeCrm(@NonNull Cliente cliente, String urlPublica, String nombreArchivo, String autor) {
        try {
            String sessionId = obtenerSessionIdAgencia(cliente.getAgencia().getId());
            String url = pythonUrl + ENDPOINT_SEND_MEDIA;

            Map<String, String> body = new HashMap<>();
            body.put("user_id", sessionId);
            body.put("chat_id", cliente.getTelefono());
            body.put("media_url", urlPublica);
            body.put("caption", nombreArchivo);

            restTemplate.postForEntity(url, body, String.class);

            Mensaje mensaje = crearMensajeSalida(cliente, "📎 " + nombreArchivo, Mensaje.TipoMensaje.IMAGEN, urlPublica,
                    autor);
            mensajeRepository.save(mensaje);

            String nombreCajero = (autor != null && !autor.isEmpty()) ? autor : "Agente";
            cliente.setUltimoMensajeResumen(nombreCajero + ": 📎 Archivo");
            cliente.setUltimoMensajeFecha(mensaje.getFechaHora());
            cliente.setMensajesSinLeer(0);
            clienteRepository.save(cliente);

            String aliasArchivo = obtenerAliasTelegramAgencia(cliente.getAgencia().getId());
            notificarCambio(cliente, mensaje, true, nombreCajero, aliasArchivo);

        } catch (Exception e) {
            log.error("Error enviando archivo Telegram: {}", e.getMessage());
        }
    }

    private Mensaje crearMensajeSalida(Cliente cliente, String contenido, Mensaje.TipoMensaje tipo, String urlArchivo,
            String autor) {
        Mensaje m = new Mensaje();
        m.setCliente(cliente);
        m.setContenido(contenido);
        m.setEsSalida(true);
        m.setAutor(autor);
        m.setFechaHora(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC));
        m.setTipo(tipo);
        m.setEstado(Mensaje.EstadoMensaje.SENT);
        m.setWhatsappId("TG_OUT_" + System.currentTimeMillis());
        if (urlArchivo != null)
            m.setUrlArchivo(urlArchivo);
        return m;
    }

    @SuppressWarnings("java:S107")
    @Transactional
    public void procesarMensajeWebhook(String deviceSessionId, String telegramId, String nombreSender,
            String telefono, String texto, String avatarUrl,
            String fileUrl, String fileType, String messageDate) {

        Optional<Dispositivo> dispositivoOpt = dispositivoRepository.findBySessionId(deviceSessionId);
        if (dispositivoOpt.isEmpty()) {
            log.warn("Webhook Telegram sesión desconocida: {}", deviceSessionId);
            return;
        }

        Dispositivo disp = dispositivoOpt.get();
        String telefonoFinal = (telefono != null && !telefono.isEmpty()) ? telefono : telegramId;
        procesarMensajeEntrante(disp, telefonoFinal, nombreSender, texto, avatarUrl, fileUrl, fileType, messageDate);
    }

    @SuppressWarnings({ "java:S107", "null" })
    @Transactional
    public void procesarMensajeEntrante(Dispositivo disp, String telefono, String nombreSender,
            String texto, String avatarUrl, String fileUrl, String fileType, String dateStr) {

        if (disp == null || disp.getAgencia() == null) {
            log.warn("Dispositivo o agencia nula al procesar mensaje entrante");
            return;
        }

        Cliente cliente = buscarOCrearCliente(disp.getAgencia(), telefono, nombreSender, disp);

        if (cliente == null) {
            log.warn("LÍMITE ALCANZADO: Mensaje de Telegram de {} ignorado.", telefono);
            enviarAutoRespuestaLimite(disp.getSessionId(), telefono);
            return;
        }

        if (cliente.getDispositivo() == null) {
            cliente.setDispositivo(disp);
        }

        String urlFinalAvatar = persistirImagenTelegram(avatarUrl);
        String urlFinalArchivo = persistirImagenTelegram(fileUrl);
        LocalDateTime fechaReal = parsearFechaTelegram(dateStr);

        actualizarMetricasCliente(cliente, texto, urlFinalAvatar, fechaReal);
        cliente = clienteRepository.save(cliente);

        Mensaje mensaje = crearMensajeEntradaConArchivo(cliente, texto, urlFinalArchivo, fileType, fechaReal);
        mensajeRepository.save(mensaje);

        notificarCambio(cliente, mensaje, false, nombreSender, disp.getAlias());
    }

    @SuppressWarnings("java:S3776")
    private Mensaje crearMensajeEntradaConArchivo(Cliente cliente, String texto, String fileUrl, String fileType,
            LocalDateTime fecha) {
        Mensaje m = new Mensaje();
        m.setCliente(cliente);
        m.setContenido(texto != null ? texto : "");
        m.setEsSalida(false);
        m.setFechaHora(fecha);
        m.setWhatsappId("TG_" + System.currentTimeMillis());
        m.setEstado(Mensaje.EstadoMensaje.DELIVERED);

        if (fileUrl != null && !fileUrl.isEmpty()) {
            m.setUrlArchivo(fileUrl);
            if ("photo".equalsIgnoreCase(fileType) || "sticker".equalsIgnoreCase(fileType)) {
                m.setTipo(Mensaje.TipoMensaje.IMAGEN);
                if (m.getContenido().isEmpty())
                    m.setContenido("Imagen");
            } else if ("video".equalsIgnoreCase(fileType)) {
                m.setTipo(Mensaje.TipoMensaje.VIDEO);
                if (m.getContenido().isEmpty())
                    m.setContenido("Video");
            } else if ("voice".equalsIgnoreCase(fileType) || "audio".equalsIgnoreCase(fileType)) {
                m.setTipo(Mensaje.TipoMensaje.AUDIO);
                if (m.getContenido().isEmpty())
                    m.setContenido("Audio");
            } else {
                m.setTipo(Mensaje.TipoMensaje.DOCUMENTO);
                if (m.getContenido().isEmpty())
                    m.setContenido("Archivo");
            }
        } else {
            m.setTipo(Mensaje.TipoMensaje.TEXTO);
        }
        return m;
    }

    private LocalDateTime parsearFechaTelegram(String dateStr) {
        if (dateStr == null || dateStr.isEmpty())
            return LocalDateTime.now();
        try {
            return OffsetDateTime.parse(dateStr).toLocalDateTime();
        } catch (RuntimeException e) {
            log.warn("Error parseando fecha Telegram: {}", dateStr);
            return LocalDateTime.now();
        }
    }

    private void actualizarMetricasCliente(Cliente cliente, String texto, String photoUrl, LocalDateTime fecha) {
        if (photoUrl != null && !photoUrl.isEmpty()) {
            cliente.setFotoUrl(photoUrl);
        }
        if (texto != null && !texto.isEmpty()) {
            cliente.setUltimoMensajeResumen(texto);
        }
        cliente.setUltimoMensajeFecha(fecha);
        cliente.setMensajesSinLeer(cliente.getMensajesSinLeer() + 1);
    }

    private void notificarCambio(Cliente c, Mensaje m, boolean esSalida, String nombreAutor, String aliasDisp) {
        if (c.getAgencia() == null || c.getAgencia().getId() == null)
            return;
        Long agenciaId = c.getAgencia().getId();

        String fechaWs = m.getFechaHora().toString() + "Z";

        ChatEvent chatEv = new ChatEvent(
                m.getContenido(), !esSalida, fechaWs, m.getTipo().toString(),
                ORIGEN_TELEGRAM, m.getUrlArchivo() != null ? m.getUrlArchivo() : "", nombreAutor);
        messaging.convertAndSend("/topic/chat/" + c.getId(), chatEv);

        String nombreInstancia = (aliasDisp != null && !aliasDisp.isEmpty()) ? aliasDisp : "TELEGRAM";

        KanbanEvent kanbanEv = new KanbanEvent(
                c.getId(), c.getNombre(), c.getUltimoMensajeResumen(), c.getMensajesSinLeer(),
                c.getFotoUrl() != null ? c.getFotoUrl() : "",
                c.getUltimoMensajeFecha() != null ? c.getUltimoMensajeFecha().toString() : null,
                c.getEtapa() != null ? c.getEtapa().getId() : null,
                ORIGEN_TELEGRAM, nombreInstancia, esSalida);
        messaging.convertAndSend("/topic/embudo/" + agenciaId, kanbanEv);
    }

    private Cliente buscarOCrearCliente(Agencia agencia, String telefono, String nombreSender,
            Dispositivo dispositivo) {
        Long agenciaId = agencia.getId();
        Optional<Cliente> opt = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivo(agenciaId, telefono,
                dispositivo);

        if (opt.isEmpty()) {
            opt = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivoIsNull(agenciaId, telefono);
        }

        if (opt.isPresent()) {
            Cliente c = opt.get();
            if (c.getDispositivo() == null)
                c.setDispositivo(dispositivo);
            if (!"TELEGRAM".equals(c.getOrigen()))
                c.setOrigen("TELEGRAM");
            return clienteRepository.save(c);
        } else {
            if (!subscriptionValidationService.puedeRecibirNuevoContacto(agencia)) {
                notificarLimiteAlcanzado(agencia);
                return null;
            }

            Cliente nuevo = new Cliente();
            nuevo.setTelefono(telefono);
            nuevo.setNombre(nombreSender + " (" + dispositivo.getAlias() + ")");
            nuevo.setAgencia(agencia);
            nuevo.setOrigen("TELEGRAM");
            nuevo.setDispositivo(dispositivo);
            asignarEtapaInicial(nuevo, agenciaId);
            return clienteRepository.save(nuevo);
        }
    }

    @SuppressWarnings("UseSpecificCatch")
    private void notificarLimiteAlcanzado(Agencia agencia) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("tipo", "LIMIT_REACHED");
            payload.put("titulo", "Límite de Contactos");
            payload.put("mensaje",
                    "Un cliente nuevo intentó escribirte por Telegram, pero has alcanzado el límite de contactos de tu plan actual. ¡Mejora tu suscripción para no perder ventas!");

            messaging.convertAndSend("/topic/bot/" + agencia.getId(), payload);
        } catch (Exception e) {
            log.warn("No se pudo enviar notificación de límite por WS", e);
        }
    }

    @SuppressWarnings("UseSpecificCatch")
    private void enviarAutoRespuestaLimite(String sessionId, String chatId) {
        try {
            String url = pythonUrl + ENDPOINT_SEND_MESSAGE;
            Map<String, String> body = new HashMap<>();
            body.put("user_id", sessionId);
            body.put("chat_id", chatId);
            body.put("text",
                    "Lo sentimos, el sistema de atención de esta empresa se encuentra saturado. Intente comunicarse más tarde.");
            restTemplate.postForEntity(url, body, String.class);
        } catch (Exception e) {
            log.warn("No se pudo enviar auto-respuesta de límite por Telegram", e);
        }
    }

    private void asignarEtapaInicial(Cliente cliente, Long agenciaId) {
        Etapa etapaInicial = etapaRepository.findFirstByAgenciaIdOrderByOrdenAsc(agenciaId);
        if (etapaInicial != null)
            cliente.setEtapa(etapaInicial);
    }

    private String obtenerSessionIdAgencia(Long agenciaId) {
        return dispositivoRepository.findAll().stream()
                .filter(d -> d.getAgencia().getId().equals(agenciaId) && d.getPlataforma() == Plataforma.TELEGRAM)
                .findFirst()
                .map(Dispositivo::getSessionId)
                .orElseThrow(() -> new IllegalStateException("No hay Telegram conectado"));
    }

    private String obtenerAliasTelegramAgencia(Long agenciaId) {
        return dispositivoRepository.findAll().stream()
                .filter(d -> d.getAgencia().getId().equals(agenciaId) && d.getPlataforma() == Plataforma.TELEGRAM)
                .findFirst()
                .map(Dispositivo::getAlias)
                .orElse("TELEGRAM");
    }

    public Dispositivo crearDispositivo(Agencia agencia, String alias, String telefono) {
        Dispositivo d = new Dispositivo();
        d.setAgencia(agencia);
        d.setAlias(alias);
        d.setNumeroTelefono(telefono);
        d.setPlataforma(Plataforma.TELEGRAM);
        d.setEstado("CONECTANDO");
        d.setSessionId("tg_" + UUID.randomUUID().toString());
        return dispositivoRepository.save(d);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> solicitarCodigo(Dispositivo dispositivo) {
        Map<String, String> body = new HashMap<>();
        body.put("phone", dispositivo.getNumeroTelefono());
        body.put("user_id", dispositivo.getSessionId());
        return restTemplate.postForObject(pythonUrl + ENDPOINT_REQUEST_CODE, body, Map.class);
    }

    @SuppressWarnings({})
    public Map<String, Object> validarCodigo(Dispositivo dispositivo, String codigo, String hash) {
        Map<String, String> body = new HashMap<>();
        body.put("phone", dispositivo.getNumeroTelefono());
        body.put("user_id", dispositivo.getSessionId());
        body.put("code", codigo);
        body.put("phone_code_hash", hash);
        @SuppressWarnings("unchecked")
        Map<String, Object> res = restTemplate.postForObject(pythonUrl + ENDPOINT_SUBMIT_CODE, body, Map.class);
        dispositivo.setEstado("CONECTADO");
        dispositivoRepository.save(dispositivo);
        // Notificar frontend que el dispositivo se conectó
        if (dispositivo.getAgencia() != null) {
            Map<String, Object> notif = new HashMap<>();
            notif.put("tipo", "CONNECTED");
            notif.put("sessionId", dispositivo.getSessionId());
            messaging.convertAndSend("/topic/bot/" + dispositivo.getAgencia().getId(), notif);
        }
        return res;
    }

    public void eliminarDispositivo(Long deviceId) {
        if (deviceId == null)
            return;
        dispositivoRepository.findById(deviceId).ifPresent(d -> {
            // Intentar desconectar sesión de Python
            try {
                desvincular(d);
            } catch (Exception e) {
                log.warn("No se pudo desvincular: {}", e.getMessage());
            }
            // SOFT DELETE: preservar historial de mensajes y clientes
            d.setVisible(false);
            d.setActivo(false);
            d.setEstado("ELIMINADO");
            dispositivoRepository.save(d);
            log.info("Dispositivo {} marcado como eliminado (soft delete). Historial preservado.", deviceId);
        });
    }

    public void cerrarSesion(String sessionId) {
        if (sessionId == null || sessionId.isEmpty())
            return;
        try {
            log.info("Cerrando sesión en el bridge para el ID: {}", sessionId);
        } catch (RuntimeException e) {
            log.error("Error al cerrar sesión: {}", e.getMessage());
        }
    }

    @SuppressWarnings("UseSpecificCatch")
    private String persistirImagenTelegram(String urlOriginal) {
        if (urlOriginal == null || !urlOriginal.contains("/static/media/")) {
            return urlOriginal;
        }
        try {
            log.info("Persistiendo imagen de Telegram en la nube: {}", urlOriginal);
            byte[] imageBytes = restTemplate.getForObject(urlOriginal, byte[].class);
            if (imageBytes != null) {
                return cloudStorageService.uploadBytes(imageBytes, "tg_avatar_" + System.currentTimeMillis());
            }
        } catch (Exception e) {
            log.warn("Error al persistir imagen de Telegram, se usará la URL original: {}", e.getMessage());
        }
        return urlOriginal;
    }

    @SuppressWarnings("UseSpecificCatch")
    public boolean estaConectado() {
        try {
            return restTemplate.getForEntity(pythonUrl + "/", String.class).getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            return false;
        }
    }
}