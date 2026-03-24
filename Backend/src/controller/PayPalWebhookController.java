package controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import model.ProcessedWebhook;
import repository.ProcessedWebhookRepository;
import service.PlanService;

@RestController
public class PayPalWebhookController {

    private static final Logger log = LoggerFactory.getLogger(PayPalWebhookController.class);

    @Autowired
    private PlanService planService;

    @Autowired
    private ProcessedWebhookRepository processedWebhookRepository;

    @Value("${paypal.client.id}")
    private String paypalClientId;

    @Value("${paypal.client.secret}")
    private String paypalClientSecret;

    @Value("${paypal.mode:sandbox}")
    private String paypalMode;

    @Value("${paypal.webhook.id:}")
    private String paypalWebhookId;

    private final RestTemplate restTemplate;

    public PayPalWebhookController() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
    }

    @PostMapping("/api/paypal/webhook")
    public ResponseEntity<String> recibirWebhook(
            @RequestHeader(value = "PAYPAL-TRANSMISSION-ID", required = false) String transmissionId,
            @RequestHeader(value = "PAYPAL-TRANSMISSION-TIME", required = false) String transmissionTime,
            @RequestHeader(value = "PAYPAL-CERT-URL", required = false) String certUrl,
            @RequestHeader(value = "PAYPAL-AUTH-ALGO", required = false) String authAlgo,
            @RequestHeader(value = "PAYPAL-TRANSMISSION-SIG", required = false) String transmissionSig,
            @RequestBody String payload) {
        try {
            // Verificar firma PayPal antes de procesar
            if (paypalWebhookId != null && !paypalWebhookId.isBlank()) {
                if (!verificarFirmaPayPal(transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig, payload)) {
                    log.warn("Webhook PayPal con firma inválida rechazado");
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
                }
            } else {
                log.warn("PAYPAL_WEBHOOK_ID no configurado — omitiendo verificación de firma");
            }

            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(payload);

            String eventType = node.path("event_type").asText();
            String eventId = node.path("id").asText(); // ID único del evento PayPal
            log.info("Webhook de PayPal recibido: {} (id: {})", eventType, eventId);

            // Idempotencia: si ya procesamos este evento, responder OK sin reprocesar
            String eventKey = "PP_" + eventId;
            if (eventId != null && !eventId.isBlank() && processedWebhookRepository.existsById(eventKey)) {
                log.info("Webhook PayPal duplicado ignorado: {}", eventKey);
                return ResponseEntity.ok("ALREADY_PROCESSED");
            }

            JsonNode resource = node.path("resource");
            String customId = resource.path("custom_id").asText();

            if (customId == null || customId.isEmpty() || "null".equals(customId)) {
                customId = resource.path("custom").asText();
            }

            if ("PAYMENT.SALE.COMPLETED".equals(eventType) || "BILLING.SUBSCRIPTION.ACTIVATED".equals(eventType)) {
                if (customId != null && customId.contains("|")) {
                    String[] partes = customId.split("\\|");
                    if (partes.length >= 2) {
                        long usuarioId = Long.parseLong(partes[0]);
                        long planId = Long.parseLong(partes[1]);

                        planService.activarPlanPorPago(usuarioId, planId, "PayPal");
                        log.info("PayPal: Plan {} activado para usuario {}", planId, usuarioId);
                    }
                }
            }

            else if ("BILLING.SUBSCRIPTION.CANCELLED".equals(eventType) ||
                    "BILLING.SUBSCRIPTION.EXPIRED".equals(eventType) ||
                    "BILLING.SUBSCRIPTION.SUSPENDED".equals(eventType)) {

                if (customId != null && customId.contains("|")) {
                    long usuarioId = Long.parseLong(customId.split("\\|")[0]);

                    planService.cancelarPlanPorSuscripcion(usuarioId);
                    log.info("Suscripción PayPal cancelada para usuario ID: {}", usuarioId);
                }
            }

            // Marcar como procesado después del éxito
            if (eventId != null && !eventId.isBlank()) {
                processedWebhookRepository.save(new ProcessedWebhook(eventKey, "PAYPAL"));
            }

            return ResponseEntity.ok("WEBHOOK_PROCESSED");
        } catch (JsonProcessingException | NumberFormatException e) {
            log.error("Error procesando Webhook de PayPal: {}", e.getMessage());
            return ResponseEntity.ok("ERROR");
        }
    }

    @SuppressWarnings("unchecked")
    private boolean verificarFirmaPayPal(String transmissionId, String transmissionTime,
            String certUrl, String authAlgo, String transmissionSig, String body) {
        try {
            String baseUrl = "sandbox".equals(paypalMode)
                    ? "https://api-m.sandbox.paypal.com"
                    : "https://api-m.paypal.com";

            // 1. Obtener access token con client credentials
            HttpHeaders tokenHeaders = new HttpHeaders();
            tokenHeaders.setBasicAuth(paypalClientId, paypalClientSecret);
            tokenHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            ResponseEntity<Map> tokenResp = restTemplate.exchange(
                    baseUrl + "/v1/oauth2/token",
                    HttpMethod.POST,
                    new HttpEntity<>("grant_type=client_credentials", tokenHeaders),
                    Map.class);
            String accessToken = (String) tokenResp.getBody().get("access_token");

            // 2. Verificar firma contra la API de PayPal
            HttpHeaders verifyHeaders = new HttpHeaders();
            verifyHeaders.setContentType(MediaType.APPLICATION_JSON);
            verifyHeaders.setBearerAuth(accessToken);

            Map<String, Object> verifyBody = new HashMap<>();
            verifyBody.put("transmission_id", transmissionId);
            verifyBody.put("transmission_time", transmissionTime);
            verifyBody.put("cert_url", certUrl);
            verifyBody.put("auth_algo", authAlgo);
            verifyBody.put("transmission_sig", transmissionSig);
            verifyBody.put("webhook_id", paypalWebhookId);
            verifyBody.put("webhook_event", new ObjectMapper().readTree(body));

            ResponseEntity<Map> verifyResp = restTemplate.exchange(
                    baseUrl + "/v1/notifications/verify-webhook-signature",
                    HttpMethod.POST,
                    new HttpEntity<>(verifyBody, verifyHeaders),
                    Map.class);

            return verifyResp.getBody() != null
                    && "SUCCESS".equals(verifyResp.getBody().get("verification_status"));
        } catch (Exception e) {
            log.error("Error verificando firma PayPal: {}", e.getMessage());
            return false;
        }
    }
}