package service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import dto.SystemNotification;
import exception.RegistroException;
import model.Agencia;
import model.Cliente;
import model.Dispositivo;
import model.Mensaje;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;

@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    private static final String CLIENTE_DEFAULT_PREFIX = "Cliente ";
    private static final String API_KEY_HEADER = "X-Bot-Token";
    private static final String ESTADO_CONNECTED = "CONNECTED";
    private static final String ESTADO_DISCONNECTED = "DISCONNECTED";

    private static final ZoneId ZONE_ARGENTINA = ZoneId.of("America/Argentina/Buenos_Aires");

    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final EtapaRepository etapaRepository;
    private final DispositivoRepository dispositivoRepository;
    private final SimpMessagingTemplate messaging;
    private final RestTemplate http;
    private final TelegramBridgeService bridgeService;
    private final SubscriptionValidationService subscriptionValidationService;
    private final CloudStorageService cloudStorageService;
    private final ConcurrentHashMap<String, Object> phoneLocks = new ConcurrentHashMap<>();

    @Value("${node.bot.url}")
    private String nodeBotUrl;

    @Value("${bot.secret.key}")
    private String botSecretKey;

    public WhatsAppService(ClienteRepository clienteRepository,
            MensajeRepository mensajeRepository,
            EtapaRepository etapaRepository,
            DispositivoRepository dispositivoRepository,
            SimpMessagingTemplate messaging,
            TelegramBridgeService bridgeService,
            SubscriptionValidationService subscriptionValidationService,
            CloudStorageService cloudStorageService,
            RestTemplate restTemplate) {
        this.subscriptionValidationService = subscriptionValidationService;
        this.cloudStorageService = cloudStorageService;
        this.clienteRepository = clienteRepository;
        this.mensajeRepository = mensajeRepository;
        this.etapaRepository = etapaRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.messaging = messaging;
        this.bridgeService = bridgeService;
        this.http = restTemplate;
    }

    public record MensajeEntranteRequest(String from, String texto, String nombreSender, String sessionId,
            String profilePicUrl, String origen, String mediaUrl, String mimeType) {

    }

    private record ChatNotification(String contenido, boolean inbound, String fecha, String tipo, String urlArchivo,
            String autor, String whatsappId, String estado) {

    }

    private record KanbanNotification(Long clienteId, String nombre, String ultimoMensaje, int mensajesSinLeer,
            String avatarUrl, String ultimoMensajeFecha, Long etapaId, String origen, String nombreInstancia,
            boolean esSalida) {

    }

    public record MensajeStatusUpdate(String sessionId, String whatsappId, String remoteJid, String status) {

    }

    public record MensajeStatusEvent(String whatsappId, String nuevoEstado) {

    }

    public String getNodeBotUrl() {
        if (nodeBotUrl == null) {
            return "";
        }
        return nodeBotUrl.replace("\"", "").replace("'", "").trim();
    }

    private LocalDateTime ahoraArgentina() {
        return ZonedDateTime.now(ZONE_ARGENTINA).toLocalDateTime();
    }

    @Transactional
    public void procesarMensajeRobot(MensajeEntranteRequest request) {
        procesarMensajeRobotInterno(request);
    }

    private void procesarMensajeRobotInterno(MensajeEntranteRequest req) {
        try {
            String telefono = limpiarTelefono(req.from());
            Dispositivo dispositivo = dispositivoRepository.findBySessionId(req.sessionId()).orElse(null);

            if (dispositivo == null) {
                log.warn("SEGURIDAD: SessionID '{}' desconocido. Mensaje ignorado.", req.sessionId());
                return;
            }

            if (Boolean.FALSE.equals(dispositivo.getActivo())) {
                log.warn("Mensaje recibido en dispositivo inactivo '{}'. Ignorado por límite de plan.",
                        req.sessionId());
                return;
            }

            Agencia agenciaDestino = dispositivo.getAgencia();
            String nombreFinal = (req.nombreSender() != null && !req.nombreSender().isBlank()) ? req.nombreSender()
                    : CLIENTE_DEFAULT_PREFIX + telefono;

            String fotoPermanente = req.profilePicUrl();
            if (fotoPermanente != null && fotoPermanente.contains("pps.whatsapp.net")) {
                Optional<Cliente> existenteOpt = buscarClienteExistente(agenciaDestino, telefono, dispositivo);
                boolean necesitaSubida = true;
                if (existenteOpt.isPresent()) {
                    String fotoActual = existenteOpt.get().getFotoUrl();
                    if (fotoActual != null && !fotoActual.isEmpty() && !fotoActual.contains("pps.whatsapp.net")) {
                        necesitaSubida = false;
                        fotoPermanente = fotoActual;
                    }
                }

                if (necesitaSubida) {
                    String urlNube = cloudStorageService.uploadFromUrl(fotoPermanente, telefono);
                    if (urlNube != null) {
                        fotoPermanente = urlNube;
                    }
                }
            }

            Cliente cliente = obtenerOCrearCliente(agenciaDestino, telefono, nombreFinal, fotoPermanente, req.origen(),
                    dispositivo, nombreFinal);

            if (cliente == null) {
                log.warn("LÍMITE DE CONTACTOS ALCANZADO: Se ignoró el mensaje de {}.", telefono);
                enviarARobot(telefono,
                        "Lo sentimos, el sistema de atención de esta empresa se encuentra saturado. Intente comunicarse más tarde.",
                        dispositivo.getSessionId(), null, null);
                return;
            }

            guardarMensajeEntrante(req, cliente);

        } catch (Exception e) {
            log.error("Error procesando mensaje entrante de {}: {}", req.from(), e.getMessage(), e);
        }
    }

    @Transactional
    public boolean enviarTextoDesdeCrm(Cliente cliente, String texto, String autor) {
        if (cliente == null || cliente.getAgencia() == null) {
            return false;
        }

        Dispositivo disp = cliente.getDispositivo();
        if (disp == null || !ESTADO_CONNECTED.equals(disp.getEstado())) {
            disp = dispositivoRepository.findFirstByAgenciaIdAndEstado(cliente.getAgencia().getId(), ESTADO_CONNECTED)
                    .orElse(null);
        }

        if (disp == null) {
            log.error("No hay ningún bot conectado para la agencia {}.", cliente.getAgencia().getId());
            return false;
        }

        String telefonoDestino = limpiarTelefono(cliente.getTelefono());
        String waId = enviarARobot(telefonoDestino, texto, disp.getSessionId(), null, null);

        if (waId != null) {
            guardarYNotificarSalida(cliente, texto, Mensaje.TipoMensaje.TEXTO, waId, null, autor);
            return true;
        }
        return false;
    }

    @Transactional
    public void enviarArchivoDesdeCrm(Cliente cliente, MultipartFile file, String nombreOriginal, String urlLocal,
            String autor) {
        if (cliente == null || cliente.getAgencia() == null) {
            return;
        }

        Dispositivo disp = cliente.getDispositivo();
        if (disp == null || !ESTADO_CONNECTED.equals(disp.getEstado())) {
            disp = dispositivoRepository.findFirstByAgenciaIdAndEstado(cliente.getAgencia().getId(), ESTADO_CONNECTED)
                    .orElse(null);
        }

        if (disp == null) {
            log.error("No hay bot disponible para enviar el archivo.");
            return;
        }

        String telefonoDestino = limpiarTelefono(cliente.getTelefono());
        Mensaje.TipoMensaje tipo = inferirTipoArchivo(nombreOriginal, file.getContentType());

        try {
            String base64Data = Base64.getEncoder().encodeToString(file.getBytes());
            String mimeType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
            String waId = enviarArchivoBase64AlBot(telefonoDestino, disp.getSessionId(), base64Data, mimeType,
                    nombreOriginal, tipo);
            if (waId != null) {
                String contenidoMensaje = obtenerContenidoSegunTipo(tipo, nombreOriginal);
                guardarYNotificarSalida(cliente, contenidoMensaje, tipo, waId, urlLocal, autor);
            }
        } catch (IOException e) {
            log.error("Error leyendo bytes del archivo para envío directo", e);
        }
    }

    private String enviarArchivoBase64AlBot(String to, String sessionId, String base64Data,
            String mimeType, String filename, Mensaje.TipoMensaje tipo) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("number", to);
            body.put("sessionId", sessionId);
            body.put("base64", base64Data);
            body.put("mimetype", mimeType);
            body.put("filename", filename);
            body.put("type", mapearTipoParaBot(tipo));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(API_KEY_HEADER, botSecretKey);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            @SuppressWarnings({ "rawtypes", "null" })
            ResponseEntity<Map> response = http.exchange(
                    getNodeBotUrl() + "/send-media", HttpMethod.POST, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                @SuppressWarnings("null")
                Object idObj = response.getBody().get("id");
                return idObj != null ? idObj.toString() : "WA_" + System.currentTimeMillis();
            }
        } catch (Exception e) {
            log.error("Error enviando archivo base64 al bot: {}", e.getMessage());
        }
        return null;
    }

    private String obtenerContenidoSegunTipo(Mensaje.TipoMensaje tipo, String nombreArchivo) {
        return switch (tipo) {
            case IMAGEN ->
                "Imagen";
            case VIDEO ->
                "Video";
            case AUDIO ->
                "Audio";
            case STICKER ->
                "Sticker";
            default ->
                "Archivo " + nombreArchivo;
        };
    }

    @SuppressWarnings("rawtypes")
    private String enviarARobot(String to, String texto, String sessionId, String urlMedia,
            Mensaje.TipoMensaje tipoMedia) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("number", to);
            body.put("sessionId", sessionId);

            String endpoint;
            if (urlMedia != null && !urlMedia.isEmpty()) {
                body.put("url", urlMedia);
                body.put("message", texto);
                body.put("type", mapearTipoParaBot(tipoMedia));
                endpoint = "/send-media";
            } else {
                body.put("message", texto);
                endpoint = "/send-message";
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(API_KEY_HEADER, botSecretKey);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            String url = getNodeBotUrl() + endpoint;

            @SuppressWarnings("null")
            ResponseEntity<Map> response = http.exchange(url, HttpMethod.POST, request, Map.class);

            Map<?, ?> responseBody = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && responseBody != null) {
                Object idObj = responseBody.get("id");
                return (idObj != null) ? idObj.toString() : "WA_" + System.currentTimeMillis();
            } else {

                log.error("Bot retornó status {}: {}", response.getStatusCode(), response.getBody());
            }
        } catch (RestClientException e) {
            log.error("Error comunicando con Bot: {}", e.getMessage());
        }
        return null;
    }

    private String mapearTipoParaBot(Mensaje.TipoMensaje tipo) {
        if (tipo == null) {
            return "DOCUMENT";
        }
        return switch (tipo) {
            case IMAGEN ->
                "IMAGEN";
            case VIDEO ->
                "VIDEO";
            case AUDIO ->
                "AUDIO";
            case STICKER ->
                "STICKER";
            default ->
                "DOCUMENT";
        };
    }

    @Transactional
    public void procesarCambioDeEstado(MensajeStatusUpdate update) {
        mensajeRepository.findByWhatsappId(update.whatsappId()).ifPresent(mensaje -> {
            Mensaje.EstadoMensaje nuevoEstado = mapEstado(update.status());

            if (esAvanceDeEstado(mensaje.getEstado(), nuevoEstado)) {
                mensaje.setEstado(nuevoEstado);
                mensajeRepository.save(mensaje);
                notificarCambioEstadoFrontend(mensaje.getCliente().getId(), mensaje.getWhatsappId(), nuevoEstado);
            }
        });
    }

    @Transactional
    public void marcarChatComoLeidoEnWhatsApp(Long clienteId) {
        @SuppressWarnings("null")
        Cliente cliente = clienteRepository.findById(clienteId).orElse(null);
        if (cliente == null || cliente.getDispositivo() == null) {
            return;
        }

        Dispositivo disp = cliente.getDispositivo();
        if (!ESTADO_CONNECTED.equals(disp.getEstado())) {
            return;
        }

        List<Mensaje> mensajesEntrantes = mensajeRepository.findUltimosEntrantesPorCliente(clienteId);

        List<String> idsParaMarcar = mensajesEntrantes.stream()
                .filter(m -> m.getWhatsappId() != null)
                .map(Mensaje::getWhatsappId)
                .toList();

        if (!idsParaMarcar.isEmpty()) {
            enviarOrdenLecturaANode(disp.getSessionId(), cliente.getTelefono(), idsParaMarcar);
        }
    }

    @SuppressWarnings("UseSpecificCatch")
    private void enviarOrdenLecturaANode(String sessionId, String telefono, List<String> messageIds) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("sessionId", sessionId);
            body.put("number", limpiarTelefono(telefono));
            body.put("messageIds", messageIds);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(API_KEY_HEADER, botSecretKey);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            http.postForLocation(getNodeBotUrl() + "/chat/read", request);

        } catch (Exception e) {
            log.warn("No se pudo enviar confirmación de lectura a WA: {}", e.getMessage());
        }
    }

    private void notificarCambioEstadoFrontend(Long clienteId, String whatsappId, Mensaje.EstadoMensaje estado) {
        try {
            MensajeStatusEvent payload = new MensajeStatusEvent(whatsappId, estado.name());
            messaging.convertAndSend("/topic/chat/" + clienteId + "/status", payload);
        } catch (MessagingException e) {
            log.warn("Error enviando WebSocket status: {}", e.getMessage());
        }
    }

    private Mensaje.EstadoMensaje mapEstado(String statusStr) {
        if (statusStr == null) {
            return Mensaje.EstadoMensaje.ENVIADO;
        }
        return switch (statusStr.toUpperCase()) {
            case "DELIVERED" ->
                Mensaje.EstadoMensaje.DELIVERED;
            case "READ", "PLAYED" ->
                Mensaje.EstadoMensaje.READ;
            default ->
                Mensaje.EstadoMensaje.ENVIADO;
        };
    }

    private boolean esAvanceDeEstado(Mensaje.EstadoMensaje actual, Mensaje.EstadoMensaje nuevo) {
        if (actual == Mensaje.EstadoMensaje.READ) {
            return false;
        }
        return !(actual == Mensaje.EstadoMensaje.DELIVERED && nuevo == Mensaje.EstadoMensaje.ENVIADO);
    }

    @Transactional
    public Dispositivo crearDispositivo(Agencia agencia, String alias) {
        Dispositivo d = new Dispositivo();
        d.setAgencia(agencia);
        d.setAlias(alias);
        d.setPlataforma(Dispositivo.Plataforma.WHATSAPP);
        d.setSessionId("agencia_" + agencia.getId() + "_" + UUID.randomUUID().toString().substring(0, 8));
        d.setEstado(ESTADO_DISCONNECTED);
        return dispositivoRepository.save(d);
    }

    @Transactional
    public void eliminarDispositivoCompleto(Long dispositivoId) {
        if (dispositivoId == null)
            return;
        Dispositivo disp = dispositivoRepository.findById(dispositivoId)
                .orElseThrow(() -> new RegistroException("Dispositivo no encontrado"));

        // 1. Desconectar del bot (WhatsApp o Telegram)
        try {
            if (disp.getPlataforma() == Dispositivo.Plataforma.TELEGRAM) {
                bridgeService.cerrarSesion(disp.getSessionId());
            } else {
                callNodeReset(disp.getSessionId());
            }
        } catch (Exception e) {
            log.warn("No se pudo cerrar sesión en el bot, pero seguiremos con el borrado.");
        }

        // 2. Desvincular clientes (SET dispositivo_id = NULL) para preservar historial
        clienteRepository.desvincularClientesDeDispositivo(disp.getId());

        // 3. Hard delete: eliminar el registro completamente de la BD
        dispositivoRepository.delete(disp);

        log.info("Dispositivo {} eliminado permanentemente. Clientes desvinculados, historial preservado.",
                disp.getSessionId());
    }

    @Transactional
    public void desvincularSesion(@NonNull Long dispositivoId) {
        Dispositivo d = dispositivoRepository.findById(dispositivoId)
                .orElseThrow(() -> new RuntimeException("Dispositivo no encontrado"));
        callNodeReset(d.getSessionId());
        d.setEstado(ESTADO_DISCONNECTED);
        d.setNumeroTelefono(null);
        dispositivoRepository.save(d);
    }

    private void callNodeReset(String sessionId) {
        try {
            String url = getNodeBotUrl() + "/session/reset";
            Map<String, String> body = Map.of("sessionId", sessionId);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(API_KEY_HEADER, botSecretKey);
            HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
            http.postForLocation(url, request);
        } catch (RestClientException e) {
            log.warn("Reset fallido: {}", e.getMessage());
        }
    }

    public void desvincularRobot(String sessionId) {
        callNodeReset(sessionId);
    }

    private void guardarMensajeEntrante(MensajeEntranteRequest req, Cliente cliente) {

        Mensaje m = new Mensaje();
        m.setCliente(cliente);
        m.setEsSalida(false);
        m.setFechaHora(ahoraArgentina());
        m.setWhatsappId("IN_" + System.currentTimeMillis());
        m.setEstado(Mensaje.EstadoMensaje.READ);

        if (req.mediaUrl() != null && !req.mediaUrl().isEmpty()) {
            m.setUrlArchivo(req.mediaUrl());
            m.setTipo(inferirTipoArchivo(null, req.mimeType()));
            m.setContenido(req.texto() != null && !req.texto().isEmpty() ? req.texto() : "[" + m.getTipo() + "]");
        } else {
            m.setTipo(Mensaje.TipoMensaje.TEXTO);
            m.setContenido(req.texto());
        }

        mensajeRepository.save(m);
        cliente.setUltimoMensajeResumen(m.getContenido());
        cliente.setUltimoMensajeFecha(m.getFechaHora());
        cliente.setMensajesSinLeer(cliente.getMensajesSinLeer() + 1);

        clienteRepository.save(cliente);
        notificarCambio(cliente, m, false);
    }

    private void guardarYNotificarSalida(Cliente c, String cont, Mensaje.TipoMensaje tipo, String waId, String url,
            String autor) {
        Mensaje m = new Mensaje();
        m.setCliente(c);
        m.setContenido(cont);
        m.setEsSalida(true);
        m.setAutor(autor);
        m.setFechaHora(ahoraArgentina());
        m.setWhatsappId(waId);
        m.setTipo(tipo);
        m.setUrlArchivo(url);
        m.setEstado(Mensaje.EstadoMensaje.ENVIADO);

        mensajeRepository.save(m);
        c.setUltimoMensajeResumen((autor != null ? autor : "Tú") + ": " + cont);
        c.setUltimoMensajeFecha(m.getFechaHora());
        c.setMensajesSinLeer(0);
        clienteRepository.save(c);
        notificarCambio(c, m, true);
    }

    private Cliente obtenerOCrearCliente(Agencia agencia, String telefono, String nombre, String photo, String origen,
            Dispositivo dispositivo, String nombreEntrante) {
        Object lock = phoneLocks.computeIfAbsent(telefono, k -> new Object());
        synchronized (lock) {
            try {
                Optional<Cliente> existente = buscarClienteExistente(agencia, telefono, dispositivo);

                if (existente.isPresent()) {
                    return actualizarClienteExistente(existente.get(), agencia, dispositivo, photo, nombreEntrante);
                } else {
                    if (!subscriptionValidationService.puedeRecibirNuevoContacto(agencia)) {
                        notificarLimiteAlcanzado(agencia);
                        return null;
                    }
                    return crearClienteNuevo(agencia, telefono, nombre, photo, origen, dispositivo);
                }
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                log.warn("🛡️ Colisión detectada para el teléfono {}. Recuperando registro...", telefono);
                return clienteRepository
                        .findByAgenciaIdAndTelefonoAndDispositivo(agencia.getId(), telefono, dispositivo)
                        .orElseThrow(() -> new RuntimeException("Error crítico al recuperar cliente tras colisión"));
            } finally {
                phoneLocks.remove(telefono, lock);
            }
        }
    }

    @SuppressWarnings("UseSpecificCatch")
    private void notificarLimiteAlcanzado(Agencia agencia) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("tipo", "LIMIT_REACHED");
            payload.put("titulo", "Límite de Contactos");
            payload.put("mensaje",
                    "Un cliente nuevo intentó escribirte, pero has alcanzado el límite de contactos de tu plan actual. ¡Mejora tu suscripción para no perder ventas!");

            messaging.convertAndSend("/topic/bot/" + agencia.getId(), payload);
        } catch (Exception e) {
            log.warn("No se pudo enviar notificación de límite por WS", e);
        }
    }

    private Optional<Cliente> buscarClienteExistente(Agencia agencia, String telefono, Dispositivo dispositivo) {
        Optional<Cliente> existente = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivoWithLock(
                agencia.getId(), telefono, dispositivo);
        if (existente.isEmpty()) {
            existente = clienteRepository.findByAgenciaIdAndTelefonoAndDispositivoIsNull(agencia.getId(), telefono);
            existente.ifPresent(c -> log.info("📥 Rescatando contacto del Excel: {}. Vinculando a cuenta: {}",
                    c.getNombre(), dispositivo.getAlias()));
        }
        return existente;
    }

    private Cliente actualizarClienteExistente(Cliente c, Agencia agencia, Dispositivo dispositivo, String photo,
            String nombreEntrante) {
        boolean changed = false;
        if (c.getDispositivo() == null) {
            c.setDispositivo(dispositivo);
            changed = true;
        }
        if (nombreEntrante != null && !nombreEntrante.isBlank()
                && !nombreEntrante.startsWith(CLIENTE_DEFAULT_PREFIX)
                && (c.getNombre() == null || "Sin Nombre".equals(c.getNombre())
                        || c.getNombre().startsWith(CLIENTE_DEFAULT_PREFIX))) {
            c.setNombre(nombreEntrante);
            changed = true;
        }
        if (c.getEtapa() == null) {
            etapaRepository.findFirstByAgenciaIdAndEsInicialTrue(agencia.getId()).ifPresent(c::setEtapa);
            changed = true;
        }
        if (photo != null && !photo.isEmpty() && !photo.equals(c.getFotoUrl())) {
            c.setFotoUrl(photo);
            changed = true;
        }
        return changed ? clienteRepository.save(c) : c;
    }

    private Cliente crearClienteNuevo(Agencia agencia, String telefono, String nombre, String photo, String origen,
            Dispositivo dispositivo) {
        String nombreFinal = esNombreInvalido(nombre) ? CLIENTE_DEFAULT_PREFIX + telefono : nombre;
        Cliente n = new Cliente();
        n.setAgencia(agencia);
        n.setTelefono(telefono);
        n.setNombre(nombreFinal);
        n.setFechaRegistro(ahoraArgentina());
        n.setFotoUrl(photo);
        n.setEtapa(etapaRepository.findFirstByAgenciaIdAndEsInicialTrue(agencia.getId()).orElse(null));
        n.setOrigen(origen != null ? origen : "WHATSAPP");
        n.setDispositivo(dispositivo);
        log.info("Intentando crear nuevo contacto único: {}", nombreFinal);
        return clienteRepository.save(n);
    }

    private static boolean esNombreInvalido(String nombre) {
        return nombre == null || nombre.trim().equalsIgnoreCase("Usuario") || nombre.isBlank();
    }

    private void notificarCambio(Cliente c, Mensaje m, boolean esSalida) {
        try {
            messaging.convertAndSend("/topic/chat/" + c.getId(), new ChatNotification(
                    m.getContenido(),
                    !esSalida,
                    m.getFechaHora().toString(),
                    m.getTipo().name(),
                    m.getUrlArchivo(),
                    m.getAutor(),
                    m.getWhatsappId(),
                    m.getEstado().name()));

            messaging.convertAndSend("/topic/embudo/" + c.getAgencia().getId(), new KanbanNotification(
                    c.getId(),
                    c.getNombre(),
                    c.getUltimoMensajeResumen(),
                    c.getMensajesSinLeer(),
                    c.getFotoUrl(),
                    c.getUltimoMensajeFecha() != null ? c.getUltimoMensajeFecha().toString() : null,
                    (c.getEtapa() != null) ? c.getEtapa().getId() : null,
                    c.getOrigen(),
                    (c.getDispositivo() != null) ? c.getDispositivo().getAlias() : "WHATSAPP",
                    esSalida));

        } catch (MessagingException e) {
            log.warn("Error enviando WebSocket (Cliente ID: {}): {}", c.getId(), e.getMessage());
        }
    }

    private String limpiarTelefono(String tel) {
        return util.PhoneUtil.normalizar(tel);
    }

    private Mensaje.TipoMensaje inferirTipoArchivo(String filename, String mimeType) {
        Mensaje.TipoMensaje porMime = inferirTipoDesdeMimeType(mimeType);
        if (porMime != null) {
            return porMime;
        }
        Mensaje.TipoMensaje porExt = inferirTipoDesdeExtension(filename);
        return porExt != null ? porExt : Mensaje.TipoMensaje.DOCUMENTO;
    }

    private Mensaje.TipoMensaje inferirTipoDesdeMimeType(String mimeType) {
        if (mimeType == null)
            return null;
        if (mimeType.startsWith("image")) {
            return "image/webp".equals(mimeType) ? Mensaje.TipoMensaje.STICKER : Mensaje.TipoMensaje.IMAGEN;
        }
        if (mimeType.startsWith("video"))
            return Mensaje.TipoMensaje.VIDEO;
        if (mimeType.startsWith("audio"))
            return Mensaje.TipoMensaje.AUDIO;
        if (mimeType.startsWith("application"))
            return Mensaje.TipoMensaje.DOCUMENTO;
        return null;
    }

    private Mensaje.TipoMensaje inferirTipoDesdeExtension(String filename) {
        if (filename == null)
            return null;
        String ext = filename.toLowerCase();
        if (ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg"))
            return Mensaje.TipoMensaje.IMAGEN;
        if (ext.endsWith(".webp"))
            return Mensaje.TipoMensaje.STICKER;
        if (ext.endsWith(".mp3") || ext.endsWith(".ogg") || ext.endsWith(".wav"))
            return Mensaje.TipoMensaje.AUDIO;
        if (ext.endsWith(".mp4") || ext.endsWith(".mov"))
            return Mensaje.TipoMensaje.VIDEO;
        return null;
    }

    private void notificarAlertaGlobal(String titulo, String mensaje, String tipo) {
        SystemNotification notif = new SystemNotification(
                titulo,
                mensaje,
                tipo,
                null,
                System.currentTimeMillis());
        messaging.convertAndSend("/topic/global-notifications", notif);
    }

    public void actualizarEstadoConexion(String sessionId, String estado) {
        Dispositivo d = dispositivoRepository.findBySessionId(sessionId).orElse(null);
        if (d != null) {
            d.setEstado(estado);
            dispositivoRepository.save(d);

            String tipo = "CONNECTED".equalsIgnoreCase(estado) ? "SUCCESS" : "ERROR";
            String titulo = "WhatsApp " + (d.getAlias() != null ? d.getAlias() : "");
            String msg = "CONNECTED".equalsIgnoreCase(estado) ? "Conexión restablecida ✅" : "Se perdió la conexión ❌";

            notificarAlertaGlobal(titulo, msg, tipo);
        }
    }
}