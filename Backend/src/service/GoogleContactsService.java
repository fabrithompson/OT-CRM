package service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import model.Usuario;
import repository.UsuarioRepository;

@Service
public class GoogleContactsService {

    private static final Logger log = LoggerFactory.getLogger(GoogleContactsService.class);

    private static final String GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token";
    private static final String SEARCH_CONTACTS_URL = "https://people.googleapis.com/v1/people:searchContacts";
    private static final String CREATE_CONTACT_URL  = "https://people.googleapis.com/v1/people:createContact";

    @Value("${google.client.id:}")
    private String clientId;

    @Value("${google.client.secret:}")
    private String clientSecret;

    // Nonces de OAuth pendientes (en memoria): nonce → userId.
    // TTL implícito: el mapa se vacía cuando supera 500 entradas (protección
    // ante bots que llamen a /auth-url sin completar el flow).
    private final ConcurrentHashMap<String, Long> pendingStates = new ConcurrentHashMap<>();

    private final RestTemplate restTemplate;
    private final UsuarioRepository usuarioRepository;

    public GoogleContactsService(RestTemplate restTemplate, UsuarioRepository usuarioRepository) {
        this.restTemplate = restTemplate;
        this.usuarioRepository = usuarioRepository;
    }

    // ── OAuth ─────────────────────────────────────────────────────────────────

    public String registrarNonce(Long userId) {
        if (pendingStates.size() > 500) pendingStates.clear();
        String nonce = UUID.randomUUID().toString();
        pendingStates.put(nonce, userId);
        return nonce;
    }

    public Long resolverNonce(String nonce) {
        if (nonce == null) return null;
        return pendingStates.remove(nonce);
    }

    public String buildAuthUrl(String nonce, String redirectUri) {
        return "https://accounts.google.com/o/oauth2/v2/auth"
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(redirectUri)
            + "&response_type=code"
            + "&scope=" + encode("https://www.googleapis.com/auth/contacts")
            + "&access_type=offline"
            + "&prompt=consent"
            + "&state=" + encode(nonce);
    }

    @SuppressWarnings("null")
    @Transactional
    public void guardarTokens(Long userId, String code, String redirectUri) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("code", code);
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("redirect_uri", redirectUri);
        body.add("grant_type", "authorization_code");

        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> resp = restTemplate.postForEntity(
            GOOGLE_TOKEN_URL, new HttpEntity<>(body, headers),
            (Class<Map<String, Object>>) (Class<?>) Map.class);

        Map<String, Object> tokens = resp.getBody();
        if (tokens == null) throw new RuntimeException("Google no devolvió tokens");

