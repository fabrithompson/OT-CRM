package controller;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
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

import exception.FileStorageException;
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

    private final ChatService chatService;
    private final WhatsAppService whatsAppService;
    private final TelegramBridgeService telegramBridgeService;
    private final ClienteRepository clienteRepository;
    private final CloudStorageService cloudStorageService;
    private final UsuarioRepository usuarioRepository;

    public ChatController(ChatService chatService,
                          WhatsAppService whatsAppService,
                          TelegramBridgeService telegramBridgeService,
                          ClienteRepository clienteRepository,
                          CloudStorageService cloudStorageService,
                          UsuarioRepository usuarioRepository) {
        this.chatService = chatService;
        this.whatsAppService = whatsAppService;
        this.telegramBridgeService = telegramBridgeService;
        this.clienteRepository = clienteRepository;
        this.cloudStorageService = cloudStorageService;
        this.usuarioRepository = usuarioRepository;
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

    @PostMapping("/{clienteId}/send-file")
    public ResponseEntity<Void> sendFile(@PathVariable @NonNull Long clienteId,
                                         @RequestPart("file") MultipartFile file,
                                         @RequestParam(value = "filename", required = false) String filename,
                                         @AuthenticationPrincipal UserDetails userDetails) {

        Usuario usuario = getUsuario(userDetails);
        String autor = usuario.getUsername();

        Cliente cliente = validarAccesoCliente(clienteId, userDetails);

        try {
            String urlPublica = cloudStorageService.uploadFile(file);

            String nombreFinal = (filename != null && !filename.isEmpty())
                    ? filename
                    : file.getOriginalFilename();

            if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
                telegramBridgeService.enviarArchivoDesdeCrm(cliente, urlPublica, nombreFinal, autor);
            } else {
                whatsAppService.enviarArchivoDesdeCrm(cliente, file, nombreFinal, urlPublica, autor);
            }

        } catch (FileStorageException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Error al subir archivo a Cloudinary", e);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno al enviar archivo", e);
        }

        return ResponseEntity.ok().build();
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