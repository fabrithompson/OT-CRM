package controller;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import model.Plan;
import model.ProcessedWebhook;
import model.Usuario;
import repository.PlanRepository;
import repository.ProcessedWebhookRepository;
import repository.UsuarioRepository;
import service.PlanService;

@RestController
public class MercadoPagoController {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoController.class);

    @Value("${mercadopago.access.token}")
    private String mpAccessToken;

    @Value("${mercadopago.webhook.secret:}")
    private String mpWebhookSecret;

    @Value("${app.base.url}")
    private String baseUrl;

    private final PlanService planService;
    private final PlanRepository planRepository;
    private final UsuarioRepository usuarioRepository;
    private final ProcessedWebhookRepository processedWebhookRepository;
    private final RestTemplate restTemplate = crearRestTemplate();

    public MercadoPagoController(PlanService planService, PlanRepository planRepository,
                                 UsuarioRepository usuarioRepository, ProcessedWebhookRepository processedWebhookRepository) {
        this.planService = planService;
        this.planRepository = planRepository;
        this.usuarioRepository = usuarioRepository;
        this.processedWebhookRepository = processedWebhookRepository;
    }

    private RestTemplate crearRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        return new RestTemplate(factory);
    }

    @PostMapping("/api/v1/mp/crear-suscripcion")
    public ResponseEntity<Map<String, Object>> crearSuscripcion(
            @RequestParam Long planId,
            @RequestParam(required = false) String payerEmail,
            @AuthenticationPrincipal UserDetails userDetails) {
        try {
            @SuppressWarnings("null")
            Plan plan = planRepository.findById(planId)
                    .orElseThrow(() -> new IllegalArgumentException("Plan no encontrado"));
            Usuario usuario = usuarioRepository.findByUsername(userDetails.getUsername())
                    .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));

            // Usar el email provisto por el usuario en el checkout, o el del CRM como fallback
            String emailPagador = (payerEmail != null && !payerEmail.isBlank()) ? payerEmail : usuario.getEmail();

            Map<String, Object> body = new HashMap<>();
            body.put("reason",              "CRM O'T - Plan " + plan.getNombre());
            body.put("payer_email",         emailPagador);
            body.put("back_url",            baseUrl + "/planes?pago=exitoso");
            body.put("external_reference",  usuario.getId() + "|" + planId);
            body.put("status",              "pending");
            body.put("auto_recurring", Map.of(
                "frequency",          1,
                "frequency_type",     "months",
                "transaction_amount", plan.getPrecioMensual(),
                "currency_id",        "ARS"
            ));

            ResponseEntity<Map<String, Object>> response = llamarMP("/preapproval", HttpMethod.POST, body);
            Map<String, Object> respBody = response.getBody();

            if (respBody == null) {
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "Respuesta vacía de MercadoPago"));
            }

            return ResponseEntity.ok(Map.of(
                "initPoint",     respBody.getOrDefault("init_point", ""),
                "suscripcionId", respBody.getOrDefault("id", "")
            ));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (HttpStatusCodeException e) {
            String respBody = e.getResponseBodyAsString();
            log.error("MP API Error: {} - {}", e.getStatusCode(), respBody);

            // Try to extract a meaningful error message from MP response
            String errorMsg = "Rechazado por MercadoPago.";
            try {
                JsonNode errorJson = new ObjectMapper().readTree(respBody);
                String mpMessage = errorJson.path("message").asText("");
                if (!mpMessage.isBlank()) {
                    errorMsg = "MercadoPago: " + mpMessage;
                }
            } catch (Exception ignored) { /* use generic message */ }

            return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", errorMsg));
        } catch (RestClientException e) {
            log.error("MP Connection Error: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "Error de conexión con MercadoPago. Intentá de nuevo."));
        }
    }

    @PostMapping("/api/mp/webhook")
    public ResponseEntity<String> recibirWebhook(
            @RequestHeader(value = "x-signature", required = false) String xSignature,
            @RequestHeader(value = "x-request-id", required = false) String xRequestId,
            @RequestBody(required = false) String body,
            @RequestParam(required = false) String type,
            @RequestParam(required = false, name = "data.id") String dataId) {
        try {
            log.info("WEBHOOK MP - type: {} - id: {}", type, dataId);
            if (dataId == null || type == null) return ResponseEntity.ok("OK");

            // Verificar firma HMAC-SHA256 si el secret está configurado
            if (mpWebhookSecret != null && !mpWebhookSecret.isBlank()) {
                if (!verificarFirmaMercadoPago(xSignature, xRequestId, dataId)) {
                    log.warn("Webhook MercadoPago con firma inválida rechazado");
                    return ResponseEntity.status(org.springframework.http.HttpStatus.UNAUTHORIZED).build();
                }
            } else {
                log.warn("MERCADOPAGO_WEBHOOK_SECRET no configurado — omitiendo verificación de firma");
            }

            // Idempotencia: si ya procesamos este evento, responder OK sin reprocesar
            String eventKey = "MP_" + type + "_" + dataId;
            if (processedWebhookRepository.existsById(eventKey)) {
                log.info("Webhook MP duplicado ignorado: {}", eventKey);
                return ResponseEntity.ok("ALREADY_PROCESSED");
            }

            switch (type) {
                case "payment" -> procesarPago(dataId);
                case "subscription_authorized_payment" -> procesarPagoSuscripcionRecurrente(dataId);
                case "subscription_preapproval" -> procesarCambioSuscripcion(dataId);
                default -> log.info("Evento MP no rastreado: {}", type);
            }

            // Marcar como procesado después del éxito
            processedWebhookRepository.save(new ProcessedWebhook(eventKey, "MERCADOPAGO"));
            return ResponseEntity.status(HttpStatus.OK).body("OK");

        } catch (JsonProcessingException | RestClientException e) {
            log.error("Error procesando webhook: ", e);
            return ResponseEntity.status(HttpStatus.OK).body("ERROR");
        }
    }

    private void procesarPago(String pagoId) throws JsonProcessingException, RestClientException {
        JsonNode pago = consultarMP("/v1/payments/" + pagoId);
        String status = pago.path("status").asText();
        String externalRef = pago.path("external_reference").asText();

        if (externalRef == null || externalRef.isBlank() || "null".equals(externalRef)) {
            String preapprovalId = pago.path("preapproval_id").asText();
            if (preapprovalId.isBlank()) preapprovalId = pago.path("metadata").path("preapproval_id").asText();
            if (!preapprovalId.isBlank()) {
                JsonNode sub = consultarMP("/preapproval/" + preapprovalId);
                externalRef = sub.path("external_reference").asText();
            }
        }

        if ("approved".equals(status) && externalRef != null && externalRef.contains("|")) {
            activarPlanDesdeRef(externalRef);
        }
    }

    private void procesarPagoSuscripcionRecurrente(String preapprovalId) throws JsonProcessingException, RestClientException {
        JsonNode sub = consultarMP("/preapproval/" + preapprovalId);
        String status = sub.path("status").asText();
        String externalRef = sub.path("external_reference").asText();

        if (("authorized".equals(status) || "active".equals(status)) && externalRef != null && externalRef.contains("|")) {
            activarPlanDesdeRef(externalRef);
        }
    }

    private void procesarCambioSuscripcion(String suscripcionId) throws JsonProcessingException, RestClientException {
        JsonNode sub = consultarMP("/preapproval/" + suscripcionId);
        String status = sub.path("status").asText();
        String externalRef = sub.path("external_reference").asText();

        if (("cancelled".equals(status) || "paused".equals(status)) && externalRef != null && externalRef.contains("|")) {
            String[] partes = externalRef.split("\\|");
            long usuarioId = Long.parseLong(partes[0]);
            Plan planFree = planRepository.findByNombre("FREE").orElseThrow(() -> new IllegalStateException("Plan FREE no encontrado"));
            planService.cambiarPlan(usuarioId, planFree.getId());
        }
    }

    private void activarPlanDesdeRef(String externalRef) {
        try {
            String[] partes = externalRef.split("\\|");
            if (partes.length < 2) {
                log.error("External reference con formato invalido: '{}'", externalRef);
                return;
            }
            planService.activarPlanPorPago(Long.parseLong(partes[0]), Long.parseLong(partes[1]), "Mercado Pago");
        } catch (NumberFormatException e) {
            log.error("External reference con IDs no numericos: '{}'", externalRef);
        } catch (RuntimeException e) {
            log.error("Error activando plan desde ref '{}': {}", externalRef, e.getMessage());
        }
    }

    @SuppressWarnings("null")
    private JsonNode consultarMP(String path) throws JsonProcessingException, RestClientException {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mpAccessToken);
        return new ObjectMapper().readTree(restTemplate.exchange("https://api.mercadopago.com" + path, HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody());
    }

    @SuppressWarnings({ "null", "unchecked" })
    private ResponseEntity<Map<String, Object>> llamarMP(String path, HttpMethod method, Map<String, Object> body) throws RestClientException {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(mpAccessToken);
        return (ResponseEntity<Map<String, Object>>) (ResponseEntity<?>) restTemplate.exchange("https://api.mercadopago.com" + path, method, new HttpEntity<>(body, headers), Map.class);
    }

    private boolean verificarFirmaMercadoPago(String xSignature, String xRequestId, String dataId) {
        try {
            if (xSignature == null || xSignature.isBlank()) return false;

            // Parsear ts y v1 de "ts=<timestamp>,v1=<hash>"
            String ts = null;
            String v1 = null;
            for (String part : xSignature.split(",")) {
                String[] kv = part.trim().split("=", 2);
                if (kv.length == 2) {
                    if ("ts".equals(kv[0])) ts = kv[1];
                    else if ("v1".equals(kv[0])) v1 = kv[1];
                }
            }
            if (ts == null || v1 == null) return false;

            // Construir el mensaje firmado: id:<dataId>;request-id:<xRequestId>;ts:<ts>;
            String manifest = "id:" + dataId + ";request-id:" + (xRequestId != null ? xRequestId : "") + ";ts:" + ts + ";";

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(mpWebhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] computed = mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8));

            // Convertir a hex y comparar
            StringBuilder sb = new StringBuilder();
            for (byte b : computed) sb.append(String.format("%02x", b));
            return sb.toString().equals(v1);
        } catch (Exception e) {
            log.error("Error verificando firma MercadoPago: {}", e.getMessage());
            return false;
        }
    }
}