        Usuario u = usuarioRepository.findById(userId).orElseThrow();
        u.setGoogleAccessToken((String) tokens.get("access_token"));
        // refresh_token solo viene la primera vez (o cuando se fuerza prompt=consent)
        String refresh = (String) tokens.get("refresh_token");
        if (refresh != null && !refresh.isBlank()) u.setGoogleRefreshToken(refresh);
        int expiresIn = tokens.containsKey("expires_in") ? (int) tokens.get("expires_in") : 3600;
        u.setGoogleTokenExpiry(System.currentTimeMillis() + expiresIn * 1000L - 60_000L);
        usuarioRepository.save(u);
        log.info("[GoogleContacts] Tokens guardados para usuario {}", userId);
    }

    @SuppressWarnings("null")
    @Transactional
    public void desconectar(Long userId) {
        Usuario u = usuarioRepository.findById(userId).orElseThrow();
        u.setGoogleAccessToken(null);
        u.setGoogleRefreshToken(null);
        u.setGoogleTokenExpiry(null);
        usuarioRepository.save(u);
        log.info("[GoogleContacts] Usuario {} desconectado de Google", userId);
    }

    @SuppressWarnings("null")
    public boolean estaConectado(Long userId) {
        return usuarioRepository.findById(userId)
            .map(u -> u.getGoogleRefreshToken() != null && !u.getGoogleRefreshToken().isBlank())
            .orElse(false);
    }

    // ── Sincronización ────────────────────────────────────────────────────────

    @Async
    public void sincronizarNombreAsync(Long usuarioId, String telefono, String nuevoNombre) {
        try {
            String accessToken = getValidAccessToken(usuarioId);
            if (accessToken == null) return;
            upsertContacto(accessToken, telefono, nuevoNombre);
        } catch (Exception e) {
            log.warn("[GoogleContacts] Error sincronizando '{}' para usuario {}: {}",
                nuevoNombre, usuarioId, e.getMessage());
        }
    }

    // ── Helpers internos ──────────────────────────────────────────────────────

    @SuppressWarnings("null")
    private String getValidAccessToken(Long userId) {
        Usuario u = usuarioRepository.findById(userId).orElse(null);
        if (u == null || u.getGoogleRefreshToken() == null || u.getGoogleRefreshToken().isBlank()) {
            return null;
        }
        // Token vigente → devolverlo directamente
        if (u.getGoogleTokenExpiry() != null && System.currentTimeMillis() < u.getGoogleTokenExpiry()) {
            return u.getGoogleAccessToken();
        }
        // Token vencido → renovar con refresh_token
        return refreshAccessToken(u);
    }

    @SuppressWarnings("unchecked")
    private String refreshAccessToken(Usuario u) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("refresh_token", u.getGoogleRefreshToken());
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("grant_type", "refresh_token");

            ResponseEntity<Map<String, Object>> resp = restTemplate.postForEntity(
                GOOGLE_TOKEN_URL, new HttpEntity<>(body, headers),
                (Class<Map<String, Object>>) (Class<?>) Map.class);

            Map<String, Object> tokens = resp.getBody();
            if (tokens == null) return null;

            String newToken = (String) tokens.get("access_token");
            int expiresIn = tokens.containsKey("expires_in") ? (int) tokens.get("expires_in") : 3600;
            u.setGoogleAccessToken(newToken);
            u.setGoogleTokenExpiry(System.currentTimeMillis() + expiresIn * 1000L - 60_000L);
            usuarioRepository.save(u);
            log.debug("[GoogleContacts] Token renovado para usuario {}", u.getId());
            return newToken;
        } catch (Exception e) {
            log.error("[GoogleContacts] No se pudo renovar token de usuario {}: {}", u.getId(), e.getMessage());
            return null;
        }
    }

    @SuppressWarnings({"unchecked", "null"})
    private void upsertContacto(String accessToken, String telefono, String nombre) {
        HttpHeaders authHeaders = new HttpHeaders();
        authHeaders.setBearerAuth(accessToken);

        // 1. Buscar contacto existente por teléfono
        String searchUrl = SEARCH_CONTACTS_URL
            + "?query=" + encode(telefono)
            + "&readMask=names,phoneNumbers";

        String resourceName = null;
        String etag = null;
        try {
            ResponseEntity<Map<String, Object>> searchResp = restTemplate.exchange(
                searchUrl, HttpMethod.GET, new HttpEntity<>(authHeaders),
                (Class<Map<String, Object>>) (Class<?>) Map.class);

            Map<String, Object> searchBody = searchResp.getBody();
            if (searchBody != null) {
                List<Map<String, Object>> results = (List<Map<String, Object>>) searchBody.get("results");
                if (results != null) {
                    for (Map<String, Object> result : results) {
                        Map<String, Object> person = (Map<String, Object>) result.get("person");
                        if (person == null) continue;
                        // Verificar que el teléfono realmente coincide (la API busca por texto general)
                        List<Map<String, Object>> phones = (List<Map<String, Object>>) person.get("phoneNumbers");
                        if (phones == null) continue;
                        String normalQuery = digitos(telefono);
                        for (Map<String, Object> ph : phones) {
                            String stored = digitos((String) ph.get("value"));
                            if (stored.length() >= 9 && normalQuery.length() >= 9
                                    && stored.endsWith(normalQuery.substring(Math.max(0, normalQuery.length() - 9)))) {
                                resourceName = (String) person.get("resourceName");
                                etag = (String) person.get("etag");
                                break;
                            }
                        }
                        if (resourceName != null) break;
                    }
                }
            }
        } catch (HttpClientErrorException e) {
            log.warn("[GoogleContacts] Búsqueda fallida ({}): {}", e.getStatusCode(), e.getMessage());
        }

        if (resourceName != null) {
            // 2a. Actualizar nombre del contacto existente
            HttpHeaders patchHeaders = new HttpHeaders();
            patchHeaders.setBearerAuth(accessToken);
            patchHeaders.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> patchBody = Map.of(
                "etag", etag != null ? etag : "",
                "names", List.of(Map.of("displayName", nombre))
            );
            String updateUrl = "https://people.googleapis.com/v1/" + resourceName
                + "?updatePersonFields=names";
            restTemplate.exchange(updateUrl, HttpMethod.PATCH,
                new HttpEntity<>(patchBody, patchHeaders), Map.class);
            log.info("[GoogleContacts] Contacto {} actualizado a '{}'", resourceName, nombre);
        } else {
            // 2b. Crear contacto nuevo
            HttpHeaders createHeaders = new HttpHeaders();
            createHeaders.setBearerAuth(accessToken);
            createHeaders.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> createBody = Map.of(
                "names", List.of(Map.of("displayName", nombre)),
                "phoneNumbers", List.of(Map.of("value", telefono))
            );
            restTemplate.postForEntity(
                CREATE_CONTACT_URL + "?personFields=names,phoneNumbers",
                new HttpEntity<>(createBody, createHeaders), Map.class);
            log.info("[GoogleContacts] Contacto creado: '{}' ({})", nombre, telefono);
        }
    }

    private static String digitos(String s) {
        if (s == null) return "";
        return s.replaceAll("\\D", "");
    }

    private static String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
