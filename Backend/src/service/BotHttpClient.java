package service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Cliente HTTP único para hablar con el bot Node de WhatsApp ({@code Bot-Whatsapp/index.js}).
 *
 * Centraliza el header {@code X-Bot-Token}, la base URL ({@code node.bot.url}) y la
 * serialización de payloads. Antes esta lógica estaba duplicada en
 * {@code WhatsAppService}, {@code CampaniaService} y {@code CalentamientoService}; si
 * cambia el contrato del bot, ahora solo se actualiza este archivo.
 */
@Component
@SuppressWarnings("null") // RestTemplate.exchange firma @NonNull en parámetros y body, pero null-checking aquí es defensivo.
public class BotHttpClient {

    private static final Logger log = LoggerFactory.getLogger(BotHttpClient.class);
    private static final String HEADER_API_KEY = "X-Bot-Token";
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<Map<String, String>> STRING_MAP_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestTemplate http;

    @Value("${node.bot.url}")
    private String nodeBotUrl;

    @Value("${bot.secret.key}")
    private String botSecretKey;

    public BotHttpClient(RestTemplate http) {
        this.http = http;
    }

    /**
     * URL base del bot, saneada. Algunos hosts añaden comillas alrededor de la
     * variable de entorno al inyectarla, por eso las strippeamos antes de usar.
     */
    public String getBaseUrl() {
        if (nodeBotUrl == null) return "";
        return nodeBotUrl.replace("\"", "").replace("'", "").trim();
    }

    // ─── Mensajes ─────────────────────────────────────────────────────────────

    /**
     * Envía texto plano. Devuelve el {@code id} del mensaje (waId) o null si falla.
     */
    public String sendText(String sessionId, String number, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("sessionId", sessionId);
        body.put("number", number);
        body.put("message", message);
        return post("/send-message", body).orElse(null);
    }

    /**
     * Envía media referenciada por URL (img/video/audio/sticker hospedados en CDN).
     * {@code botType} debe ser el string que entiende el bot (IMAGEN/VIDEO/AUDIO/STICKER/DOCUMENT).
     */
    public String sendMediaUrl(String sessionId, String number, String mediaUrl,
                               String caption, String botType) {
        Map<String, Object> body = new HashMap<>();
        body.put("sessionId", sessionId);
        body.put("number", number);
        body.put("url", mediaUrl);
        body.put("message", caption);
        body.put("type", botType);
        return post("/send-media", body).orElse(null);
    }

    /**
     * Envía media codificada en base64 (cuando el archivo lo subió el agente desde el CRM).
     */
    public String sendMediaBase64(String sessionId, String number, String base64,
                                  String mimeType, String filename, String botType) {
        Map<String, Object> body = new HashMap<>();
        body.put("sessionId", sessionId);
        body.put("number", number);
        body.put("base64", base64);
        body.put("mimetype", mimeType);
        body.put("filename", filename);
        body.put("type", botType);
        return post("/send-media", body).orElse(null);
    }

    /**
     * Confirma a WhatsApp que un set de mensajes entrantes fue leído por el agente.
     */
    public void markChatRead(String sessionId, String number, List<String> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) return;
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("sessionId", sessionId);
            body.put("number", number);
            body.put("messageIds", messageIds);
            http.postForLocation(getBaseUrl() + "/chat/read", entity(body));
        } catch (RestClientException e) {
            log.warn("Bot /chat/read falló para session {}: {}", sessionId, e.getMessage());
        }
    }

    // ─── Sesiones ─────────────────────────────────────────────────────────────

    public void startSession(String sessionId) {
        try {
            http.postForLocation(getBaseUrl() + "/session/start",
                    entity(Map.of("sessionId", sessionId)));
        } catch (RestClientException e) {
            log.error("Bot /session/start falló: {}", e.getMessage());
        }
    }

    public void resetSession(String sessionId) {
        try {
            http.postForLocation(getBaseUrl() + "/session/reset",
                    entity(Map.of("sessionId", sessionId)));
        } catch (RestClientException e) {
            log.warn("Bot /session/reset falló: {}", e.getMessage());
        }
    }

    public Map<String, Object> getSessionStatus(String sessionId) {
        ResponseEntity<Map<String, Object>> resp = http.exchange(
                getBaseUrl() + "/session/status/" + sessionId,
                HttpMethod.GET, headersOnly(), MAP_TYPE);
        return resp.getBody() != null ? resp.getBody() : Map.of();
    }

    public Optional<String> getQrCode(String sessionId) {
        try {
            ResponseEntity<Map<String, String>> resp = http.exchange(
                    getBaseUrl() + "/qr/" + sessionId,
                    HttpMethod.GET, headersOnly(), STRING_MAP_TYPE);
            Map<String, String> body = resp.getBody();
            return body != null ? Optional.ofNullable(body.get("qr")) : Optional.empty();
        } catch (RestClientException e) {
            log.warn("No se pudo obtener QR: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public Optional<String> requestPairCode(String sessionId, String phoneNumber) {
        try {
            Map<String, String> body = Map.of("sessionId", sessionId, "phoneNumber", phoneNumber);
            ResponseEntity<Map<String, String>> resp = http.exchange(
                    getBaseUrl() + "/session/pair-code",
                    HttpMethod.POST, entity(body), STRING_MAP_TYPE);
            Map<String, String> responseBody = resp.getBody();
            return responseBody != null ? Optional.ofNullable(responseBody.get("code")) : Optional.empty();
        } catch (RestClientException e) {
            log.warn("Bot /session/pair-code falló: {}", e.getMessage());
            return Optional.empty();
        }
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    private Optional<String> post(String path, Map<String, Object> body) {
        try {
            ResponseEntity<Map<String, Object>> resp = http.exchange(
                    getBaseUrl() + path, HttpMethod.POST, entity(body), MAP_TYPE);
            Map<String, Object> responseBody = resp.getBody();
            if (resp.getStatusCode().is2xxSuccessful() && responseBody != null) {
                Object idObj = responseBody.get("id");
                return Optional.of(idObj != null ? idObj.toString() : ("WA_" + System.currentTimeMillis()));
            }
            log.error("Bot retornó status {} para {}: {}", resp.getStatusCode(), path, responseBody);
        } catch (RestClientException e) {
            log.error("Error comunicando con Bot ({}): {}", path, e.getMessage());
        }
        return Optional.empty();
    }

    private <T> HttpEntity<T> entity(T body) {
        return new HttpEntity<>(body, buildHeaders());
    }

    private HttpEntity<Void> headersOnly() {
        return new HttpEntity<>(buildHeaders());
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set(HEADER_API_KEY, botSecretKey);
        return headers;
    }
}
