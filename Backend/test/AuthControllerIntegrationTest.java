import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Usuario;
import repository.UsuarioRepository;
import service.CloudStorageService;
import service.TelegramBridgeService;

class AuthControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired UsuarioRepository usuarioRepo;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;

    // ── Helpers ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("rawtypes")
    private ResponseEntity<Map> postAuth(String path, String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return rest.exchange("/api/v1/auth/" + path, org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(json, headers), Map.class);
    }

    // ── Tests ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Registro + verificacion + login completo")
    @SuppressWarnings({ "unchecked", "null" })
    void flujoRegistroVerificacionLogin() {
        // 1. Registrar usuario
        String registerJson = """
            {"username":"testuser","password":"Password123","email":"testuser@test.com","codigoInvitacion":null}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> regResponse = postAuth("register", registerJson);
        assertThat(regResponse.getStatusCode()).isEqualTo(HttpStatus.OK);

        // 2. Obtener codigo de verificacion desde la BD (email esta desactivado en test)
        Usuario usuario = usuarioRepo.findByUsername("testuser").orElseThrow();
        assertThat(usuario.getVerificado()).isFalse();
        String codigo = usuario.getCodigoVerificacion();
        assertThat(codigo).isNotNull();

        // 3. Verificar cuenta
        String verifyJson = """
            {"username":"testuser","code":"%s"}
            """.formatted(codigo);
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> verifyResponse = postAuth("verify", verifyJson);
        assertThat(verifyResponse.getStatusCode()).isEqualTo(HttpStatus.OK);

        // 4. Login
        String loginJson = """
            {"username":"testuser","password":"Password123"}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> loginResponse = postAuth("login", loginJson);
        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(loginResponse.getBody()).containsKey("token");
        assertThat(loginResponse.getBody().get("username")).isEqualTo("testuser");
    }

    @Test
    @DisplayName("Login con credenciales invalidas retorna 401")
    void loginCredencialesInvalidas() {
        String loginJson = """
            {"username":"noexiste","password":"wrongpassword"}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> response = postAuth("login", loginJson);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Registro con datos invalidos retorna 400 con errores de validacion")
    void registroConDatosInvalidos() {
        // Username vacio, password muy corta, email invalido
        String json = """
            {"username":"","password":"123","email":"no-es-email","codigoInvitacion":null}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> response = postAuth("register", json);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Registro duplicado retorna error")
    void registroDuplicado() {
        String json = """
            {"username":"duplicado","password":"Password123","email":"dup@test.com","codigoInvitacion":null}
            """;

        // Primer registro: OK
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> first = postAuth("register", json);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Verificar para que quede como verificado
        Usuario u = usuarioRepo.findByUsername("duplicado").orElseThrow();
        u.setVerificado(true);
        u.setCodigoVerificacion(null);
        usuarioRepo.save(u);

        // Segundo registro con mismo email: error
        String json2 = """
            {"username":"duplicado2","password":"Password123","email":"dup@test.com","codigoInvitacion":null}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> second = postAuth("register", json2);
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Login de usuario no verificado retorna 401")
    void loginUsuarioNoVerificado() {
        // Registrar pero NO verificar
        String registerJson = """
            {"username":"noverificado","password":"Password123","email":"noverif@test.com","codigoInvitacion":null}
            """;
        postAuth("register", registerJson);

        // Intentar login sin verificar
        String loginJson = """
            {"username":"noverificado","password":"Password123"}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> response = postAuth("login", loginJson);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
