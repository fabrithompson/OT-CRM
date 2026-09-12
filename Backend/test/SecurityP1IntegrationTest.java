import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.LocalDateTime;
import java.util.Map;

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

import exception.RegistroException;
import model.Agencia;
import model.SolicitudUnionEquipo;
import model.Usuario;
import repository.AgenciaRepository;
import repository.SolicitudUnionEquipoRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.TelegramBridgeService;
import service.UsuarioService;

/**
 * Cubre los items P1 de seguridad de docs/backlog-mejoras.md resueltos en esta
 * pasada: default-deny HTTP, autorizacion por rol, enumeracion de usuarios en
 * recuperacion de password y limite de intentos del codigo.
 */
class SecurityP1IntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired SolicitudUnionEquipoRepository solicitudRepo;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired UsuarioService usuarioService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;

    private Agencia agencia;
    private Usuario admin;

    @BeforeEach
    void setUp() {
        agencia = agenciaRepo.save(new Agencia("SecAgency_" + System.nanoTime(), "SEC_" + System.nanoTime()));
        // Solo el admin: el plan FREE (seed) tope a 2 miembros por agencia, y el
        // test que aprueba una solicitud necesita lugar para el nuevo miembro.
        admin = nuevoUsuario("admin_" + System.nanoTime(), "ADMIN");
    }

    private Usuario nuevoUsuario(String username, String rol) {
        Usuario u = new Usuario();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode("Password123"));
        u.setEmail(username + "@test.com");
        u.setRol(rol);
        u.setAgencia(agencia);
        u.setVerificado(true);
        return usuarioRepo.save(u);
    }

    private String tokenPara(Usuario u) {
        return jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
    }

    private HttpEntity<String> authEntity(String token, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) headers.setBearerAuth(token);
        return new HttpEntity<>(body, headers);
    }

    // ── 1. Default-deny HTTP ─────────────────────────────────────────────

    @Test
    @DisplayName("presence/active sin token: 401, no una lista vacia silenciosa")
    void presenceActiveSinTokenRequiereAuth() {
        ResponseEntity<Map> resp = rest.getForEntity("/api/v1/presence/active", Map.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("paypal/crear-suscripcion sin token: 401, no 500 con NPE de @AuthenticationPrincipal nulo")
    void paypalSinTokenRequiereAuth() {
        ResponseEntity<Map> resp = rest.postForEntity(
                "/api/v1/paypal/crear-suscripcion?planId=1", null, Map.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("El shell de la SPA sigue siendo publico (login tiene que poder cargar sin sesion)")
    void spaShellSigueSiendoPublico() {
        ResponseEntity<String> resp = rest.getForEntity("/login", String.class);
        // No nos importa si devuelve 200 (index.html) o 404/500 por el archivo
        // estatico ausente en este entorno de test: lo que valida este test es
        // que la capa de SEGURIDAD no lo corte con 401/403.
        assertThat(resp.getStatusCode()).isNotIn(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }

    // ── 2. Autorizacion por rol ───────────────────────────────────────────

    @Test
    @DisplayName("Un USER comun no puede aprobar solicitudes de union al equipo")
    void gestionarSolicitudRequiereAdminUOwner() {
        Usuario miembroComun = nuevoUsuario("user_" + System.nanoTime(), "USER");
        SolicitudUnionEquipo solicitud = crearSolicitudPendiente();

        String body = """
            {"solicitudId": %d, "aprobar": true}
            """.formatted(solicitud.getId());
        ResponseEntity<Map> resp = rest.exchange(
                "/api/v1/dashboard/equipo/gestionar-solicitud", HttpMethod.POST,
                authEntity(tokenPara(miembroComun), body), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(solicitudRepo.findById(solicitud.getId()).orElseThrow().getEstado())
                .isEqualTo(SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE);
    }

    @Test
    @DisplayName("Un ADMIN si puede aprobar solicitudes de union al equipo")
    void gestionarSolicitudPermiteAdmin() {
        SolicitudUnionEquipo solicitud = crearSolicitudPendiente();

        String body = """
            {"solicitudId": %d, "aprobar": true}
            """.formatted(solicitud.getId());
        ResponseEntity<Map> resp = rest.exchange(
                "/api/v1/dashboard/equipo/gestionar-solicitud", HttpMethod.POST,
                authEntity(tokenPara(admin), body), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(solicitudRepo.findById(solicitud.getId()).orElseThrow().getEstado())
                .isEqualTo(SolicitudUnionEquipo.EstadoSolicitud.APROBADA);
    }

    private SolicitudUnionEquipo crearSolicitudPendiente() {
        Agencia otraAgencia = agenciaRepo.save(new Agencia("Otra_" + System.nanoTime(), "OTR_" + System.nanoTime()));
        Usuario solicitante = new Usuario();
        solicitante.setUsername("solicitante_" + System.nanoTime());
        solicitante.setPassword(passwordEncoder.encode("Password123"));
        solicitante.setEmail("solicitante_" + System.nanoTime() + "@test.com");
        solicitante.setRol("USER");
        solicitante.setAgencia(otraAgencia);
        solicitante.setVerificado(true);
        solicitante = usuarioRepo.save(solicitante);

        SolicitudUnionEquipo s = new SolicitudUnionEquipo();
        s.setUsuarioSolicitante(solicitante);
        s.setAgenciaDestino(agencia);
        s.setEstado(SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE);
        s.setFechaCreacion(LocalDateTime.now());
        return solicitudRepo.save(s);
    }

    // ── 5. Enumeracion de usuarios en recuperacion de password ───────────

    @Test
    @DisplayName("forgot-password responde IGUAL exista o no la cuenta")
    void forgotPasswordNoEnumeraUsuarios() {
        String bodyExistente = """
            {"email": "%s"}
            """.formatted(admin.getEmail());
        String bodyInexistente = """
            {"email": "no-existe-esta-cuenta@test.com"}
            """;

        ResponseEntity<Map> respExistente = rest.postForEntity(
                "/api/v1/auth/forgot-password", authEntity(null, bodyExistente), Map.class);
        ResponseEntity<Map> respInexistente = rest.postForEntity(
                "/api/v1/auth/forgot-password", authEntity(null, bodyInexistente), Map.class);

        assertThat(respExistente.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(respInexistente.getStatusCode()).isEqualTo(respExistente.getStatusCode());
        assertThat(respInexistente.getBody()).isEqualTo(respExistente.getBody());
    }

    @Test
    @DisplayName("reset-password responde IGUAL con cuenta inexistente que con codigo incorrecto")
    void resetPasswordNoEnumeraUsuarios() {
        String bodyInexistente = """
            {"email": "no-existe-esta-cuenta@test.com", "code": "123456", "newPassword": "NuevaPass123", "confirmPassword": "NuevaPass123"}
            """;
        String bodyCodigoMalo = """
            {"email": "%s", "code": "000000", "newPassword": "NuevaPass123", "confirmPassword": "NuevaPass123"}
            """.formatted(admin.getEmail());

        ResponseEntity<Map> respInexistente = rest.postForEntity(
                "/api/v1/auth/reset-password", authEntity(null, bodyInexistente), Map.class);
        ResponseEntity<Map> respCodigoMalo = rest.postForEntity(
                "/api/v1/auth/reset-password", authEntity(null, bodyCodigoMalo), Map.class);

        assertThat(respInexistente.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(respCodigoMalo.getStatusCode()).isEqualTo(respInexistente.getStatusCode());
        assertThat(respCodigoMalo.getBody()).isEqualTo(respInexistente.getBody());
    }

    // ── 6. Limite de intentos del codigo ─────────────────────────────────

    // Los dos tests de abajo llaman a UsuarioService directo (no por HTTP) para
    // los intentos fallidos, y dejan solo la llamada final end-to-end por HTTP:
    // es mas rapido que armar 5-6 requests HTTP completos por test para
    // verificar logica que ya vive en el service. (RateLimitFilter esta
    // deshabilitado en el perfil "test" — @Profile("!test") — asi que esto ya
    // no es necesario para evitar 429, pero se mantiene por prolijidad).

    @Test
    @DisplayName("Tras agotar los intentos, el codigo se invalida aunque despues se mande el correcto")
    void codigoSeInvalidaTrasAgotarIntentos() {
        admin.setCodigoVerificacion("999999");
        admin.setCodigoExpiracion(LocalDateTime.now().plusMinutes(15));
        admin.setCodigoIntentos(0);
        usuarioRepo.save(admin);

        // 5 intentos fallidos (CODIGO_INTENTOS_MAXIMOS)
        for (int i = 0; i < 5; i++) {
            assertThatExceptionOfType(RegistroException.class).isThrownBy(() ->
                    usuarioService.restablecerPassword(admin.getEmail(), "000000", "NuevaPass123"));
        }

        // El codigo correcto, en el 6to intento, ya no sirve: se invalido solo.
        // Esta ultima verificacion si va end-to-end por HTTP.
        String bodyCodigoCorrecto = """
            {"email": "%s", "code": "999999", "newPassword": "NuevaPass123", "confirmPassword": "NuevaPass123"}
            """.formatted(admin.getEmail());
        ResponseEntity<Map> respFinal = rest.postForEntity(
                "/api/v1/auth/reset-password", authEntity(null, bodyCodigoCorrecto), Map.class);
        assertThat(respFinal.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        Usuario recargado = usuarioRepo.findById(admin.getId()).orElseThrow();
        assertThat(recargado.getCodigoVerificacion()).isNull();
    }

    @Test
    @DisplayName("Con intentos de sobra, el codigo correcto restablece la password")
    void codigoCorrectoDentroDelLimiteFunciona() {
        admin.setCodigoVerificacion("111222");
        admin.setCodigoExpiracion(LocalDateTime.now().plusMinutes(15));
        admin.setCodigoIntentos(0);
        usuarioRepo.save(admin);

        // 3 intentos fallidos, dentro del limite de 5.
        for (int i = 0; i < 3; i++) {
            assertThatExceptionOfType(RegistroException.class).isThrownBy(() ->
                    usuarioService.restablecerPassword(admin.getEmail(), "000000", "NuevaPass123"));
        }

        String body = """
            {"email": "%s", "code": "111222", "newPassword": "NuevaPass123", "confirmPassword": "NuevaPass123"}
            """.formatted(admin.getEmail());
        ResponseEntity<Map> resp = rest.postForEntity(
                "/api/v1/auth/reset-password", authEntity(null, body), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Usuario recargado = usuarioRepo.findById(admin.getId()).orElseThrow();
        assertThat(recargado.getCodigoVerificacion()).isNull();
    }
}
