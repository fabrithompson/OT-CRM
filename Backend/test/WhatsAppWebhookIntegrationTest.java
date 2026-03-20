import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import model.Agencia;
import model.Cliente;
import model.Dispositivo;
import model.Etapa;
import model.Mensaje;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;
import service.CloudStorageService;
import service.TelegramBridgeService;

class WhatsAppWebhookIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired ClienteRepository clienteRepo;
    @Autowired MensajeRepository mensajeRepo;
    @Autowired DispositivoRepository dispositivoRepo;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired PlanRepository planRepo;
    @Autowired UsuarioRepository usuarioRepo;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;

    @Value("${bot.secret.key}") String botSecret;

    private Agencia agencia;
    private Dispositivo dispositivo;

    @SuppressWarnings("null")
    @BeforeEach
    void setUp() {
        mensajeRepo.deleteAll();
        clienteRepo.deleteAll();

        // Agencia y datos de test (no conflictan con DataInitializer)
        agencia = agenciaRepo.save(new Agencia("Test Agency " + System.nanoTime(), "CODE_" + System.nanoTime()));

        Etapa etapaInicial = new Etapa("Nuevos", 1, true);
        etapaInicial.setAgencia(agencia);
        etapaRepo.save(etapaInicial);

        dispositivo = new Dispositivo();
        dispositivo.setAlias("Test Bot");
        dispositivo.setSessionId("session_" + System.nanoTime());
        dispositivo.setAgencia(agencia);
        dispositivo.setPlataforma(Dispositivo.Plataforma.WHATSAPP);
        dispositivo.setEstado("CONNECTED");
        dispositivo.setActivo(true);
        dispositivo = dispositivoRepo.save(dispositivo);

        // Admin con plan FREE para que SubscriptionValidationService funcione
        Plan planFree = planRepo.findByNombre("FREE").orElseThrow();
        Usuario admin = new Usuario();
        admin.setUsername("admin_" + System.nanoTime());
        admin.setPassword("$2a$10$dummyhashvalue1234567890123456");
        admin.setEmail("admin" + System.nanoTime() + "@test.com");
        admin.setRol("ADMIN");
        admin.setAgencia(agencia);
        admin.setPlan(planFree);
        admin.setVerificado(true);
        usuarioRepo.save(admin);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private ResponseEntity<String> enviarWebhook(String from, String body, String name) {
        String json = """
            {
                "from": "%s",
                "body": "%s",
                "name": "%s",
                "sessionId": "%s",
                "profilePicUrl": null,
                "origen": "WHATSAPP",
                "mediaUrl": null,
                "mimeType": null
            }
            """.formatted(from, body, name, dispositivo.getSessionId());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Bot-Token", botSecret);

        return rest.exchange("/api/webhook/whatsapp/robot", HttpMethod.POST,
                new HttpEntity<>(json, headers), String.class);
    }

    // ── Tests ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Mensaje entrante crea cliente y mensaje en BD")
    void mensajeEntranteCreaCLienteYMensaje() {
        ResponseEntity<String> response = enviarWebhook(
                "5491155551234@s.whatsapp.net", "Hola, quiero informacion", "Juan Perez");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo("PROCESSED");

        esperarAsync(2000);

        List<Cliente> clientes = clienteRepo.findByAgenciaIdOrderByFechaRegistroDesc(agencia.getId());
        assertThat(clientes).hasSize(1);
        assertThat(clientes.get(0).getTelefono()).isEqualTo("5491155551234");
        assertThat(clientes.get(0).getNombre()).isEqualTo("Juan Perez");

        List<Mensaje> mensajes = mensajeRepo.findByClienteId(clientes.get(0).getId());
        assertThat(mensajes).hasSize(1);
        assertThat(mensajes.get(0).getContenido()).isEqualTo("Hola, quiero informacion");
        assertThat(mensajes.get(0).isEsSalida()).isFalse();
    }

    @Test
    @DisplayName("Mismo telefono no duplica cliente — 3 mensajes, 1 cliente")
    void mismoTelefonoNoDuplicaCliente() {
        for (int i = 1; i <= 3; i++) {
            enviarWebhook("5491155559999@s.whatsapp.net", "Mensaje " + i, "Maria");
            esperarAsync(600);
        }
        esperarAsync(2000);

        List<Cliente> clientes = clienteRepo.findByAgenciaIdOrderByFechaRegistroDesc(agencia.getId());
        assertThat(clientes).hasSize(1);

        List<Mensaje> mensajes = mensajeRepo.findByClienteId(clientes.get(0).getId());
        assertThat(mensajes).hasSize(3);
    }

    @Test
    @DisplayName("Formatos de telefono argentino se normalizan al mismo numero")
    void normalizacionTelefonoArgentino() {
        // Todos estos formatos deben normalizarse a 5491155551234
        String[] formatos = {
            "5491155551234@s.whatsapp.net",   // ya normalizado
            "541155551234@s.whatsapp.net",     // falta el 9
            "1155551234@s.whatsapp.net",       // solo 10 digitos
            "01155551234@s.whatsapp.net",      // con 0 inicial
        };

        for (int i = 0; i < formatos.length; i++) {
            enviarWebhook(formatos[i], "Formato " + i, "Carlos");
            esperarAsync(600);
        }
        esperarAsync(2000);

        List<Cliente> clientes = clienteRepo.findByAgenciaIdOrderByFechaRegistroDesc(agencia.getId());
        assertThat(clientes)
                .as("Todos los formatos deben resolverse a un solo cliente")
                .hasSize(1);
        assertThat(clientes.get(0).getTelefono()).isEqualTo("5491155551234");

        List<Mensaje> mensajes = mensajeRepo.findByClienteId(clientes.get(0).getId());
        assertThat(mensajes).hasSize(formatos.length);
    }

    @Test
    @DisplayName("Webhook sin token retorna 401 UNAUTHORIZED")
    void webhookSinTokenRetorna401() {
        String json = """
            {"from":"5491155551234","body":"test","name":"X","sessionId":"x",
             "profilePicUrl":null,"origen":"WHATSAPP","mediaUrl":null,"mimeType":null}
            """;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        // Sin X-Bot-Token

        ResponseEntity<String> response = rest.exchange("/api/webhook/whatsapp/robot",
                HttpMethod.POST, new HttpEntity<>(json, headers), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Limite de contactos del plan rechaza clientes nuevos")
    void limiteContactosRechazaNuevoCliente() {
        // Plan con maxContactos = 2
        Plan planLimitado = new Plan("TEST_LIMIT_" + System.nanoTime(), 1, 2, 0.0, "Plan test");
        planLimitado = planRepo.save(planLimitado);

        Usuario admin = usuarioRepo.findByAgenciaId(agencia.getId()).stream()
                .filter(u -> "ADMIN".equals(u.getRol()))
                .findFirst().orElseThrow();
        admin.setPlan(planLimitado);
        usuarioRepo.save(admin);

        // 3 numeros distintos, pero el plan solo admite 2 contactos
        enviarWebhook("5491100010001@s.whatsapp.net", "Hola 1", "Cliente A");
        esperarAsync(1500);
        enviarWebhook("5491100020002@s.whatsapp.net", "Hola 2", "Cliente B");
        esperarAsync(1500);
        enviarWebhook("5491100030003@s.whatsapp.net", "Hola 3", "Cliente C");
        esperarAsync(2000);

        long clientesCreados = clienteRepo.countByAgenciaId(agencia.getId());
        assertThat(clientesCreados)
                .as("Solo se deben crear 2 clientes (limite del plan)")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("SessionId desconocido ignora el mensaje sin error")
    void sessionIdDesconocidoIgnoraMensaje() {
        String json = """
            {
                "from": "5491155551234@s.whatsapp.net",
                "body": "Mensaje fantasma",
                "name": "Ghost",
                "sessionId": "sesion_inexistente_xyz",
                "profilePicUrl": null,
                "origen": "WHATSAPP",
                "mediaUrl": null,
                "mimeType": null
            }
            """;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Bot-Token", botSecret);

        ResponseEntity<String> response = rest.exchange("/api/webhook/whatsapp/robot",
                HttpMethod.POST, new HttpEntity<>(json, headers), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        esperarAsync(1500);

        long clientes = clienteRepo.countByAgenciaId(agencia.getId());
        assertThat(clientes).isZero();
    }
}
