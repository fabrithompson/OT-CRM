import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
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
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Agencia;
import model.Cliente;
import model.Etapa;
import model.Transaccion;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;
import repository.PlanRepository;
import repository.RespuestaRapidaRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CrmAgentTools;
import service.CustomUserDetailsService;
import service.EmailService;
import service.TelegramBridgeService;
import service.TransaccionService;

/**
 * Saldo y movimientos de los contactos.
 *
 * Garantiza que el saldo cambia SIEMPRE junto con un movimiento registrado
 * (chat, /clientes/{id}/saldo y agente de IA), que solo se aceptan CARGA y
 * RETIRO, y que una agencia no puede operar sobre contactos de otra.
 */
class TransaccionIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired TransaccionRepository transaccionRepo;
    @Autowired EtiquetaRepository etiquetaRepo;
    @Autowired RespuestaRapidaRepository respuestaRepo;
    @Autowired TransaccionService transaccionService;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private record Tenant(Agencia agencia, Usuario usuario, Cliente cliente, String token) {}

    /**
     * La base es compartida entre clases de test: los movimientos apuntan a contactos
     * y otros tests hacen clienteRepo.deleteAll(), que fallaría por la clave foránea.
     */
    @AfterEach
    void limpiarMovimientos() {
        transaccionRepo.deleteAll();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

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

        Etapa etapa = new Etapa("Etapa " + prefijo, 1, true);
        etapa.setAgencia(agencia);
        etapa = etapaRepo.save(etapa);

        Cliente c = new Cliente("Cliente " + prefijo, "5491" + (n % 100000000), null, etapa);
        c.setAgencia(agencia);
        c.setSaldo(BigDecimal.ZERO);
        c.setCargaTotal(BigDecimal.ZERO);
        c = clienteRepo.save(c);

        String token = jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
        return new Tenant(agencia, u, c, token);
    }

    @SuppressWarnings("null")
    private ResponseEntity<String> post(String url, String token, String body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.setBearerAuth(token);
        return rest.exchange(url, HttpMethod.POST, new HttpEntity<>(body, h), String.class);
    }

    private ResponseEntity<String> guardar(Tenant t, long clienteId, String monto, String tipo) {
        String tipoJson = tipo == null ? "" : ",\"tipo\":\"" + tipo + "\"";
        return post("/api/v1/transacciones/guardar", t.token(),
                "{\"clienteId\":" + clienteId + ",\"monto\":" + monto + tipoJson + "}");
    }

    private List<Transaccion> movimientosDe(Cliente c) {
        return transaccionRepo.findAll().stream()
                .filter(t -> t.getCliente() != null && c.getId().equals(t.getCliente().getId()))
                .toList();
    }

    @SuppressWarnings("null")
    private Cliente recargar(Cliente c) {
        return clienteRepo.findById(c.getId()).orElseThrow();
    }

    private CrmAgentTools herramientaIa(Tenant t) {
        return new CrmAgentTools(t.agencia().getId(), clienteRepo, etapaRepo, etiquetaRepo, respuestaRepo,
                transaccionService, t.usuario());
    }

    // ════════════════════════════════════════════════════════════════════════
    // /api/v1/transacciones/guardar (el que usa el chat)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Carga y retiro actualizan el saldo y quedan registrados como movimientos")
    void cargaYRetiroActualizanSaldoYRegistranMovimientos() {
        Tenant a = crearTenant("TxA");

        assertThat(guardar(a, a.cliente().getId(), "50", "CARGA").getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(guardar(a, a.cliente().getId(), "20", "RETIRO").getStatusCode()).isEqualTo(HttpStatus.OK);

        Cliente c = recargar(a.cliente());
        assertThat(c.getSaldo()).isEqualByComparingTo("30");
        assertThat(c.getCargaTotal()).isEqualByComparingTo("50");

        List<Transaccion> movs = movimientosDe(c);
        assertThat(movs).hasSize(2);
        assertThat(movs).extracting(Transaccion::getTipo).containsExactlyInAnyOrder("CARGA", "RETIRO");
        assertThat(movs).allSatisfy(m -> assertThat(m.getUsuario().getId()).isEqualTo(a.usuario().getId()));
    }

    @Test
    @DisplayName("El tipo en minúsculas se acepta y se guarda en mayúsculas (reportes filtran por 'CARGA')")
    void tipoEnMinusculasSeNormaliza() {
        Tenant a = crearTenant("TxMin");

        assertThat(guardar(a, a.cliente().getId(), "10", "carga").getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(movimientosDe(a.cliente())).extracting(Transaccion::getTipo).containsExactly("CARGA");
        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("10");
    }

    @Test
    @DisplayName("Un tipo inválido, vacío o ausente retorna 400 y no cambia el saldo")
    void tipoInvalidoRetorna400() {
        Tenant a = crearTenant("TxTipo");

        assertThat(guardar(a, a.cliente().getId(), "10", "foo").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(guardar(a, a.cliente().getId(), "10", "").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(guardar(a, a.cliente().getId(), "10", null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("0");
        assertThat(movimientosDe(a.cliente())).isEmpty();
    }

    @Test
    @DisplayName("Un monto cero o negativo retorna 400")
    void montoInvalidoRetorna400() {
        Tenant a = crearTenant("TxMonto");

        assertThat(guardar(a, a.cliente().getId(), "0", "CARGA").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(guardar(a, a.cliente().getId(), "-5", "CARGA").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(movimientosDe(a.cliente())).isEmpty();
    }

    @Test
    @DisplayName("Operar sobre un contacto de otra agencia retorna 404 y no cambia su saldo")
    void contactoAjenoRetorna404() {
        Tenant a = crearTenant("TxAjA");
        Tenant b = crearTenant("TxAjB");

        ResponseEntity<String> resp = guardar(a, b.cliente().getId(), "999", "CARGA");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(recargar(b.cliente()).getSaldo()).isEqualByComparingTo("0");
        assertThat(movimientosDe(b.cliente())).isEmpty();
    }

    @Test
    @DisplayName("Sin token retorna 401")
    void sinTokenRetorna401() {
        ResponseEntity<String> resp = post("/api/v1/transacciones/guardar", null,
                "{\"clienteId\":1,\"monto\":10,\"tipo\":\"CARGA\"}");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ════════════════════════════════════════════════════════════════════════
    // /api/v1/clientes/{id}/saldo
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("/clientes/{id}/saldo también deja un movimiento registrado")
    void endpointSaldoRegistraMovimiento() {
        Tenant a = crearTenant("SaldoA");

        ResponseEntity<String> sumar = post("/api/v1/clientes/" + a.cliente().getId() + "/saldo?monto=40&accion=sumar",
                a.token(), null);
        ResponseEntity<String> restar = post("/api/v1/clientes/" + a.cliente().getId() + "/saldo?monto=15&accion=restar",
                a.token(), null);

        assertThat(sumar.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restar.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("25");
        assertThat(movimientosDe(a.cliente())).extracting(Transaccion::getTipo)
                .containsExactlyInAnyOrder("CARGA", "RETIRO");
    }

    @Test
    @DisplayName("/clientes/{id}/saldo sobre un contacto ajeno se rechaza y no cambia nada")
    void endpointSaldoContactoAjeno() {
        Tenant a = crearTenant("SaldoAjA");
        Tenant b = crearTenant("SaldoAjB");

        ResponseEntity<String> resp = post("/api/v1/clientes/" + b.cliente().getId() + "/saldo?monto=40&accion=sumar",
                a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(recargar(b.cliente()).getSaldo()).isEqualByComparingTo("0");
        assertThat(movimientosDe(b.cliente())).isEmpty();
    }

    // ════════════════════════════════════════════════════════════════════════
    // Precisión decimal (montos exactos, NUMERIC(14,2))
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Decimales exactos: tres cargas de 0.10 suman 0.30 (con double daba 0.30000000000000004)")
    void sumasDecimalesSonExactas() {
        Tenant a = crearTenant("Dec");

        for (int i = 0; i < 3; i++) {
            assertThat(guardar(a, a.cliente().getId(), "0.10", "CARGA").getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        // compareTo exacto: 0.30, no 0.30000000000000004
        assertThat(recargar(a.cliente()).getSaldo().compareTo(new BigDecimal("0.30"))).isZero();
        assertThat(recargar(a.cliente()).getCargaTotal().compareTo(new BigDecimal("0.30"))).isZero();
    }

    @Test
    @DisplayName("Un monto con más de 2 decimales se redondea a centavos; uno que queda en 0 se rechaza")
    void montoSeRedondeaACentavos() {
        Tenant a = crearTenant("Redond");

        assertThat(guardar(a, a.cliente().getId(), "10.005", "CARGA").getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(recargar(a.cliente()).getSaldo().compareTo(new BigDecimal("10.01"))).isZero();

        assertThat(guardar(a, a.cliente().getId(), "0.004", "CARGA").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Dashboard: los totales de carga y retiro coinciden con los movimientos registrados")
    @SuppressWarnings({ "unchecked", "rawtypes" })
    void dashboardSumaLosMovimientos() {
        Tenant a = crearTenant("Dash");
        guardar(a, a.cliente().getId(), "100.50", "CARGA");
        guardar(a, a.cliente().getId(), "0.25", "CARGA");
        guardar(a, a.cliente().getId(), "30", "RETIRO");

        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(a.token());
        ResponseEntity<java.util.Map> resp = rest.exchange("/api/v1/dashboard/stats", HttpMethod.GET,
                new HttpEntity<>(h), java.util.Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(new BigDecimal(String.valueOf(resp.getBody().get("totalCarga"))))
                .isEqualByComparingTo("100.75");
        assertThat(new BigDecimal(String.valueOf(resp.getBody().get("totalRetiro"))))
                .isEqualByComparingTo("30");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Agente de IA (CrmAgentTools.ajustarSaldo) — se ejecuta la herramienta
    // directamente, sin depender de OpenAI
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("IA: ajustar saldo con monto positivo registra una CARGA a nombre del usuario")
    void iaSumaYRegistraCarga() {
        Tenant a = crearTenant("IaPos");

        String resultado = herramientaIa(a).ajustarSaldo(a.cliente().getId(), 100.0);

        assertThat(resultado).startsWith("✓");
        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("100");
        List<Transaccion> movs = movimientosDe(a.cliente());
        assertThat(movs).hasSize(1);
        assertThat(movs.get(0).getTipo()).isEqualTo("CARGA");
        assertThat(movs.get(0).getMonto()).isEqualByComparingTo("100");
        assertThat(movs.get(0).getUsuario().getId()).isEqualTo(a.usuario().getId());
    }

    @Test
    @DisplayName("IA: ajustar saldo con monto negativo registra un RETIRO por el valor absoluto")
    void iaRestaYRegistraRetiro() {
        Tenant a = crearTenant("IaNeg");
        herramientaIa(a).ajustarSaldo(a.cliente().getId(), 100.0);

        String resultado = herramientaIa(a).ajustarSaldo(a.cliente().getId(), -30.0);

        assertThat(resultado).startsWith("✓");
        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("70");
        assertThat(movimientosDe(a.cliente())).extracting(Transaccion::getTipo)
                .containsExactlyInAnyOrder("CARGA", "RETIRO");
    }

    @Test
    @DisplayName("IA: un ajuste de monto cero no cambia el saldo ni crea movimientos")
    void iaMontoCeroNoHaceNada() {
        Tenant a = crearTenant("IaCero");

        String resultado = herramientaIa(a).ajustarSaldo(a.cliente().getId(), 0.0);

        assertThat(resultado).startsWith("Error");
        assertThat(recargar(a.cliente()).getSaldo()).isEqualByComparingTo("0");
        assertThat(movimientosDe(a.cliente())).isEmpty();
    }

    @Test
    @DisplayName("IA: no puede ajustar el saldo de un contacto de otra agencia")
    void iaNoTocaContactosAjenos() {
        Tenant a = crearTenant("IaAjA");
        Tenant b = crearTenant("IaAjB");

        String resultado = herramientaIa(a).ajustarSaldo(b.cliente().getId(), 500.0);

        assertThat(resultado).startsWith("Error");
        assertThat(recargar(b.cliente()).getSaldo()).isEqualByComparingTo("0");
        assertThat(movimientosDe(b.cliente())).isEmpty();
    }
}
