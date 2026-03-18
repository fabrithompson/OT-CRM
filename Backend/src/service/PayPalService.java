package service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import model.Plan;
import model.Usuario;

@Service
public class PayPalService {

    @Value("${paypal.client.id}") private String clientId;
    @Value("${paypal.client.secret}") private String clientSecret;
    @Value("${paypal.mode:sandbox}") private String mode;
    
    @Value("${app.base.url}") private String baseUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    @SuppressWarnings("null")
    public String obtenerLinkSuscripcion(Usuario usuario, Plan plan) {
        String urlBase = mode.equals("live") ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth(clientId, clientSecret);
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        HttpEntity<String> authRequest = new HttpEntity<>("grant_type=client_credentials", headers);

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> authResponse = restTemplate.postForEntity(
                urlBase + "/v1/oauth2/token", authRequest, (Class<Map<String, Object>>) (Class<?>) Map.class);

        Map<String, Object> authBody = authResponse.getBody();
        if (authBody == null) {
            throw new IllegalStateException("PayPal no devolvio cuerpo al obtener el token de acceso.");
        }
        String accessToken = (String) authBody.get("access_token");

        headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = new HashMap<>();
        body.put("plan_id", plan.getPaypalPlanId());
        body.put("custom_id", usuario.getId() + "|" + plan.getId());

        body.put("application_context", Map.of(
                "return_url", baseUrl + "/planes?pago=exitoso",
                "cancel_url", baseUrl + "/dashboard"
        ));

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                urlBase + "/v1/billing/subscriptions", request, (Class<Map<String, Object>>) (Class<?>) Map.class);

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null) {
            throw new IllegalStateException("PayPal no devolvio cuerpo al crear la suscripcion.");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, String>> links = (List<Map<String, String>>) responseBody.get("links");
        return links.stream()
                .filter(l -> l.get("rel").equals("approve"))
                .findFirst()
                .map(l -> l.get("href"))
                .orElse(null);
    }
}