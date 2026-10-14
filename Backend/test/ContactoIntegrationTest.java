import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Agencia;
import model.Cliente;
import model.Etapa;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.PlanRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.ExcelService;
import service.TelegramBridgeService;

/**
 * Alta manual de contactos, datos básicos (email/empresa), vendedor responsable,
 * valor estimado del embudo y Excel con las columnas nuevas.
 */
class ContactoIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired TransaccionRepository transaccionRepo;
    @Autowired ExcelService excelService;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private record Tenant(Agencia agencia, Usuario usuario, Etapa etapa, String token) {}

    @AfterEach
    void limpiar() {
        // Base compartida entre clases: otros tests hacen clienteRepo.deleteAll()
        transaccionRepo.deleteAll();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("null")
    private Usuario crearUsuario(Agencia agencia, String prefijo) {
        long n = System.nanoTime();
        Usuario u = new Usuario();
        u.setUsername(prefijo.toLowerCase() + "_" + n);
        u.setPassword("$2a$10$dummyhashvalue1234567890123456");
        u.setEmail(prefijo.toLowerCase() + n + "@test.com");
        u.setRol("ADMIN");
        u.setAgencia(agencia);
        u.setPlan(planRepo.findByNombre("FREE").orElseThrow());
        u.setVerificado(true);
        return usuarioRepo.save(u);
    }

    @SuppressWarnings("null")
    private Tenant crearTenant(String prefijo) {
        long n = System.nanoTime();
        Agencia agencia = agenciaRepo.save(new Agencia(prefijo + "_" + n, prefijo + "_" + n));
        Usuario u = crearUsuario(agencia, prefijo);
        Etapa etapa = new Etapa("Inicial " + prefijo, 1, true);
        etapa.setAgencia(agencia);
        etapa = etapaRepo.save(etapa);
        String token = jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
        return new Tenant(agencia, u, etapa, token);
    }

    @SuppressWarnings("null")
    private Cliente crearCliente(Tenant t, String nombre, String telefono) {
        Cliente c = new Cliente(nombre, telefono, null, t.etapa());
        c.setAgencia(t.agencia());
        return clienteRepo.save(c);
    }

    @SuppressWarnings("null")
    private ResponseEntity<String> llamar(HttpMethod m, String url, String token, String body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(token);
        return rest.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    @SuppressWarnings("null")
    private Cliente recargar(Cliente c) {
        return clienteRepo.findById(c.getId()).orElseThrow();
    }

    // ════════════════════════════════════════════════════════════════════════
    // Alta manual (tarea 21)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Crear contacto a mano: queda en la etapa inicial, origen MANUAL y teléfono normalizado")
    void crearContactoManual() {
        Tenant a = crearTenant("CtaMan");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"  Ana Pérez \",\"telefono\":\"11 5555-1234\",\"email\":\"ana@ejemplo.com\","
                        + "\"empresa\":\"ACME\",\"notas\":\"Referida\",\"valorEstimado\":1500.50}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Cliente c = clienteRepo.findByAgenciaIdAndTelefono(a.agencia().getId(), "5491155551234").orElseThrow();
        assertThat(c.getNombre()).isEqualTo("Ana Pérez");
        assertThat(c.getEmail()).isEqualTo("ana@ejemplo.com");
        assertThat(c.getEmpresa()).isEqualTo("ACME");
        assertThat(c.getOrigen()).isEqualTo("MANUAL");
        assertThat(c.getEtapa().getId()).isEqualTo(a.etapa().getId());
        assertThat(c.getValorEstimado()).isEqualByComparingTo("1500.50");
        assertThat(c.getSaldo()).isEqualByComparingTo("0");
        assertThat(c.getAgencia().getId()).isEqualTo(a.agencia().getId());
    }

    @Test
    @DisplayName("Crear contacto: nombre vacío, teléfono inválido o email inválido retornan 400")
    void crearContactoValidaDatos() {
        Tenant a = crearTenant("CtaVal");

        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"  \",\"telefono\":\"1155551234\"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"Ana\",\"telefono\":\"123\"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"Ana\",\"telefono\":\"1155551234\",\"email\":\"no-es-email\"}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"Ana\",\"telefono\":\"1155551234\",\"valorEstimado\":-5}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(clienteRepo.findAll().stream()
                .filter(c -> c.getAgencia() != null && c.getAgencia().getId().equals(a.agencia().getId()))).isEmpty();
    }

    @Test
    @DisplayName("Crear contacto con un teléfono ya existente en la agencia retorna 409")
    void crearContactoDuplicado() {
        Tenant a = crearTenant("CtaDup");
        crearCliente(a, "Existente", "5491155559999");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"Otro\",\"telefono\":\"11 5555 9999\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("El mismo teléfono en dos agencias distintas no es un duplicado")
    void mismoTelefonoEnOtraAgenciaEsValido() {
        Tenant a = crearTenant("CtaDosA");
        Tenant b = crearTenant("CtaDosB");
        crearCliente(b, "De B", "5491155558888");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"De A\",\"telefono\":\"1155558888\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Crear contacto respeta el límite de contactos del plan (402)")
    @SuppressWarnings("null")
    void crearContactoRespetaLimiteDelPlan() {
        Tenant a = crearTenant("CtaLim");
        Plan free = planRepo.findByNombre("FREE").orElseThrow();
        int limite = free.getMaxContactos();
        for (int i = 0; i < limite; i++) {
            Cliente c = new Cliente("Relleno " + i, "54911" + String.format("%08d", i), null, a.etapa());
            c.setAgencia(a.agencia());
            clienteRepo.save(c);
        }

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/clientes", a.token(),
                "{\"nombre\":\"De más\",\"telefono\":\"1166660000\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PAYMENT_REQUIRED);
    }

    @Test
    @DisplayName("Crear contacto sin token retorna 401")
    void crearContactoSinToken() {
        ResponseEntity<String> resp = rest.postForEntity("/api/v1/clientes",
                Map.of("nombre", "X", "telefono", "1155551234"), String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Email, empresa y valor (tareas 22 y 24)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Editar contacto: actualiza email, empresa y valor; un texto vacío los borra")
    void editarDatosBasicos() {
        Tenant a = crearTenant("Edit");
        Cliente c = crearCliente(a, "Editable", "5491150000001");

        ResponseEntity<String> r1 = llamar(HttpMethod.PUT, "/api/v1/clientes/" + c.getId(), a.token(),
                "{\"nombre\":\"Editado\",\"notas\":\"n\",\"email\":\"x@y.com\",\"empresa\":\"Mi Empresa\",\"valorEstimado\":2500}");
        assertThat(r1.getStatusCode()).isEqualTo(HttpStatus.OK);
        Cliente despues = recargar(c);
        assertThat(despues.getNombre()).isEqualTo("Editado");
        assertThat(despues.getEmail()).isEqualTo("x@y.com");
        assertThat(despues.getEmpresa()).isEqualTo("Mi Empresa");
        assertThat(despues.getValorEstimado()).isEqualByComparingTo("2500");

        llamar(HttpMethod.PUT, "/api/v1/clientes/" + c.getId(), a.token(),
                "{\"nombre\":\"Editado\",\"email\":\"\",\"empresa\":\"\"}");
        assertThat(recargar(c).getEmail()).isNull();
        assertThat(recargar(c).getEmpresa()).isNull();
    }

    @Test
    @DisplayName("Editar con nombre vacío conserva el nombre anterior (antes rompía con 500)")
    void editarConNombreVacioConservaElAnterior() {
        Tenant a = crearTenant("EditNom");
        Cliente c = crearCliente(a, "Nombre Original", "5491150000002");

        ResponseEntity<String> resp = llamar(HttpMethod.PUT, "/api/v1/clientes/" + c.getId(), a.token(),
                "{\"nombre\":\"\",\"notas\":\"solo notas\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(recargar(c).getNombre()).isEqualTo("Nombre Original");
        assertThat(recargar(c).getNotas()).isEqualTo("solo notas");
    }

    @Test
    @DisplayName("Editar un contacto de otra agencia se rechaza y no cambia nada")
    void editarContactoAjeno() {
        Tenant a = crearTenant("EditAjA");
        Tenant b = crearTenant("EditAjB");
        Cliente ajeno = crearCliente(b, "Ajeno", "5491150000003");

        ResponseEntity<String> resp = llamar(HttpMethod.PUT, "/api/v1/clientes/" + ajeno.getId(), a.token(),
                "{\"nombre\":\"HACKEADO\",\"email\":\"h@h.com\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(recargar(ajeno).getNombre()).isEqualTo("Ajeno");
        assertThat(recargar(ajeno).getEmail()).isNull();
    }

    @Test
    @DisplayName("Valor del embudo: suma el valor estimado por etapa y el total, solo de la propia agencia")
    @SuppressWarnings({ "null", "unchecked", "rawtypes" })
    void valorDelEmbudoPorEtapa() {
        Tenant a = crearTenant("ValA");
        Tenant b = crearTenant("ValB");
        Cliente c1 = crearCliente(a, "V1", "5491150000011");
        c1.setValorEstimado(new BigDecimal("1000.10"));
        clienteRepo.save(c1);
        Cliente c2 = crearCliente(a, "V2", "5491150000012");
        c2.setValorEstimado(new BigDecimal("500.20"));
        clienteRepo.save(c2);
        Cliente ajeno = crearCliente(b, "VB", "5491150000013");
        ajeno.setValorEstimado(new BigDecimal("99999"));
        clienteRepo.save(ajeno);

        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(a.token());
        ResponseEntity<Map> resp = rest.exchange("/api/v1/embudo/valor", HttpMethod.GET, new HttpEntity<>(h), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(new BigDecimal(String.valueOf(resp.getBody().get("total")))).isEqualByComparingTo("1500.30");
        List<Map<String, Object>> porEtapa = (List<Map<String, Object>>) resp.getBody().get("porEtapa");
        assertThat(porEtapa).hasSize(1);
        assertThat(((Number) porEtapa.get(0).get("etapaId")).longValue()).isEqualTo(a.etapa().getId());
        assertThat(new BigDecimal(String.valueOf(porEtapa.get(0).get("valor")))).isEqualByComparingTo("1500.30");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Vendedor responsable (tarea 23)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Asignar y quitar el responsable de un contacto con un miembro del equipo")
    void asignarYQuitarResponsable() {
        Tenant a = crearTenant("RespA");
        Usuario vendedor = crearUsuario(a.agencia(), "RespVend");
        Cliente c = crearCliente(a, "Con responsable", "5491150000021");

        ResponseEntity<String> asignar = llamar(HttpMethod.PATCH,
                "/api/v1/clientes/" + c.getId() + "/responsable?usuarioId=" + vendedor.getId(), a.token(), null);
        assertThat(asignar.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(recargar(c).getResponsableId()).isEqualTo(vendedor.getId());

        ResponseEntity<String> quitar = llamar(HttpMethod.PATCH,
                "/api/v1/clientes/" + c.getId() + "/responsable", a.token(), null);
        assertThat(quitar.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(recargar(c).getResponsableId()).isNull();
    }

    @Test
    @DisplayName("No se puede asignar como responsable a un usuario de otra agencia")
    void responsableDeOtraAgenciaSeRechaza() {
        Tenant a = crearTenant("RespAjA");
        Tenant b = crearTenant("RespAjB");
        Cliente c = crearCliente(a, "Contacto", "5491150000022");

        ResponseEntity<String> resp = llamar(HttpMethod.PATCH,
                "/api/v1/clientes/" + c.getId() + "/responsable?usuarioId=" + b.usuario().getId(), a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(recargar(c).getResponsableId()).isNull();
    }

    @Test
    @DisplayName("No se puede asignar responsable a un contacto de otra agencia (404)")
    void asignarResponsableAContactoAjeno() {
        Tenant a = crearTenant("RespCtAjA");
        Tenant b = crearTenant("RespCtAjB");
        Cliente ajeno = crearCliente(b, "Ajeno", "5491150000023");

        ResponseEntity<String> resp = llamar(HttpMethod.PATCH,
                "/api/v1/clientes/" + ajeno.getId() + "/responsable?usuarioId=" + a.usuario().getId(), a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(recargar(ajeno).getResponsableId()).isNull();
    }

    // ════════════════════════════════════════════════════════════════════════
    // Excel con email y empresa (tarea 22)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Excel: la exportación incluye email y empresa y la importación los lee")
    void excelExportaEImportaEmailYEmpresa() throws Exception {
        Cliente c = new Cliente("Exportado", "5491150000031", null, null);
        c.setEmail("exp@test.com");
        c.setEmpresa("Exp SA");

        byte[] xlsx = excelService.exportarClientes(List.of(c)).readAllBytes();
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            Row header = wb.getSheetAt(0).getRow(0);
            assertThat(header.getCell(2).getStringCellValue()).isEqualTo("Email");
            assertThat(header.getCell(3).getStringCellValue()).isEqualTo("Empresa");
            Row fila = wb.getSheetAt(0).getRow(1);
            assertThat(fila.getCell(2).getStringCellValue()).isEqualTo("exp@test.com");
            assertThat(fila.getCell(3).getStringCellValue()).isEqualTo("Exp SA");
        }

        // Y se puede volver a importar el mismo archivo
        List<Cliente> importados = excelService.importarClientes(
                new MockMultipartFile("file", "c.xlsx", "application/vnd.ms-excel", xlsx));
        assertThat(importados).hasSize(1);
        assertThat(importados.get(0).getEmail()).isEqualTo("exp@test.com");
        assertThat(importados.get(0).getEmpresa()).isEqualTo("Exp SA");
    }

    @Test
    @DisplayName("Excel viejo (Nombre, Teléfono, Fecha): la fecha de la 3ª columna no se toma como email")
    void importacionDeArchivoViejoIgnoraLaFecha() throws Exception {
        byte[] xlsx;
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet s = wb.createSheet("Contactos");
            Row h = s.createRow(0);
            h.createCell(0).setCellValue("Nombre");
            h.createCell(1).setCellValue("Teléfono");
            h.createCell(2).setCellValue("Fecha Registro");
            Row r = s.createRow(1);
            r.createCell(0).setCellValue("Viejo");
            r.createCell(1).setCellValue("5491150000032");
            r.createCell(2).setCellValue("14/10/2026 01:00");
            wb.write(out);
            xlsx = out.toByteArray();
        }

        List<Cliente> importados = excelService.importarClientes(
                new MockMultipartFile("file", "v.xlsx", "application/vnd.ms-excel", xlsx));

        assertThat(importados).hasSize(1);
        assertThat(importados.get(0).getEmail()).isNull();
        assertThat(importados.get(0).getEmpresa()).isNull();
    }
}
