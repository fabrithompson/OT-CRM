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
     * Envío de archivo con upload sincrónico a Cloudinary.
     * 1. Lee los bytes del archivo en memoria
     * 2. Sube a Cloudinary y obtiene la URL pública
     * 3. Persiste el Mensaje con urlArchivo y envía al bot (WhatsApp/Telegram)
     * 4. Difunde el mensaje saliente por WebSocket con la URL ya disponible
     *    para que la imagen/audio se renderice en el chat y aparezca en multimedia.
     *
     * Se descartó el flujo async previo porque dejaba urlArchivo=null en la
     * base de datos: el mensaje aparecía vacío y nunca se actualizaba al
     * terminar la subida a Cloudinary.
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

        // Subir a Cloudinary primero para tener la URL antes de persistir/notificar.
        // Si falla, no avanzamos al bot porque sin URL la UI del chat queda en blanco.
        String urlPublica;
        try {
            urlPublica = cloudStorageService.uploadBytes(fileBytes, nombreFinal);
        } catch (RuntimeException e) {
            log.error("Fallo subiendo archivo a Cloudinary para cliente {}: {}", clienteId, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "No se pudo subir el archivo al almacenamiento"));
        }

        if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
            telegramBridgeService.enviarArchivoDesdeCrm(cliente, urlPublica, nombreFinal, autor);
            return ResponseEntity.ok(Map.of("status", "SENT", "url", urlPublica));
        }

        // WhatsApp: el bot recibe base64 (más rápido que esperar a que descargue la URL)
        // y el Mensaje en BD/WS se guarda con la URL pública de Cloudinary.
        String contentType = file.getContentType();
        boolean enviado = whatsAppService.enviarArchivoDesdeCrm(
                cliente, fileBytes, contentType, nombreFinal, urlPublica, autor);
        if (!enviado) {
            return ResponseEntity.status(503).body(Map.of("error", "Bot no disponible o sesión desconectada"));
        }

        return ResponseEntity.ok(Map.of("status", "SENT", "url", urlPublica));
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