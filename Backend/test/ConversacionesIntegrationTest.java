import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Agencia;
import model.Cliente;
import model.Etapa;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.TelegramBridgeService;

/** Bandeja de chats: GET /api/v1/chat/conversaciones. */
class ConversacionesIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private record Tenant(Agencia agencia, Etapa etapa, String token) {}

    @SuppressWarnings("null")
    private Tenant crearTenant(String prefijo) {
        long n = System.nanoTime();
        Agencia agencia = agenciaRepo.save(new Agencia(prefijo + "_" + n, prefijo + "_" + n));
        Usuario u = new Usuario();
        u.setUsername(prefijo.toLowerCase() + "_" + n);
        u.setPassword("$2a$10$dummyhashvalue1234567890123456");
        u.setEmail(prefijo.toLowerCase() + n + "@test.com");
        u.setRol("ADMIN");
        u.setAgencia(agencia);
        u.setPlan(planRepo.findByNombre("FREE").orElseThrow());
        u.setVerificado(true);
        u = usuarioRepo.save(u);

        Etapa etapa = new Etapa("Inicial " + prefijo, 1, true);
        etapa.setAgencia(agencia);
        etapa = etapaRepo.save(etapa);

        String token = jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
        return new Tenant(agencia, etapa, token);
    }

    @SuppressWarnings("null")
    private Cliente cliente(Tenant t, String nombre, String tel, String origen, LocalDateTime ultimo, int sinLeer) {
        Cliente c = new Cliente(nombre, tel, null, t.etapa());
        c.setAgencia(t.agencia());
        c.setOrigen(origen);
        c.setUltimoMensajeFecha(ultimo);
        c.setUltimoMensajeResumen(ultimo != null ? "hola " + nombre : null);
        c.setMensajesSinLeer(sinLeer);
        return clienteRepo.save(c);
    }

    @SuppressWarnings("null")
    private List<String> nombres(Tenant t, String query) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(t.token());
        ResponseEntity<List<Map<String, Object>>> r = rest.exchange("/api/v1/chat/conversaciones" + query,
                HttpMethod.GET, new HttpEntity<>(h), new ParameterizedTypeReference<>() {});
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        return r.getBody().stream().map(m -> (String) m.get("nombre")).toList();
    }

    @Test
    @DisplayName("Lista solo contactos con mensajes, del más reciente al más viejo, y solo de la propia agencia")
    void ordenYAislamiento() {
        Tenant a = crearTenant("ConvA");
        Tenant b = crearTenant("ConvB");
        LocalDateTime base = LocalDateTime.of(2026, 5, 1, 10, 0);
        cliente(a, "Viejo", "5491100000001", "WHATSAPP", base, 0);
        cliente(a, "Nuevo", "5491100000002", "WHATSAPP", base.plusHours(3), 2);
        cliente(a, "Medio", "5491100000003", "TELEGRAM", base.plusHours(1), 0);
        cliente(a, "SinChat", "5491100000004", "MANUAL", null, 0);
        cliente(b, "Ajeno", "5491100000005", "WHATSAPP", base.plusDays(1), 1);

        assertThat(nombres(a, "")).containsExactly("Nuevo", "Medio", "Viejo");
    }

    @Test
    @DisplayName("Filtros: no leídos, por canal y búsqueda por nombre o teléfono")
    void filtrosYBusqueda() {
        Tenant a = crearTenant("ConvF");
        LocalDateTime base = LocalDateTime.of(2026, 5, 1, 10, 0);
        cliente(a, "Ana Pérez", "5491122220001", "WHATSAPP", base, 3);
        cliente(a, "Bruno", "5491133330002", "TELEGRAM", base.plusMinutes(5), 0);
        cliente(a, "Carla", "5491144440003", "WHATSAPP", base.plusMinutes(10), 0);

        assertThat(nombres(a, "?filtro=NO_LEIDOS")).containsExactly("Ana Pérez");
        assertThat(nombres(a, "?filtro=TELEGRAM")).containsExactly("Bruno");
        assertThat(nombres(a, "?filtro=WHATSAPP")).containsExactly("Carla", "Ana Pérez");
        assertThat(nombres(a, "?q=ana")).containsExactly("Ana Pérez");
        assertThat(nombres(a, "?q=3333")).containsExactly("Bruno");
        // Un comodín escrito por el usuario ("_" = cualquier letra) no se interpreta
        assertThat(nombres(a, "?q=a_a")).isEmpty();
        assertThat(nombres(a, "?q=zzz")).isEmpty();
    }

    @Test
    @DisplayName("Paginación por páginas de tamaño fijo")
    void paginacion() {
        Tenant a = crearTenant("ConvP");
        LocalDateTime base = LocalDateTime.of(2026, 5, 1, 10, 0);
        for (int i = 0; i < 5; i++) {
            cliente(a, "C" + i, "54911555500" + i, "WHATSAPP", base.plusMinutes(i), 0);
        }
        assertThat(nombres(a, "?size=2&page=0")).containsExactly("C4", "C3");
        assertThat(nombres(a, "?size=2&page=2")).containsExactly("C0");
    }
}
