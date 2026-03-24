package controller;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import jakarta.annotation.PreDestroy;
import repository.DispositivoRepository;
import service.WhatsAppService;
import util.SecurityUtil;

/**
 * Controlador separado para los webhooks del bot de WhatsApp.
 * SIN @RequestMapping a nivel de clase para que los paths sean absolutos:
 *   POST /api/webhook/whatsapp         ← mensajes entrantes
 *   POST /api/webhook/whatsapp/robot   ← mensajes entrantes (alias)
 *   POST /api/webhook/whatsapp/status  ← actualizaciones de estado de sesión
 *   POST /api/webhook/whatsapp/message-status ← ACKs de mensajes
 */
@RestController
public class WhatsAppWebhookController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);
    private static final String HEADER_API_KEY = "X-Bot-Token";

    private final WhatsAppService whatsAppService;
    private final DispositivoRepository dispositivoRepository;
    private final SimpMessagingTemplate messagingTemplate;

    private final ExecutorService msgExecutor = Executors.newFixedThreadPool(4);

    @Value("${bot.secret.key}")
    private String secretKey;

    public WhatsAppWebhookController(WhatsAppService whatsAppService,
                                     DispositivoRepository dispositivoRepository,
                                     SimpMessagingTemplate messagingTemplate) {
        this.whatsAppService = whatsAppService;
        this.dispositivoRepository = dispositivoRepository;
        this.messagingTemplate = messagingTemplate;
    }

    // Records para deserializar los payloads del bot
    public record WebhookPayload(String from, String body, String name, String sessionId,
                                 String profilePicUrl, String origen, String mediaUrl, String mimeType) {}
    public record StatusPayload(String sessionId, String status, String phone, String qr) {}

    // ─── Mensajes entrantes ───────────────────────────────────────────────────

    @PostMapping({"/api/webhook/whatsapp", "/api/webhook/whatsapp/", "/api/webhook/whatsapp/robot"})
    public ResponseEntity<String> receiveFromRobot(
            @RequestHeader(value = HEADER_API_KEY, required = false) String apiKey,
            @RequestBody WebhookPayload payload) {

        if (payload == null) return ResponseEntity.badRequest().body("Payload invalido");
        if (!SecurityUtil.constantTimeEquals(secretKey, apiKey)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        msgExecutor.submit(() -> {
            try {
                whatsAppService.procesarMensajeRobot(new WhatsAppService.MensajeEntranteRequest(
                        payload.from(), payload.body(), payload.name(), payload.sessionId(),
                        payload.profilePicUrl(), payload.origen(), payload.mediaUrl(), payload.mimeType()
                ));
            } catch (Exception e) {
                log.error("Error procesando mensaje: {}", e.getMessage(), e);
            }
        });
        return ResponseEntity.ok("PROCESSED");
    }

    // ─── Estado de sesión (CONNECTED / DISCONNECTED) ─────────────────────────

    @SuppressWarnings("null")
    @PostMapping("/api/webhook/whatsapp/status")
    public ResponseEntity<String> recibirEstado(
            @RequestHeader(value = HEADER_API_KEY, required = false) String apiKey,
            @RequestBody StatusPayload payload) {

        if (!SecurityUtil.constantTimeEquals(secretKey, apiKey)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (payload == null || payload.sessionId() == null) return ResponseEntity.badRequest().body("Payload invalido");

        dispositivoRepository.findBySessionId(payload.sessionId()).ifPresent(d -> {
            d.setEstado(payload.status());
            if ("CONNECTED".equals(payload.status())) {
                d.setActivo(true);
                if (payload.phone() != null) {
                    d.setNumeroTelefono(payload.phone());
                }
            } else if ("DISCONNECTED".equals(payload.status())) {
                d.setActivo(false);
            }
            dispositivoRepository.save(d);

            if (d.getAgencia() != null) {
                messagingTemplate.convertAndSend("/topic/bot/" + d.getAgencia().getId(),
                        Map.of("tipo", payload.status(),
                                "status", payload.status(),
                                "sessionId", payload.sessionId()));
            }
        });
        return ResponseEntity.ok("OK");
    }

    // ─── ACKs de mensajes (ticks de lectura) ─────────────────────────────────

    @PostMapping("/api/webhook/whatsapp/message-status")
    public ResponseEntity<String> recibirCambioEstadoMensaje(
            @RequestHeader(value = HEADER_API_KEY, required = false) String apiKey,
            @RequestBody WhatsAppService.MensajeStatusUpdate dto) {

        if (!SecurityUtil.constantTimeEquals(secretKey, apiKey)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        CompletableFuture.runAsync(() -> {
            try {
                whatsAppService.procesarCambioDeEstado(dto);
            } catch (Exception e) {
                log.error("Error ACK: {}", e.getMessage());
            }
        });
        return ResponseEntity.ok("ACK RECEIVED");
    }

    @PreDestroy
    public void shutdown() {
        msgExecutor.shutdown();
        try {
            if (!msgExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                msgExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            msgExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

}