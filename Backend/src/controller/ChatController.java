package controller;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
    private final SimpMessagingTemplate messaging;

    public ChatController(ChatService chatService,
                          WhatsAppService whatsAppService,
                          TelegramBridgeService telegramBridgeService,
                          ClienteRepository clienteRepository,
                          CloudStorageService cloudStorageService,
                          UsuarioRepository usuarioRepository,
                          SimpMessagingTemplate messaging) {
        this.chatService = chatService;
        this.whatsAppService = whatsAppService;
        this.telegramBridgeService = telegramBridgeService;
        this.clienteRepository = clienteRepository;
        this.cloudStorageService = cloudStorageService;
        this.usuarioRepository = usuarioRepository;
        this.messaging = messaging;
    }

    @GetMapping("/{clienteId}/historial")
    public List<Mensaje> historial(@PathVariable @NonNull Long clienteId, @AuthenticationPrincipal UserDetails userDetails) {
        validarAccesoCliente(clienteId, userDetails);
        return chatService.historial(clienteId);
    }

    @PostMapping("/{clienteId}/send")
    public ResponseEntity<Void> send(@PathVariable @NonNull Long clienteId,
                                     @RequestParam("text") String texto,
                                     @AuthenticationPrincipal UserDetails userDetails) {

        Usuario usuario = getUsuario(userDetails);
        String nombreAutor = usuario.getUsername();

        Cliente cliente = validarAccesoCliente(clienteId, userDetails);

        if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
            telegramBridgeService.enviarMensajeDesdeCrm(cliente, texto, nombreAutor);
        } else {
            whatsAppService.enviarTextoDesdeCrm(cliente, texto, nombreAutor);
        }

        return ResponseEntity.ok().build();
    }

    /**
     * Envío de archivo con upload asíncrono a Cloudinary.
     * 1. Lee los bytes del archivo en memoria inmediatamente
     * 2. Envía al bot de WhatsApp/Telegram (rápido, base64 directo)
     * 3. Sube a Cloudinary en background (sin bloquear al usuario)
     * 4. Cuando Cloudinary responde, notifica al frontend por WebSocket
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

        String nombreFinal = (filename != null && !filename.isEmpty())
                ? filename
                : file.getOriginalFilename();

        // Leer bytes en memoria antes de que el request se cierre
        byte[] fileBytes;
        try {
            fileBytes = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Error leyendo archivo");
        }

        // Enviar al bot inmediatamente (no depende de Cloudinary)
        if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
            // Telegram necesita URL, hacer upload sincrónico en este caso
            String url = cloudStorageService.uploadBytes(fileBytes, nombreFinal);
            telegramBridgeService.enviarArchivoDesdeCrm(cliente, url, nombreFinal, autor);
            return ResponseEntity.ok(Map.of("status", "SENT", "url", url));
        }

        // WhatsApp: enviar base64 directo al bot, subir a Cloudinary async
        whatsAppService.enviarArchivoDesdeCrm(cliente, file, nombreFinal, null, autor);

        // Upload a Cloudinary en background — no bloquea la respuesta HTTP
        String uploadId = UUID.randomUUID().toString().substring(0, 8);
        cloudStorageService.uploadFileAsync(fileBytes, nombreFinal).thenAccept(urlPublica -> {
            log.info("Upload async completado para cliente {}: {}", clienteId, urlPublica);
            // Notificar al frontend que la URL del archivo está lista
            messaging.convertAndSend("/topic/chat/" + clienteId + "/upload",
                    Map.of("uploadId", uploadId, "url", urlPublica, "status", "COMPLETED"));
        }).exceptionally(ex -> {
            log.error("Error en upload async para cliente {}: {}", clienteId, ex.getMessage());
            messaging.convertAndSend("/topic/chat/" + clienteId + "/upload",
                    Map.of("uploadId", uploadId, "status", "FAILED", "error", ex.getMessage()));
            return null;
        });

        // Respuesta inmediata: archivo enviado, upload en progreso
        return ResponseEntity.ok(Map.of("status", "PROCESSING", "uploadId", uploadId));
    }

    @GetMapping("/metrics")
    public Map<String, Object> metrics(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return Map.of("nuevos_24h", 0L);

        LocalDateTime hace24h = LocalDateTime.now().minusHours(24);
        long nuevos = chatService.contarNuevosDesde(hace24h, usuario.getAgencia().getId());

        return Map.of("nuevos_24h", nuevos);
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