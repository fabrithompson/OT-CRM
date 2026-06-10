package controller;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

import model.Usuario;
import repository.UsuarioRepository;
import service.GoogleContactsService;

@RestController
@RequestMapping("/api/v1/google")
public class GoogleOAuthController {

    private static final Logger log = LoggerFactory.getLogger(GoogleOAuthController.class);

    // URL del frontend (para redirigir al usuario luego del OAuth)
    @Value("${app.frontend.url:http://localhost:5173}")
    private String frontendUrl;

    // URL del backend que Google llama tras la autorización (debe coincidir
    // exactamente con la registrada en Google Cloud Console)
    @Value("${google.redirect.uri:}")
    private String googleRedirectUri;

    private final GoogleContactsService googleContactsService;
    private final UsuarioRepository usuarioRepository;

    public GoogleOAuthController(GoogleContactsService googleContactsService,
                                  UsuarioRepository usuarioRepository) {
        this.googleContactsService = googleContactsService;
        this.usuarioRepository = usuarioRepository;
    }

    /** Devuelve la URL de autorización de Google para el vendedor autenticado. */
    @GetMapping("/auth-url")
    public ResponseEntity<Map<String, String>> getAuthUrl(
            @AuthenticationPrincipal UserDetails userDetails) {
        Usuario u = getUsuario(userDetails);
        String nonce = googleContactsService.registrarNonce(u.getId());
        String url = googleContactsService.buildAuthUrl(nonce, redirectUri());
        return ResponseEntity.ok(Map.of("url", url));
    }

    /**
     * Callback de Google OAuth 2.0. Google redirige aquí después de que el
     * vendedor autoriza (o deniega) el acceso a sus contactos.
     * El backend intercambia el code por tokens, los persiste y redirige al
     * frontend con el resultado en el query-param ?google=ok|error|denied.
     */
    @GetMapping("/callback")
    public RedirectView callback(@RequestParam(required = false) String code,
                                  @RequestParam(required = false) String state,
                                  @RequestParam(required = false) String error) {
        if (error != null) {
            log.warn("[GoogleOAuth] Acceso denegado por el usuario: {}", error);
            return redirect("/perfil?google=denied");
        }
        if (code == null || state == null) {
            return redirect("/perfil?google=error");
        }
        Long userId = googleContactsService.resolverNonce(state);
        if (userId == null) {
            log.warn("[GoogleOAuth] Nonce inválido o expirado: {}", state);
            return redirect("/perfil?google=error");
        }
        try {
            googleContactsService.guardarTokens(userId, code, redirectUri());
            return redirect("/perfil?google=ok");
        } catch (Exception e) {
            log.error("[GoogleOAuth] Error guardando tokens para usuario {}: {}", userId, e.getMessage());
            return redirect("/perfil?google=error");
        }
    }

    /** Estado de la conexión Google del usuario autenticado. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(
            @AuthenticationPrincipal UserDetails userDetails) {
        Usuario u = getUsuario(userDetails);
        boolean conectado = googleContactsService.estaConectado(u.getId());
        return ResponseEntity.ok(Map.of("conectado", conectado));
    }

    /** Desconecta la cuenta Google del usuario (borra los tokens almacenados). */
    @DeleteMapping("/disconnect")
    public ResponseEntity<Map<String, Object>> disconnect(
            @AuthenticationPrincipal UserDetails userDetails) {
        Usuario u = getUsuario(userDetails);
        googleContactsService.desconectar(u.getId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String redirectUri() {
        if (googleRedirectUri != null && !googleRedirectUri.isBlank()) return googleRedirectUri;
        // Fallback local: misma máquina, puerto 8080
        return "http://localhost:8080/api/v1/google/callback";
    }

    private RedirectView redirect(String path) {
        RedirectView rv = new RedirectView(frontendUrl + path);
        rv.setExposeModelAttributes(false);
        return rv;
    }

    private Usuario getUsuario(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
    }
}
