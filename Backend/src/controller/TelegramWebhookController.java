package controller;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;

import service.TelegramBridgeService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
public class TelegramWebhookController {

    private static final Logger log = LoggerFactory.getLogger(TelegramWebhookController.class);

    private final TelegramBridgeService telegramBridgeService;

    @PostMapping("/webhook")
    public ResponseEntity<String> recibirMensaje(@RequestBody Map<String, Object> payload, HttpServletRequest request) {
        try {
            String deviceSessionId = String.valueOf(payload.get("deviceId"));
            String message = String.valueOf(payload.get("message"));
            String senderPhone = payload.get("senderPhone") != null ? String.valueOf(payload.get("senderPhone")) : "";
            String senderName = String.valueOf(payload.get("senderName"));
            String telegramId = String.valueOf(payload.get("senderId"));
            String messageDate = (String) payload.get("date");
            String avatarUrl = (String) payload.getOrDefault("senderPhoto", "");
            String fileUrl = (String) payload.get("fileUrl");
            String fileType = (String) payload.get("fileType");

            log.info("🔔 [WEBHOOK] IP={} deviceId={} sender={} tipo={}", request.getRemoteAddr(), deviceSessionId, senderName, fileType != null ? fileType : "TEXTO");

            telegramBridgeService.procesarMensajeWebhook(
                    deviceSessionId,
                    telegramId,
                    senderName,
                    senderPhone,
                    message,
                    avatarUrl,
                    fileUrl,
                    fileType,
                    messageDate
            );

            return ResponseEntity.ok("Procesado");
        } catch (Exception e) {
            log.error("💥 Error en Webhook: ", e);
            return ResponseEntity.internalServerError().body("Error");
        }
    }
}