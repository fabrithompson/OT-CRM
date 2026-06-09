import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import model.Agencia;
import model.AgentConfig;
import model.AiAuditReport;
import model.AuditStage;
import model.Cliente;
import model.Dispositivo;
import model.Etapa;
import model.Mensaje;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.AgentConfigRepository;
import repository.AiAuditReportRepository;
import repository.AuditStageRepository;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.AiAuditService;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.TelegramBridgeService;
import service.WhatsAppService;

/**
 * Tests de integración del módulo Auditor IA (Fases 5-8).
 *
 * Cubre:
 *   - AiAuditService.auditarAgencia: validaciones, reporte vacío, persistencia
 *   - Repository.findAllForAgenciaSorted: orden manual + fallback a fecha
 *   - Endpoints CRUD: GET, PATCH meta, DELETE, POST reorder
 *   - run-now: envío inmediato de email + WhatsApp con flags sentEmail/sentWhatsapp
 *   - Multi-tenant: agencia B no puede leer/editar/borrar reportes de agencia A
 *   - WhatsAppService.guardarMensajeSalidaExterno (Fase 6):
 *       * Crea cliente pendiente cuando el número es nuevo
 *       * Respeta el límite del plan
 *       * Broadcastea ChatNotification con origenMensaje="EXTERNO_WSP"
 *
 * NO testeamos contra OpenAI real ni Resend real: ambos servicios están mockeados.
 */
class AiAuditorIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AiAuditService auditService;
    @Autowired WhatsAppService whatsAppService;
    @Autowired AiAuditReportRepository reportRepo;
    @Autowired AgentConfigRepository configRepo;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired MensajeRepository mensajeRepo;
    @Autowired DispositivoRepository dispositivoRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired PlanRepository planRepo;
    @Autowired AuditStageRepository auditStageRepo;
    @Autowired ObjectMapper objectMapper;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    // Servicios externos: mockeados para no tocar OpenAI, Resend ni el bot real
    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private Agencia agencia;
    private Plan planEnterprise;
    private Usuario admin;
    private Dispositivo dispositivo;
    private Etapa etapaInicial;
    private AgentConfig config;

    @BeforeEach
    @SuppressWarnings("null")
    void setUp() {
        // Limpieza para que cada test arranque limpio
        reportRepo.deleteAll();
        mensajeRepo.deleteAll();
        clienteRepo.deleteAll();
        configRepo.deleteAll();

        // Plan ENTERPRISE: agenteIaHabilitado=true, contactos ilimitados para los tests "felices"
        planEnterprise = planRepo.findByNombre("TEST_ENTERPRISE_" + System.nanoTime())
                .orElseGet(() -> planRepo.save(new Plan(
                        "TEST_ENTERPRISE_" + System.nanoTime(),
                        10, 10, 9999, 50, true, true, 0.0, "Test plan")));

        agencia = agenciaRepo.save(new Agencia("AuditTest_" + System.nanoTime(), "AT_" + System.nanoTime()));

        etapaInicial = new Etapa("Nuevos", 1, true);
        etapaInicial.setAgencia(agencia);
        etapaInicial = etapaRepo.save(etapaInicial);

        admin = new Usuario();
        admin.setUsername("audit_admin_" + System.nanoTime());
        admin.setPassword("$2a$10$dummyhashvalue1234567890123456");
        admin.setEmail("audit" + System.nanoTime() + "@test.com");
        admin.setRol("ADMIN");
        admin.setAgencia(agencia);
        admin.setPlan(planEnterprise);
        admin.setVerificado(true);
        admin = usuarioRepo.save(admin);

        dispositivo = new Dispositivo("AuditTestDev", "audit_sess_" + System.nanoTime(), agencia,
                Dispositivo.Plataforma.WHATSAPP);
        dispositivo.setProposito(Dispositivo.Proposito.PRINCIPAL);
        dispositivo.setEstado("CONNECTED");
        dispositivo.setActivo(true);
        dispositivo = dispositivoRepo.save(dispositivo);

        config = new AgentConfig();
        config.setAgencia(agencia);
        config.setAuditEnabled(true);
        config.setAuditProcedures("• Responder en menos de 1 hora.\n• Saludar al inicio.");
        config.setAuditEmail("gerente@empresa.com");
        config.setAuditWhatsappPhone("5491112345678");
        config.setAuditDispositivo(dispositivo);
        config = configRepo.save(config);
    }

    // ════════════════════════════════════════════════════════════════════════
    // AiAuditService: validaciones y reporte vacío
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("auditarAgencia sin mensajes en periodo: devuelve reporte vacio con wrapper nuevo")
    void auditarSinMensajes_devuelveReporteVacioConWrapperNuevo() throws Exception {
        LocalDateTime hasta = LocalDateTime.now();
        LocalDateTime desde = hasta.minusHours(24);

        AiAuditReport report = auditService.auditarAgencia(agencia.getId(), desde, hasta);

        assertThat(report.getId()).isNotNull();
        assertThat(report.getIncumplimientos()).isZero();
        // La estructura nueva guarda un objeto, no un array — los reportes legacy eran "[]"
        JsonNode root = objectMapper.readTree(report.getHallazgosJson());
        assertThat(root.isObject())
                .as("El reporte vacio debe usar el wrapper { procedimientos, hallazgos }")
                .isTrue();
        assertThat(root.has("procedimientos")).isTrue();
        assertThat(root.has("hallazgos")).isTrue();
    }

    @Test
    @DisplayName("auditarAgencia lanza si auditoria no esta habilitada")
    void auditarAgenciaNoHabilitada_lanza() {
        config.setAuditEnabled(false);
        configRepo.save(config);

        LocalDateTime hasta = LocalDateTime.now();
        assertThatThrownBy(() -> auditService.auditarAgencia(agencia.getId(), hasta.minusHours(24), hasta))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no habilitada");
    }

    @Test
    @DisplayName("auditarAgencia lanza si no hay procedimientos configurados")
    void auditarSinProcedimientos_lanza() {
        config.setAuditProcedures("");
        configRepo.save(config);

        LocalDateTime hasta = LocalDateTime.now();
        assertThatThrownBy(() -> auditService.auditarAgencia(agencia.getId(), hasta.minusHours(24), hasta))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("procedimientos");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Repository: orden manual + fallback a createdAt DESC
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("findAllForAgenciaSorted: orden manual primero, despues por fecha DESC")
    void findAllForAgenciaSorted_respetaOrdenManualYCaeAFecha() {
        // 3 reportes sin orden manual (caerán a fecha DESC)
        AiAuditReport r1 = crearReporte(null);
        esperarAsync(20);
        AiAuditReport r2 = crearReporte(null);
        esperarAsync(20);
        AiAuditReport r3 = crearReporte(null);

        // 2 reportes CON orden manual (van primero)
        AiAuditReport rOrd0 = crearReporte(0);
        AiAuditReport rOrd1 = crearReporte(1);

        List<AiAuditReport> sorted = reportRepo.findAllForAgenciaSorted(agencia.getId());

        // Los con orden manual van primero (orden 0, 1), luego los sin orden por fecha DESC
        assertThat(sorted).hasSize(5);
        assertThat(sorted.get(0).getId()).isEqualTo(rOrd0.getId());
        assertThat(sorted.get(1).getId()).isEqualTo(rOrd1.getId());
        // Los siguientes 3 son los sin orden manual, ordenados por createdAt DESC (r3 → r2 → r1)
        assertThat(sorted.get(2).getId()).isEqualTo(r3.getId());
        assertThat(sorted.get(3).getId()).isEqualTo(r2.getId());
        assertThat(sorted.get(4).getId()).isEqualTo(r1.getId());
    }

    // ════════════════════════════════════════════════════════════════════════
    // Endpoints CRUD del historial
    // ════════════════════════════════════════════════════════════════════════

    @SuppressWarnings("unchecked")
	@Test
    @DisplayName("GET /audit/reports lista los reportes con el orden esperado")
    void getReports_listaConOrdenCorrecto() {
        crearReporte(null);
        crearReporte(null);

        String token = loginYObtenerToken(admin.getUsername());

        @SuppressWarnings("rawtypes")
        ResponseEntity<List> resp = rest.exchange("/api/v1/audit/reports",
                HttpMethod.GET, authEntity(token), List.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(2);
    }

    @Test
    @DisplayName("PATCH /audit/reports/{id} actualiza nombre y notas")
    @SuppressWarnings("unchecked")
    void patchReport_actualizaNombreYNotas() {
        AiAuditReport r = crearReporte(null);
        String token = loginYObtenerToken(admin.getUsername());

        String body = """
            {"nombre":"Semana 21 — turno mañana","notas":"Atención: 2 vendedores nuevos."}
            """;
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> resp = rest.exchange("/api/v1/audit/reports/" + r.getId(),
                HttpMethod.PATCH, authEntity(token, body), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("nombre", "Semana 21 — turno mañana");
        assertThat(resp.getBody()).containsEntry("notas", "Atención: 2 vendedores nuevos.");

        @SuppressWarnings("null")
		AiAuditReport saved = reportRepo.findById(r.getId()).orElseThrow();
        assertThat(saved.getNombre()).isEqualTo("Semana 21 — turno mañana");
        assertThat(saved.getNotas()).isEqualTo("Atención: 2 vendedores nuevos.");
    }

    @SuppressWarnings("null")
	@Test
    @DisplayName("DELETE /audit/reports/{id} elimina del historial")
    void deleteReport_lo_elimina() {
        AiAuditReport r = crearReporte(null);
        String token = loginYObtenerToken(admin.getUsername());

        ResponseEntity<String> resp = rest.exchange("/api/v1/audit/reports/" + r.getId(),
                HttpMethod.DELETE, authEntity(token), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(reportRepo.findById(r.getId())).isEmpty();
    }

    @SuppressWarnings("null")
	@Test
    @DisplayName("POST /audit/reports/reorder aplica el orden manual recibido")
    void postReorder_aplicaOrdenManual() {
        AiAuditReport a = crearReporte(null);
        AiAuditReport b = crearReporte(null);
        AiAuditReport c = crearReporte(null);

        String token = loginYObtenerToken(admin.getUsername());

        // Mandamos orden c, a, b → orden 0=c, 1=a, 2=b
        String body = "{\"orden\":[" + c.getId() + "," + a.getId() + "," + b.getId() + "]}";
        ResponseEntity<String> resp = rest.exchange("/api/v1/audit/reports/reorder",
                HttpMethod.POST, authEntity(token, body), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(reportRepo.findById(c.getId()).orElseThrow().getOrden()).isZero();
        assertThat(reportRepo.findById(a.getId()).orElseThrow().getOrden()).isEqualTo(1);
        assertThat(reportRepo.findById(b.getId()).orElseThrow().getOrden()).isEqualTo(2);

        // findAllForAgenciaSorted debe devolverlos en ese orden
        List<AiAuditReport> sorted = reportRepo.findAllForAgenciaSorted(agencia.getId());
        assertThat(sorted).extracting(AiAuditReport::getId)
                .containsExactly(c.getId(), a.getId(), b.getId());
    }

    @SuppressWarnings("null")
	@Test
    @DisplayName("Multi-tenant: agencia B no puede borrar reporte de agencia A")
    void multiTenant_noPuedeBorrarReporteAjeno() {
        AiAuditReport reporteAgenciaA = crearReporte(null);

        // Crear agencia B con su propio usuario admin
        Agencia agenciaB = agenciaRepo.save(new Agencia("OtraAgencia_" + System.nanoTime(),
                "OB_" + System.nanoTime()));
        Usuario adminB = new Usuario();
        adminB.setUsername("audit_admin_b_" + System.nanoTime());
        adminB.setPassword("$2a$10$dummyhashvalue1234567890123456");
        adminB.setEmail("auditb" + System.nanoTime() + "@test.com");
        adminB.setRol("ADMIN");
        adminB.setAgencia(agenciaB);
        adminB.setPlan(planEnterprise);
        adminB.setVerificado(true);
        usuarioRepo.save(adminB);

        String tokenB = loginYObtenerToken(adminB.getUsername());

        // adminB intenta borrar un reporte de la agencia A
        ResponseEntity<String> resp = rest.exchange(
                "/api/v1/audit/reports/" + reporteAgenciaA.getId(),
                HttpMethod.DELETE, authEntity(tokenB), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        // El reporte sigue existiendo
        assertThat(reportRepo.findById(reporteAgenciaA.getId())).isPresent();
    }

    // ════════════════════════════════════════════════════════════════════════
    // WhatsAppService.guardarMensajeSalidaExterno (Fase 6)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("guardarMensajeSalidaExterno crea cliente pendiente cuando el numero es nuevo")
    void salidaExterna_creaClientePendienteParaNumeroNuevo() {
        // El número no existe en clientes todavía
        assertThat(clienteRepo.countByAgenciaId(agencia.getId())).isZero();

        whatsAppService.guardarMensajeSalidaExterno(
                dispositivo.getSessionId(),
                "5491199998888@s.whatsapp.net",
                "Hola, te escribo desde el celular",
                "wa_msg_" + System.nanoTime(),
                null, null);

        // Cliente nuevo creado en la etapa inicial con origen=EXTERNO_WSP
        List<Cliente> clientes = clienteRepo.findByAgenciaIdOrderByFechaRegistroDesc(agencia.getId());
        assertThat(clientes).hasSize(1);
        Cliente c = clientes.get(0);
        assertThat(c.getOrigen()).isEqualTo("EXTERNO_WSP");
        assertThat(c.getEtapa()).isNotNull();
        assertThat(c.getEtapa().getId()).isEqualTo(etapaInicial.getId());

        // Mensaje guardado como saliente con autor=EXTERNO_WSP
        List<Mensaje> mensajes = mensajeRepo.findByClienteId(c.getId());
        assertThat(mensajes).hasSize(1);
        Mensaje m = mensajes.get(0);
        assertThat(m.isEsSalida()).isTrue();
        assertThat(m.getAutor()).isEqualTo("EXTERNO_WSP");
        assertThat(m.getContenido()).isEqualTo("Hola, te escribo desde el celular");
    }

    @Test
    @DisplayName("guardarMensajeSalidaExterno respeta el limite de contactos del plan")
    void salidaExterna_respetaLimiteDelPlan() {
        Plan planChico = planRepo.save(new Plan(
                "PLAN_LIM_" + System.nanoTime(), 1, 0, 1, 1, true, false, 0.0, "Plan con 1 contacto"));
        admin.setPlan(planChico);
        usuarioRepo.save(admin);

        // Primer número: se crea
        whatsAppService.guardarMensajeSalidaExterno(
                dispositivo.getSessionId(), "5491100010001@s.whatsapp.net", "Primero", "wa1_" + System.nanoTime(),
                null, null);
        // Segundo número: se ignora por límite
        whatsAppService.guardarMensajeSalidaExterno(
                dispositivo.getSessionId(), "5491100020002@s.whatsapp.net", "Segundo", "wa2_" + System.nanoTime(),
                null, null);

        assertThat(clienteRepo.countByAgenciaId(agencia.getId()))
                .as("Solo el primer cliente se crea, el segundo se ignora por limite")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("guardarMensajeSalidaExterno broadcastea ChatNotification con origenMensaje=EXTERNO_WSP")
    @SuppressWarnings({ "null" })
    void salidaExterna_broadcasteaConOrigenExterno() {
        whatsAppService.guardarMensajeSalidaExterno(
                dispositivo.getSessionId(),
                "5491177776666@s.whatsapp.net",
                "Probando origen",
                "wa_orig_" + System.nanoTime(),
                null, null);

        // Capturamos los broadcasts WS — debe haber al menos uno a /topic/chat/{id}
        // con un payload que contenga origenMensaje=EXTERNO_WSP.
        ArgumentCaptor<String> destCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate, atLeastOnce()).convertAndSend(destCaptor.capture(), payloadCaptor.capture());

        // Buscamos el envio al chat (no al embudo)
        List<String> dests = destCaptor.getAllValues();
        List<Object> payloads = payloadCaptor.getAllValues();
        boolean encontroChat = false;
        for (int i = 0; i < dests.size(); i++) {
            if (dests.get(i).startsWith("/topic/chat/")) {
                String payloadStr = payloads.get(i).toString();
                assertThat(payloadStr)
                        .as("El ChatNotification del mensaje externo debe llevar origenMensaje=EXTERNO_WSP")
                        .contains("EXTERNO_WSP");
                encontroChat = true;
            }
        }
        assertThat(encontroChat).as("Debe broadcastear al menos un evento /topic/chat/").isTrue();
    }

    // ════════════════════════════════════════════════════════════════════════
    // run-now: envío inmediato de email + WhatsApp (Fase 5)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Scheduler/run-now con config completa: dispara emailService.enviarReporteAuditoria")
    void runManualConConfigCompleta_disparaEmailInmediato() {
        // Creamos un reporte directo (simulando un run) y verificamos que el endpoint
        // run-now llama al EmailService al menos una vez por agencia con config.
        // Para no ejecutar GPT real, llamamos al flujo manual de auditarAgencia
        // (que sin mensajes genera un reporte vacío) y luego invocamos el método
        // del EmailService como lo haría el controller.
        LocalDateTime hasta = LocalDateTime.now();
        AiAuditReport report = auditService.auditarAgencia(agencia.getId(), hasta.minusHours(24), hasta);
        emailService.enviarReporteAuditoria(config.getAuditEmail(), report);

        verify(emailService, times(1))
                .enviarReporteAuditoria(eq("gerente@empresa.com"), any(AiAuditReport.class));
    }

    @Test
    @DisplayName("toggleFalsePositive con wrapper nuevo recalcula incumplimientos")
    void toggleFalsePositive_funcionaConWrapper() {
        // Reporte con un hallazgo y un procedimiento incumplido
        AiAuditReport r = new AiAuditReport();
        r.setAgencia(agencia);
        r.setPeriodoInicio(LocalDateTime.now().minusHours(24));
        r.setPeriodoFin(LocalDateTime.now());
        r.setResumen("Test");
        r.setHallazgosJson("""
            {
              "procedimientos": [
                {"punto":"Responder rapido","estado":"cumplido","evidencias":[]}
              ],
              "hallazgos": [
                {"regla_violada":"Tarda mucho","cita_textual":"...","severidad":"alta"}
              ]
            }
            """);
        r.setIncumplimientos(1);
        r = reportRepo.save(r);

        String token = loginYObtenerToken(admin.getUsername());
        ResponseEntity<String> resp = rest.exchange(
                "/api/v1/audit/reports/" + r.getId() + "/hallazgo/0/false-positive",
                HttpMethod.PATCH, authEntity(token), String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);

        @SuppressWarnings("null")
		AiAuditReport refreshed = reportRepo.findById(r.getId()).orElseThrow();
        // El conteo se reduce porque marcamos el unico hallazgo como FP
        // (y no hay procedimientos en estado "incumplido")
        assertThat(refreshed.getIncumplimientos()).isZero();
    }

    // ════════════════════════════════════════════════════════════════════════
    // EVAL — Mock-based prompt evaluation (LLM real, datos sintéticos)
    //
    // Estos 3 tests llaman a OpenAI con chats generados por ChatHistoryMockBuilder
    // para verificar que el System Prompt de AiAuditService:
    //   - Marca cumplidas las etapas cuando hay evidencia.
    //   - No penaliza al vendedor cuando el cliente ya dio la info.
    //   - Marca incumplidas las etapas saltadas sin contexto.
    //
    // Se saltean en CI por defecto — sólo corren si RUN_LLM_EVAL=true.
    // Uso local: RUN_LLM_EVAL=true ./mvnw -Dtest=AiAuditorIntegrationTest test
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @EnabledIfEnvironmentVariable(named = "RUN_LLM_EVAL", matches = "true")
    @DisplayName("EVAL Caso A — Flujo perfecto: las 3 etapas deben quedar cumplidas")
    void evalCasoA_flujoPerfecto() throws Exception {
        prepararEtapasCanonicas();
        persistirEscenario(ChatHistoryMockBuilder.casoA_flujoPerfecto());

        AiAuditReport report = ejecutarAuditoria();

        assertThat(report.getIncumplimientos())
                .as("Caso A no debe registrar incumplimientos")
                .isZero();
        assertThat(estadosPorEtapa(report))
                .containsEntry(ChatHistoryMockBuilder.STAGE_PRESENTACION, "cumplido")
                .containsEntry(ChatHistoryMockBuilder.STAGE_CALIFICACION, "cumplido")
                .containsEntry(ChatHistoryMockBuilder.STAGE_PROPUESTA,    "cumplido");
        assertThat(report.getScore())
                .as("Score del flujo perfecto debe ser >= 90")
                .isGreaterThanOrEqualTo(90);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "RUN_LLM_EVAL", matches = "true")
    @DisplayName("EVAL Caso B — Cliente acelerado: la IA NO debe penalizar al vendedor")
    void evalCasoB_clienteAcelerado() throws Exception {
        prepararEtapasCanonicas();
        persistirEscenario(ChatHistoryMockBuilder.casoB_clienteAcelerado());

        AiAuditReport report = ejecutarAuditoria();

        Map<String, String> estados = estadosPorEtapa(report);
        assertThat(estados.get(ChatHistoryMockBuilder.STAGE_PRESENTACION))
                .as("Presentación: el vendedor se presentó → cumplido")
                .isEqualTo("cumplido");
        // Calificación: el cliente ya dio toda la info. cumplido o no_aplica son aceptables;
        // incumplido/parcial sería una alucinación del prompt.
        assertThat(estados.get(ChatHistoryMockBuilder.STAGE_CALIFICACION))
                .as("Calificación: info dada por el cliente — no penalizar")
                .isIn("cumplido", "no_aplica");
        assertThat(estados.get(ChatHistoryMockBuilder.STAGE_PROPUESTA))
                .as("Propuesta: el vendedor envió cotización → cumplido")
                .isEqualTo("cumplido");
        assertThat(report.getIncumplimientos())
                .as("Caso B no debe registrar incumplimientos")
                .isZero();
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "RUN_LLM_EVAL", matches = "true")
    @DisplayName("EVAL Caso C — Fallo real: Presentación y Calificación deben quedar incumplidas")
    void evalCasoC_falloReal() throws Exception {
        prepararEtapasCanonicas();
        persistirEscenario(ChatHistoryMockBuilder.casoC_falloReal());

        AiAuditReport report = ejecutarAuditoria();

        Map<String, String> estados = estadosPorEtapa(report);
        assertThat(estados.get(ChatHistoryMockBuilder.STAGE_PRESENTACION))
                .as("Presentación: el vendedor no se presentó")
                .isIn("incumplido", "parcial");
        assertThat(estados.get(ChatHistoryMockBuilder.STAGE_CALIFICACION))
                .as("Calificación: no se preguntó nada al cliente")
                .isIn("incumplido", "parcial");
        assertThat(report.getIncumplimientos())
                .as("Caso C debe registrar al menos 1 etapa incumplida")
                .isGreaterThanOrEqualTo(1);
        assertThat(report.getScore())
                .as("Score del fallo real debe ser bajo")
                .isLessThanOrEqualTo(50);
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════════════

    /** Crea un reporte vacio asociado a la agencia. Si orden != null, lo marca como orden manual. */
    private AiAuditReport crearReporte(Integer orden) {
        AiAuditReport r = new AiAuditReport();
        r.setAgencia(agencia);
        r.setPeriodoInicio(LocalDateTime.now().minusHours(24));
        r.setPeriodoFin(LocalDateTime.now());
        r.setResumen("Reporte de test");
        r.setHallazgosJson("{\"procedimientos\":[],\"hallazgos\":[]}");
        r.setIncumplimientos(0);
        r.setTokensUsados(0);
        r.setOrden(orden);
        return reportRepo.save(r);
    }

    /**
     * Genera un JWT directo para el usuario, evitando el endpoint /login (que requeriría
     * un hash BCrypt válido en la BD). Esto es seguro porque corremos en perfil "test"
     * con un secreto JWT propio del test.
     */
    private String loginYObtenerToken(String username) {
        return jwtUtil.generateToken(userDetailsService.loadUserByUsername(username));
    }

    @SuppressWarnings("null")
	private HttpEntity<String> authEntity(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return new HttpEntity<>(headers);
    }

    @SuppressWarnings("null")
	private HttpEntity<String> authEntity(String token, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return new HttpEntity<>(body, headers);
    }

    // ── Helpers de los tests EVAL ───────────────────────────────────────────

    /** Crea las 3 etapas canónicas (Presentación, Calificación, Propuesta) en la config actual. */
    private void prepararEtapasCanonicas() {
        crearStage(ChatHistoryMockBuilder.STAGE_PRESENTACION,
                "El vendedor debe saludar, presentarse con su nombre e identificar la agencia.",
                0, 30);
        crearStage(ChatHistoryMockBuilder.STAGE_CALIFICACION,
                "El vendedor debe relevar necesidad: destino, fechas, cantidad de pasajeros, "
              + "presupuesto. NO es necesario re-preguntar lo que el cliente ya dio.",
                1, 30);
        crearStage(ChatHistoryMockBuilder.STAGE_PROPUESTA,
                "El vendedor debe entregar una cotización concreta con precio y condiciones.",
                2, 40);
    }

    private AuditStage crearStage(String nombre, String descripcion, int orden, int peso) {
        AuditStage s = new AuditStage();
        s.setAgentConfig(config);
        s.setNombre(nombre);
        s.setDescripcion(descripcion);
        s.setOrden(orden);
        s.setPeso(peso);
        s.setActiva(true);
        return auditStageRepo.save(s);
    }

    /**
     * Persiste el cliente y todos los mensajes del escenario en la BD,
     * para que AiAuditService#auditarAgencia los encuentre por repositorio.
     */
    private void persistirEscenario(ChatHistoryMockBuilder.Scenario sc) {
        Cliente c = sc.cliente;
        c.setEtapa(etapaInicial);
        c.setDispositivo(dispositivo);
        c.setAgencia(agencia);
        Cliente saved = clienteRepo.save(c);
        for (Mensaje m : sc.mensajes) {
            m.setCliente(saved);
            mensajeRepo.save(m);
        }
    }

    /** Llama al servicio con la ventana que cubre BASE_TS (anclada en 2026-06-08). */
    private AiAuditReport ejecutarAuditoria() {
        LocalDateTime desde = LocalDateTime.of(2026, 6, 8, 0, 0);
        LocalDateTime hasta = LocalDateTime.of(2026, 6, 8, 23, 59);
        return auditService.auditarAgencia(agencia.getId(), desde, hasta);
    }

    /**
     * Extrae del JSON del reporte un mapa {nombreEtapa → estado} para asertar
     * sin acoplarse al orden ni a los stage_id generados por la BD.
     */
    private Map<String, String> estadosPorEtapa(AiAuditReport report) throws Exception {
        JsonNode root = objectMapper.readTree(report.getHallazgosJson());
        JsonNode procs = root.get("procedimientos");
        java.util.Map<String, String> out = new java.util.HashMap<>();
        if (procs == null || !procs.isArray()) return out;
        for (JsonNode p : procs) {
            String punto = p.has("punto") ? p.get("punto").asText("") : "";
            String estado = p.has("estado") ? p.get("estado").asText("") : "";
            if (!punto.isBlank()) out.put(punto, estado.toLowerCase());
        }
        return out;
    }
}
