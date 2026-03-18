package controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import service.PlanService;

@RestController
public class PayPalWebhookController {

    private static final Logger log = LoggerFactory.getLogger(PayPalWebhookController.class);

    @Autowired
    private PlanService planService;

    @PostMapping("/api/paypal/webhook")
    public ResponseEntity<String> recibirWebhook(@RequestBody String payload) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(payload);

            String eventType = node.path("event_type").asText();
            log.info("🔔 Webhook de PayPal recibido: {}", eventType);

            JsonNode resource = node.path("resource");
            String customId = resource.path("custom_id").asText();

            if (customId == null || customId.isEmpty() || "null".equals(customId)) {
                customId = resource.path("custom").asText();
            }

            if ("PAYMENT.SALE.COMPLETED".equals(eventType) || "BILLING.SUBSCRIPTION.ACTIVATED".equals(eventType)) {
                if (customId != null && customId.contains("|")) {
                    String[] partes = customId.split("\\|");
                    long usuarioId = Long.parseLong(partes[0]);
                    long planId = Long.parseLong(partes[1]);

                    planService.activarPlanPorPago(usuarioId, planId, "PayPal");
                    log.info("✅ PayPal: Plan {} activado para usuario {}", planId, usuarioId);
                }
            }

            else if ("BILLING.SUBSCRIPTION.CANCELLED".equals(eventType) ||
                    "BILLING.SUBSCRIPTION.EXPIRED".equals(eventType) ||
                    "BILLING.SUBSCRIPTION.SUSPENDED".equals(eventType)) {

                if (customId != null && customId.contains("|")) {
                    long usuarioId = Long.parseLong(customId.split("\\|")[0]);

                    planService.cancelarPlanPorSuscripcion(usuarioId);
                    log.info("info: Suscripción cancelada para el usuario ID: {}", usuarioId);
                }
            }

            return ResponseEntity.ok("WEBHOOK_PROCESSED");
        } catch (JsonProcessingException | NumberFormatException e) {
            log.error("❌ Error procesando Webhook de PayPal: {}", e.getMessage());
            return ResponseEntity.ok("ERROR");
        }
    }
}