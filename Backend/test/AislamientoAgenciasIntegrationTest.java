import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
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
import model.Plan;
import model.RespuestaRapida;
import model.Transaccion;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.PlanRepository;
import repository.RespuestaRapidaRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.TelegramBridgeService;

/**
 * Aislamiento entre agencias (multi-tenant): una agencia nunca puede ver ni
 * modificar los datos de otra. Cubre las correcciones de seguridad de
 * reporte Excel, etapas del embudo y respuestas rápidas.
 *
 * Cada test crea sus propias agencias con nombres únicos, así que no depende del
 * orden ni de lo que dejen otros tests en la base compartida.
 */
class AislamientoAgenciasIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired TransaccionRepository transaccionRepo;
    @Autowired RespuestaRapidaRepository respuestaRepo;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    /** Una agencia completa: usuario ADMIN, una etapa, un contacto y su token. */
    private record Tenant(Agencia agencia, Usuario usuario, Etapa etapa, Cliente cliente, String token) {}

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

        Cliente c = new Cliente("Cliente " + prefijo + " " + n, "5491" + (n % 100000000), null, etapa);
        c.setAgencia(agencia);
        c.setSaldo(BigDecimal.ZERO);
        c = clienteRepo.save(c);

        String token = jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
        return new Tenant(agencia, u, etapa, c, token);
    }

    @SuppressWarnings("null")
    private HttpEntity<String> auth(String token, String body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(token);
        return new HttpEntity<>(body, h);
    }

    private ResponseEntity<String> llamar(HttpMethod metodo, String url, String token, String body) {
        return rest.exchange(url, metodo, auth(token, body), String.class);
    }

    // ════════════════════════════════════════════════════════════════════════
    // REPORTE EXCEL
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Reporte Excel: cada agencia ve solo sus propias transacciones")
    @SuppressWarnings("null")
    void reporteExcelSoloIncluyeTransaccionesDeLaPropiaAgencia() throws Exception {
        Tenant a = crearTenant("RepA");
        Tenant b = crearTenant("RepB");
        transaccionRepo.save(new Transaccion(a.cliente(), a.usuario(), new BigDecimal("111"), "CARGA"));
        transaccionRepo.save(new Transaccion(b.cliente(), b.usuario(), new BigDecimal("222"), "CARGA"));

        // La zona se fija a la del servidor: el reporte filtra por "hoy" en esa zona
        String url = "/api/v1/reportes/descargar/excel?timezone=" + ZoneId.systemDefault().getId();
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(a.token());
        ResponseEntity<byte[]> resp = rest.exchange(url, HttpMethod.GET, new HttpEntity<>(h), byte[].class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<String> celdas = textoDeCeldas(resp.getBody());
        assertThat(celdas).anyMatch(s -> s.contains(a.cliente().getNombre()));
        assertThat(celdas).noneMatch(s -> s.contains(b.cliente().getNombre()));
    }

    @Test
    @DisplayName("Reporte Excel: sin token retorna 401")
    void reporteExcelSinTokenRequiereAuth() {
        ResponseEntity<String> resp = rest.getForEntity("/api/v1/reportes/descargar/excel", String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private List<String> textoDeCeldas(byte[] xlsx) throws Exception {
        List<String> out = new ArrayList<>();
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            for (Sheet sheet : wb) {
                for (Row row : sheet) {
                    for (Cell cell : row) {
                        out.add(cell.toString());
                    }
                }
            }
        }
        return out;
    }

    // ════════════════════════════════════════════════════════════════════════
    // ETAPAS DEL EMBUDO
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Etapas: renombrar una etapa propia funciona")
    void etapaPropiaSePuedeRenombrar() {
        Tenant a = crearTenant("EtA");

        ResponseEntity<String> resp = llamar(HttpMethod.PUT, "/api/v1/etapas/" + a.etapa().getId(),
                a.token(), "{\"nombre\":\"Renombrada\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(etapaRepo.findById(a.etapa().getId()).orElseThrow().getNombre()).isEqualTo("Renombrada");
    }

    @Test
    @DisplayName("Etapas: renombrar la etapa de otra agencia retorna 404 y no cambia nada")
    void renombrarEtapaAjenaRetorna404() {
        Tenant a = crearTenant("EtRenA");
        Tenant b = crearTenant("EtRenB");
        String nombreOriginal = b.etapa().getNombre();

        ResponseEntity<String> resp = llamar(HttpMethod.PUT, "/api/v1/etapas/" + b.etapa().getId(),
                a.token(), "{\"nombre\":\"HACKEADA\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(etapaRepo.findById(b.etapa().getId()).orElseThrow().getNombre()).isEqualTo(nombreOriginal);
    }

    @Test
    @DisplayName("Etapas: borrar la etapa de otra agencia retorna 404 y la etapa sigue existiendo")
    void borrarEtapaAjenaRetorna404() {
        Tenant a = crearTenant("EtDelA");
        Tenant b = crearTenant("EtDelB");

        ResponseEntity<String> resp = llamar(HttpMethod.DELETE, "/api/v1/etapas/" + b.etapa().getId(),
                a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(etapaRepo.existsById(b.etapa().getId())).isTrue();
    }

    @Test
    @DisplayName("Etapas: borrar una etapa propia sin contactos funciona; con contactos retorna 400")
    @SuppressWarnings("null")
    void borrarEtapaPropiaRespetaContactos() {
        Tenant a = crearTenant("EtDelProp");
        // a.etapa() tiene un contacto asignado: no se puede borrar
        ResponseEntity<String> conContactos = llamar(HttpMethod.DELETE, "/api/v1/etapas/" + a.etapa().getId(),
                a.token(), null);
        assertThat(conContactos.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        Etapa vacia = new Etapa("Vacia", 2, false);
        vacia.setAgencia(a.agencia());
        vacia = etapaRepo.save(vacia);

        ResponseEntity<String> resp = llamar(HttpMethod.DELETE, "/api/v1/etapas/" + vacia.getId(), a.token(), null);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(etapaRepo.existsById(vacia.getId())).isFalse();
    }

    @Test
    @DisplayName("Etapas: reordenar mezclando una etapa ajena retorna 404 y no cambia ningún orden")
    @SuppressWarnings("null")
    void reordenarConEtapaAjenaNoCambiaNada() {
        Tenant a = crearTenant("EtOrdA");
        Tenant b = crearTenant("EtOrdB");
        Integer ordenA = a.etapa().getOrden();
        Integer ordenB = b.etapa().getOrden();

        String cuerpo = "[" + b.etapa().getId() + "," + a.etapa().getId() + "]";
        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/etapas/reordenar", a.token(), cuerpo);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(etapaRepo.findById(a.etapa().getId()).orElseThrow().getOrden()).isEqualTo(ordenA);
        assertThat(etapaRepo.findById(b.etapa().getId()).orElseThrow().getOrden()).isEqualTo(ordenB);
    }

    @Test
    @DisplayName("Etapas: reordenar con IDs repetidos o lista vacía retorna 400")
    void reordenarListaInvalidaRetorna400() {
        Tenant a = crearTenant("EtOrdInv");
        long id = a.etapa().getId();

        assertThat(llamar(HttpMethod.POST, "/api/v1/etapas/reordenar", a.token(), "[]").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/etapas/reordenar", a.token(), "[" + id + "," + id + "]")
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Etapas: 'hacer principal' con una etapa ajena retorna 404 y la principal propia no se desmarca")
    @SuppressWarnings("null")
    void hacerPrincipalAjenaNoDesmarcaLaPropia() {
        Tenant a = crearTenant("EtPrinA");
        Tenant b = crearTenant("EtPrinB");
        assertThat(etapaRepo.findById(a.etapa().getId()).orElseThrow().isEsInicial()).isTrue();

        ResponseEntity<String> resp = llamar(HttpMethod.PUT,
                "/api/v1/etapas/" + b.etapa().getId() + "/hacer-principal", a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(etapaRepo.findById(a.etapa().getId()).orElseThrow().isEsInicial()).isTrue();
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESPUESTAS RÁPIDAS
    // ════════════════════════════════════════════════════════════════════════

    @SuppressWarnings("null")
    private RespuestaRapida crearRespuesta(Tenant t, String atajo, String texto) {
        RespuestaRapida r = new RespuestaRapida();
        r.setAtajo(atajo);
        r.setRespuesta(texto);
        r.setAgencia(t.agencia());
        r.setUsuario(t.usuario());
        return respuestaRepo.save(r);
    }

    @Test
    @DisplayName("Respuestas rápidas: crear y borrar una propia funciona")
    @SuppressWarnings({ "null", "unchecked" })
    void crearYBorrarRespuestaPropia() throws Exception {
        Tenant a = crearTenant("RrA");

        ResponseEntity<String> creada = llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"atajo\":\"hola\",\"respuesta\":\"Hola, ¿en qué te ayudo?\"}");
        assertThat(creada.getStatusCode()).isEqualTo(HttpStatus.OK);

        RespuestaRapida guardada = respuestaRepo.findByAgenciaAndAtajo(a.agencia(), "hola").orElseThrow();
        ResponseEntity<String> borrada = llamar(HttpMethod.DELETE,
                "/api/v1/respuestas-rapidas/" + guardada.getId(), a.token(), null);

        assertThat(borrada.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(respuestaRepo.existsById(guardada.getId())).isFalse();
    }

    @Test
    @DisplayName("Respuestas rápidas: borrar la de otra agencia retorna 404 y sigue existiendo")
    void borrarRespuestaAjenaRetorna404() {
        Tenant a = crearTenant("RrDelA");
        Tenant b = crearTenant("RrDelB");
        RespuestaRapida ajena = crearRespuesta(b, "ajena", "texto ajeno");

        ResponseEntity<String> resp = llamar(HttpMethod.DELETE,
                "/api/v1/respuestas-rapidas/" + ajena.getId(), a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(respuestaRepo.existsById(ajena.getId())).isTrue();
    }

    @Test
    @DisplayName("Respuestas rápidas: editar la de otra agencia retorna 404 y no cambia su texto ni su dueño")
    @SuppressWarnings("null")
    void editarRespuestaAjenaRetorna404() {
        Tenant a = crearTenant("RrPutA");
        Tenant b = crearTenant("RrPutB");
        RespuestaRapida ajena = crearRespuesta(b, "ajena", "texto original");

        ResponseEntity<String> resp = llamar(HttpMethod.PUT,
                "/api/v1/respuestas-rapidas/" + ajena.getId(), a.token(),
                "{\"atajo\":\"ajena\",\"respuesta\":\"PISADA\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        RespuestaRapida despues = respuestaRepo.findById(ajena.getId()).orElseThrow();
        assertThat(despues.getRespuesta()).isEqualTo("texto original");
        assertThat(despues.getAgencia().getId()).isEqualTo(b.agencia().getId());
    }

    @Test
    @DisplayName("Respuestas rápidas: un POST con el id de una ajena crea una nueva y no pisa la ajena")
    @SuppressWarnings("null")
    void postConIdAjenoNoPisaLaOriginal() {
        Tenant a = crearTenant("RrPostA");
        Tenant b = crearTenant("RrPostB");
        RespuestaRapida ajena = crearRespuesta(b, "ajena", "texto original");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"id\":" + ajena.getId() + ",\"atajo\":\"nueva\",\"respuesta\":\"mi texto\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        RespuestaRapida original = respuestaRepo.findById(ajena.getId()).orElseThrow();
        assertThat(original.getRespuesta()).isEqualTo("texto original");
        assertThat(original.getAgencia().getId()).isEqualTo(b.agencia().getId());
        assertThat(respuestaRepo.findByAgenciaAndAtajo(a.agencia(), "nueva")).isPresent();
    }

    @Test
    @DisplayName("Respuestas rápidas: sin atajo o sin texto retorna 400 (no 500)")
    void respuestaIncompletaRetorna400() {
        Tenant a = crearTenant("RrValA");

        assertThat(llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"respuesta\":\"sin atajo\"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"atajo\":\"sintexto\"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"atajo\":\"  \",\"respuesta\":\"x\"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Respuestas rápidas: un atajo repetido en la agencia retorna 400")
    void atajoDuplicadoRetorna400() {
        Tenant a = crearTenant("RrDupA");
        crearRespuesta(a, "repetido", "uno");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(),
                "{\"atajo\":\"repetido\",\"respuesta\":\"dos\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PEDIDOS MAL FORMADOS (400 y no 500)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Pedidos mal formados responden 400 y no 500")
    void pedidosMalFormadosRetornan400() {
        Tenant a = crearTenant("Malf");

        // Falta el parámetro obligatorio ?color=
        assertThat(llamar(HttpMethod.PATCH, "/api/v1/etapas/" + a.etapa().getId() + "/color", a.token(), null)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // JSON roto
        assertThat(llamar(HttpMethod.POST, "/api/v1/respuestas-rapidas", a.token(), "{no es json")
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // ID que no es un número
        assertThat(llamar(HttpMethod.PUT, "/api/v1/etapas/abc", a.token(), "{\"nombre\":\"x\"}")
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
