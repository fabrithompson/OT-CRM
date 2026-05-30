package controller;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import model.Cliente;
import model.Mensaje;
import model.Usuario;
import repository.ClienteRepository;
import repository.UsuarioRepository;
import service.AiAgentService;
import service.ChatService;
import service.CloudStorageService;
import service.TelegramBridgeService;
import service.WhatsAppService;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ChatService chatService;
    private final WhatsAppService whatsAppService;
    private final TelegramBridgeService telegramBridgeService;
    private final ClienteRepository clienteRepository;
    private final CloudStorageService cloudStorageService;
    private final UsuarioRepository usuarioRepository;
    private final AiAgentService aiAgentService;

    @Value("${bot.secret.key}")
    private String botSecretKey;

    public ChatController(ChatService chatService,
                          WhatsAppService whatsAppService,
                          TelegramBridgeService telegramBridgeService,
                          ClienteRepository clienteRepository,
                          CloudStorageService cloudStorageService,
                          UsuarioRepository usuarioRepository,
                          AiAgentService aiAgentService) {
        this.chatService = chatService;
        this.whatsAppService = whatsAppService;
        this.telegramBridgeService = telegramBridgeService;
        this.clienteRepository = clienteRepository;
        this.cloudStorageService = cloudStorageService;
        this.usuarioRepository = usuarioRepository;
        this.aiAgentService = aiAgentService;
    }

    @GetMapping("/{clienteId}/historial")
    public List<Mensaje> historial(@PathVariable @NonNull Long clienteId,
                                   @RequestParam(required = false) Long beforeId,
                                   @RequestParam(defaultValue = "50") int size,
                                   @AuthenticationPrincipal UserDetails userDetails) {
        validarAccesoCliente(clienteId, userDetails);
        return chatService.historialPaginado(clienteId, beforeId, size);
    }

    @PostMapping("/{clienteId}/send")
    public ResponseEntity<Void> send(@PathVariable @NonNull Long clienteId,
                                     @RequestParam("text") String texto,
                                     @AuthenticationPrincipal UserDetails userDetails) {

        Usuario usuario = getUsuario(userDetails);
        String nombreAutor = usuario.getUsername();

        Cliente cliente = validarAccesoCliente(clienteId, userDetails);

        boolean enviado;
        if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
            telegramBridgeService.enviarMensajeDesdeCrm(cliente, texto, nombreAutor);
            enviado = true;
        } else {
            enviado = whatsAppService.enviarTextoDesdeCrm(cliente, texto, nombreAutor);
        }

        if (!enviado) {
            return ResponseEntity.status(503).build();
        }
        return ResponseEntity.ok().build();
    }

    /**
     * Envío de archivo en dos etapas para evitar timeouts del proxy:
     * 1. Sincrónico: envía al bot (rápido, base64) y persiste el Mensaje con
     *    urlArchivo=null. Difunde el mensaje por WS para que el chat lo muestre.
     * 2. Asincrónico: sube a Cloudinary en background. Cuando termina,
     *    {@code WhatsAppService.completarUrlArchivo} actualiza el Mensaje y
     *    emite un evento WS con la URL para que el frontend complete el bubble
     *    y agregue el item a la galería de multimedia.
     *
     * Antes lo hacíamos sincrónico, pero la transcodificación de audio en
     * Cloudinary podía exceder el timeout del proxy y devolver 502.
     */
    @SuppressWarnings("null")
    @PostMapping("/{clienteId}/send-file")
    public ResponseEntity<Map<String, Object>> sendFile(@PathVariable @NonNull Long clienteId,
                                         @RequestPart("file") MultipartFile file,
                                         @RequestParam(value = "filename", required = false) String filename,
                                         @AuthenticationPrincipal UserDetails userDetails) {

        Usuario usuario = getUsuario(userDetails);
        String autor = usuario.getUsername();
        Cliente cliente = validarAccesoCliente(clienteId, userDetails);

        // Validate file is not empty
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Archivo vacio");
        }

        String nombreFinal = (filename != null && !filename.isEmpty())
                ? filename.replaceAll("[^a-zA-Z0-9._-]", "_")
                : (file.getOriginalFilename() != null
                    ? file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                    : "archivo_" + System.currentTimeMillis());

        // Leer bytes en memoria antes de que el request se cierre
        byte[] fileBytes;
        try {
            fileBytes = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Error leyendo archivo");
        }

        if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
            // Telegram exige URL pública, sigue siendo sincrónico
            String url = cloudStorageService.uploadBytes(fileBytes, nombreFinal);
            telegramBridgeService.enviarArchivoDesdeCrm(cliente, url, nombreFinal, autor);
            return ResponseEntity.ok(Map.of("status", "SENT", "url", url));
        }

        // WhatsApp: el bot acepta base64 directo, así que no necesitamos esperar
        // a Cloudinary para enviar el mensaje. Persistimos el Mensaje con
        // urlArchivo=null y completamos la URL cuando termine el upload async.
        String contentType = file.getContentType();
        Mensaje mensaje = whatsAppService.enviarArchivoDesdeCrm(
                cliente, fileBytes, contentType, nombreFinal, null, autor);
        if (mensaje == null) {
            return ResponseEntity.status(503).body(Map.of("error", "Bot no disponible o sesión desconectada"));
        }

        // Upload a Cloudinary en background. Cuando completa, actualiza el
        // Mensaje en BD y notifica al frontend por WS con la URL final.
        Long mensajeId = mensaje.getId();
        cloudStorageService.uploadFileAsync(fileBytes, nombreFinal)
                .thenAccept(urlPublica -> whatsAppService.completarUrlArchivo(mensajeId, urlPublica))
                .exceptionally(ex -> {
                    log.error("Fallo upload async Cloudinary mensaje {}: {}", mensajeId, ex.getMessage());
                    return null;
                });

        return ResponseEntity.ok(Map.of("status", "SENT", "mensajeId", mensajeId));
    }

    @GetMapping("/metrics")
    public Map<String, Object> metrics(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return Map.of("nuevos_24h", 0L);

        LocalDateTime hace24h = LocalDateTime.now().minusHours(24);
        long nuevos = chatService.contarNuevosDesde(hace24h, usuario.getAgencia().getId());

        return Map.of("nuevos_24h", nuevos);
    }

    @PostMapping("/incoming")
    public ResponseEntity<Void> incoming(
            @RequestHeader("X-Bot-Token") String token,
            @RequestBody Map<String, Object> payload) {

        if (!botSecretKey.equals(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Object rawId = payload.get("clienteId");
        Object rawMsg = payload.get("message");
        if (rawId == null || rawMsg == null) {
            return ResponseEntity.badRequest().build();
        }

        Long clienteId;
        try {
            clienteId = Long.valueOf(rawId.toString());
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().build();
        }

        aiAgentService.processCustomerMessage(clienteId, rawMsg.toString());
        return ResponseEntity.ok().build();
    }

    private Usuario getUsuario(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuario no autenticado"));
    }

    private Cliente validarAccesoCliente(@NonNull Long clienteId, UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        Cliente cliente = clienteRepository.findById(clienteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));

        if (usuario.getAgencia() == null || !cliente.getAgencia().getId().equals(usuario.getAgencia().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sin acceso a este cliente");
        }
        return cliente;
    }
}