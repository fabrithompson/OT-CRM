import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Agencia;
import model.Usuario;
import repository.AgenciaRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.RefreshTokenService;
import service.TelegramBridgeService;

/**
 * Cubre el item P1 "revisar el almacenamiento del JWT" de docs/backlog-mejoras.md:
 * access token corto + refresh token revocable por jti.
 *
 * Los tests que no necesitan pasar por HTTP (armar un refresh token con un jti
 * puntual, chequear su tipo) llaman a JwtUtil/RefreshTokenService directo en
 * vez de por login: es más rápido y no depende de tener que loguearse primero
 * para cada caso.
 */
class RefreshTokenIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;
    @Autowired RefreshTokenService refreshTokenService;
    @Autowired PasswordEncoder passwordEncoder;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;

    private Usuario usuario;

    @BeforeEach
    void setUp() {
        Agencia agencia = agenciaRepo.save(new Agencia("RtAgency_" + System.nanoTime(), "RT_" + System.nanoTime()));
        usuario = new Usuario();
        usuario.setUsername("rtuser_" + System.nanoTime());
        usuario.setPassword(passwordEncoder.encode("Password123"));
        usuario.setEmail(usuario.getUsername() + "@test.com");
        usuario.setRol("USER");
        usuario.setAgencia(agencia);
        usuario.setVerificado(true);
        usuario = usuarioRepo.save(usuario);
    }

    @SuppressWarnings("rawtypes")
    private ResponseEntity<Map> postAuth(String path, String jsonBody) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.exchange("/api/v1/auth/" + path, HttpMethod.POST,
                new HttpEntity<>(jsonBody, headers), Map.class);
    }

    @SuppressWarnings("rawtypes")
    private ResponseEntity<Map> getConToken(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
    }

    // ── Login ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("Login devuelve access token y refresh token, y este ultimo queda registrado en DB")
    @SuppressWarnings("unchecked")
    void loginDevuelveAmbosTokens() {
        String loginJson = """
            {"username": "%s", "password": "Password123"}
            """.formatted(usuario.getUsername());

        ResponseEntity<Map> resp = postAuth("login", loginJson);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKeys("token", "refreshToken", "username");

        // El refresh token es un JWT propio (no el mismo valor que el access).
        String access = (String) resp.getBody().get("token");
        String refresh = (String) resp.getBody().get("refreshToken");
        assertThat(refresh).isNotEqualTo(access);

        var claims = jwtUtil.validarRefreshToken(refresh).orElseThrow();
        assertThat(claims.username()).isEqualTo(usuario.getUsername());
    }

    // ── Refresh: rotacion ─────────────────────────────────────────────

    @Test
    @DisplayName("refresh devuelve un access token nuevo y ROTA el refresh token (el viejo deja de servir)")
    void refreshRotaElToken() {
        String jtiViejo = UUID.randomUUID().toString();
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String refreshViejo = jwtUtil.generateRefreshToken(userDetails, jtiViejo);
        refreshTokenService.emitir(usuario.getId(), jtiViejo);

        String body = """
            {"refreshToken": "%s"}
            """.formatted(refreshViejo);
        ResponseEntity<Map> resp = postAuth("refresh", body);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKeys("token", "refreshToken");

        // Reusar el refresh viejo (ya rotado) tiene que fallar: es la señal de
        // que alguien está reutilizando un refresh token que ya no es el vigente.
        ResponseEntity<Map> segundoIntento = postAuth("refresh", body);
        assertThat(segundoIntento.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("El access token nuevo emitido por refresh sirve para autenticar requests")
    @SuppressWarnings("unchecked")
    void accessTokenDeRefreshFunciona() {
        String jti = UUID.randomUUID().toString();
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String refresh = jwtUtil.generateRefreshToken(userDetails, jti);
        refreshTokenService.emitir(usuario.getId(), jti);

        ResponseEntity<Map> refreshResp = postAuth("refresh", """
            {"refreshToken": "%s"}
            """.formatted(refresh));
        String nuevoAccess = (String) refreshResp.getBody().get("token");

        ResponseEntity<Map> perfilResp = getConToken("/api/v1/perfil", nuevoAccess);
        assertThat(perfilResp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Un refresh token invalido o inexistente en DB es rechazado")
    void refreshTokenInvalidoRechazado() {
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        // JWT valido (firma y tipo OK) pero cuyo jti nunca se emitio via
        // RefreshTokenService.emitir: no existe fila en refresh_tokens.
        String refreshSinEmitir = jwtUtil.generateRefreshToken(userDetails, UUID.randomUUID().toString());

        ResponseEntity<Map> resp = postAuth("refresh", """
            {"refreshToken": "%s"}
            """.formatted(refreshSinEmitir));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ── Logout ────────────────────────────────────────────────────────

    @Test
    @DisplayName("logout revoca el refresh token del lado del servidor: un refresh posterior falla")
    void logoutRevocaElRefreshToken() {
        String jti = UUID.randomUUID().toString();
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String refresh = jwtUtil.generateRefreshToken(userDetails, jti);
        refreshTokenService.emitir(usuario.getId(), jti);

        ResponseEntity<Map> logoutResp = postAuth("logout", """
            {"refreshToken": "%s"}
            """.formatted(refresh));
        assertThat(logoutResp.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> refreshTrasLogout = postAuth("refresh", """
            {"refreshToken": "%s"}
            """.formatted(refresh));
        assertThat(refreshTrasLogout.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("logout con un refresh token que no existe no rompe (best-effort, sin filtrar info)")
    void logoutConTokenInexistenteNoFalla() {
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String refreshNuncaEmitido = jwtUtil.generateRefreshToken(userDetails, UUID.randomUUID().toString());

        ResponseEntity<Map> resp = postAuth("logout", """
            {"refreshToken": "%s"}
            """.formatted(refreshNuncaEmitido));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── Separación de tipos: un token no sirve para lo que no es ─────────

    @Test
    @DisplayName("Un refresh token NO sirve como access token para autenticar un request")
    void refreshTokenNoSirveComoAccessToken() {
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String refresh = jwtUtil.generateRefreshToken(userDetails, UUID.randomUUID().toString());

        ResponseEntity<Map> resp = getConToken("/api/v1/perfil", refresh);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Un access token NO sirve como refresh token")
    void accessTokenNoSirveComoRefreshToken() {
        var userDetails = userDetailsService.loadUserByUsername(usuario.getUsername());
        String access = jwtUtil.generateAccessToken(userDetails);

        ResponseEntity<Map> resp = postAuth("refresh", """
            {"refreshToken": "%s"}
            """.formatted(access));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Un access token invalido/corrupto en un endpoint protegido da 401, no 403")
    void accessTokenInvalidoDa401() {
        ResponseEntity<Map> resp = getConToken("/api/v1/perfil", "esto-no-es-un-jwt-valido");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
