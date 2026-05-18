import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestTemplate;

import model.Agencia;
import model.ContactoCampania;
import model.Dispositivo;
import model.EnvioCampania;
import model.MensajeCampania;
import model.PlantillaCampania;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.ContactoCampaniaRepository;
import repository.DispositivoRepository;
import repository.EnvioCampaniaRepository;
import repository.MensajeCampaniaRepository;
import repository.PlanRepository;
import repository.PlantillaCampaniaRepository;
import repository.UsuarioRepository;
import service.CampaniaService;
import service.CloudStorageService;
import service.TelegramBridgeService;
import service.WhatsAppService;
import service.WhatsAppService.MensajeEntranteRequest;

/**
 * Tests del módulo de campañas (/spam).
 *
 * Cubre:
 *   - Importación de contactos desde Excel (incluye duplicados e inválidos)
 *   - Encolado de campañas con renderizado de plantilla {nombre}
 *   - Skip automático si ya se contactó al lead en los últimos 30 días
 *   - Worker procesa la cola PENDING → SENT cuando el bot responde OK
 *   - Worker marca FAILED cuando el bot no responde
 *   - Aislamiento: webhook entrante para device CAMPANIAS crea ContactoCampania
 *     y MensajeCampania, NO crea Cliente ni Mensaje del embudo principal
 *   - CRUD de plantillas
 *   - Multi-tenant: agencia A no puede ver/borrar recursos de agencia B
 */
class CampaniaIntegrationTest extends BaseIntegrationTest {

    @Autowired CampaniaService campaniaService;
    @Autowired WhatsAppService whatsAppService;
    @Autowired ContactoCampaniaRepository contactoRepo;
    @Autowired MensajeCampaniaRepository mensajeRepo;
    @Autowired EnvioCampaniaRepository envioRepo;
    @Autowired PlantillaCampaniaRepository plantillaRepo;
    @Autowired DispositivoRepository dispositivoRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    // RestTemplate mockeado: simulamos el bot sin levantarlo
    @MockitoBean RestTemplate restTemplate;

    private Agencia agencia;
    private Dispositivo deviceCampania;
    private Dispositivo devicePrincipal;

    @BeforeEach
    @SuppressWarnings("null")
    void setUp() {
        // Limpiar para que cada test arranque limpio
        envioRepo.deleteAll();
        mensajeRepo.deleteAll();
        contactoRepo.deleteAll();
        plantillaRepo.deleteAll();

        agencia = agenciaRepo.save(new Agencia("CampTest_" + System.nanoTime(), "CT_" + System.nanoTime()));

        Plan planFree = planRepo.findByNombre("FREE").orElseThrow();
        Usuario admin = new Usuario();
        admin.setUsername("camp_admin_" + System.nanoTime());
        admin.setPassword("$2a$10$dummyhashvalue1234567890123456");
        admin.setEmail("camp" + System.nanoTime() + "@test.com");
        admin.setRol("ADMIN");
        admin.setAgencia(agencia);
        admin.setPlan(planFree);
        admin.setVerificado(true);
        usuarioRepo.save(admin);

        // Device de campañas (el que vamos a testear)
        deviceCampania = new Dispositivo("BurnerTest", "agencia_" + agencia.getId() + "_camp", agencia,
                Dispositivo.Plataforma.WHATSAPP);
        deviceCampania.setProposito(Dispositivo.Proposito.CAMPANIAS);
        deviceCampania.setEstado("CONNECTED");
        deviceCampania.setActivo(true);
        deviceCampania = dispositivoRepo.save(deviceCampania);

        // Device principal (para validar aislamiento)
        devicePrincipal = new Dispositivo("MainTest", "agencia_" + agencia.getId() + "_main", agencia,
                Dispositivo.Plataforma.WHATSAPP);
        devicePrincipal.setProposito(Dispositivo.Proposito.PRINCIPAL);
        devicePrincipal.setEstado("CONNECTED");
        devicePrincipal.setActivo(true);
        devicePrincipal = dispositivoRepo.save(devicePrincipal);
    }

    // ════════════════════════════════════════════════════════════════════════
    // IMPORTACIÓN DE CONTACTOS
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Importar Excel: filas válidas se guardan, inválidas se descartan, duplicadas no se dupliquen")
    void importarExcel_filtraInvalidosYDuplicados() throws Exception {
        byte[] excel = construirExcel(
                new String[]{"Nombre", "Telefono"},        // header
                new String[]{"Juan",  "5491111111111"},    // válido
                new String[]{"Maria", "5492222222222"},    // válido
                new String[]{"",      "5493333333333"},    // nombre vacío → se rellena "Sin nombre"
                new String[]{"Pedro", "123"},              // teléfono muy corto → inválido
                new String[]{"Ana",   ""},                 // sin teléfono → inválido
                new String[]{"Juan2", "5491111111111"}     // duplicado del primero
        );
        MockMultipartFile file = new MockMultipartFile("file", "leads.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", excel);

        Map<String, Object> resumen = campaniaService.importarContactosDesdeExcel(deviceCampania, agencia, file);

        assertThat(resumen.get("importados")).isEqualTo(3);   // Juan, Maria, "Sin nombre"
        assertThat(resumen.get("duplicados")).isEqualTo(1);   // Juan2 con mismo tel que Juan
        assertThat(resumen.get("invalidos")).isEqualTo(2);    // Pedro (tel corto), Ana (sin tel)

        List<ContactoCampania> contactos = contactoRepo.findByDispositivoIdOrderByFechaImportadoDesc(deviceCampania.getId());
        assertThat(contactos).hasSize(3);
        assertThat(contactos).extracting(ContactoCampania::getNombre)
                .containsExactlyInAnyOrder("Juan", "Maria", "Sin nombre");
    }

    @Test
    @DisplayName("Importar a device PRINCIPAL falla: solo se permite en devices CAMPANIAS")
    void importarADevicePrincipalFalla() {
        MockMultipartFile file = new MockMultipartFile("file", "x.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new byte[0]);

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> campaniaService.importarContactosDesdeExcel(devicePrincipal, agencia, file)
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENCOLADO DE CAMPAÑAS
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Encolar campaña renderiza {nombre} y crea una fila PENDING por contacto")
    void encolarCampania_renderizaYCreaPending() {
        ContactoCampania c1 = crearContacto("Juan",  "5491111111111");
        ContactoCampania c2 = crearContacto("Maria", "5492222222222");

        Map<String, Object> resumen = campaniaService.encolarCampania(
                deviceCampania, agencia,
                List.of(c1.getId(), c2.getId()),
                "Hola {nombre}, te escribo por X",
                null
        );

        assertThat(resumen.get("encolados")).isEqualTo(2);
        assertThat(resumen.get("salteados")).isEqualTo(0);

        List<EnvioCampania> envios = envioRepo.findAll();
        assertThat(envios).hasSize(2);
        assertThat(envios).allMatch(e -> e.getEstado() == EnvioCampania.Estado.PENDING);
        assertThat(envios).extracting(EnvioCampania::getTextoRenderizado)
                .containsExactlyInAnyOrder(
                        "Hola Juan, te escribo por X",
                        "Hola Maria, te escribo por X"
                );
    }

    @Test
    @DisplayName("Skip automático: contacto ya enviado SENT en últimos 30 días queda SKIPPED")
    void encolarCampania_skipeaContactoYaEnviadoRecientemente() {
        ContactoCampania c = crearContacto("Repetido", "5491111111111");

        // Simulamos que ya hubo un envío SENT hace 5 días
        EnvioCampania previo = new EnvioCampania();
        previo.setContacto(c);
        previo.setDispositivo(deviceCampania);
        previo.setAgencia(agencia);
        previo.setTextoRenderizado("Hola Repetido");
        previo.setEstado(EnvioCampania.Estado.SENT);
        previo.setFechaCreado(LocalDateTime.now().minusDays(5));
        previo.setFechaEnviado(LocalDateTime.now().minusDays(5));
        envioRepo.save(previo);

        Map<String, Object> resumen = campaniaService.encolarCampania(
                deviceCampania, agencia,
                List.of(c.getId()),
                "Hola {nombre}, otra vez",
                null
        );

        assertThat(resumen.get("encolados")).isEqualTo(0);
        assertThat(resumen.get("salteados")).isEqualTo(1);

        // El nuevo envío queda en SKIPPED, no en PENDING
        long skipped = envioRepo.findAll().stream()
                .filter(e -> e.getEstado() == EnvioCampania.Estado.SKIPPED).count();
        assertThat(skipped).isEqualTo(1);
    }

    @Test
    @DisplayName("Encolar a device PRINCIPAL falla")
    void encolarADevicePrincipalFalla() {
        ContactoCampania c = crearContacto("X", "5499999999999");
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> campaniaService.encolarCampania(
                        devicePrincipal, agencia, List.of(c.getId()), "Hola", null)
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // WORKER (procesarTick) — la cola PENDING → SENT/FAILED
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Worker procesa PENDING y los marca SENT cuando el bot responde 2xx")
    void worker_marcaSentCuandoBotResponde() {
        mockBotResponde2xx();

        ContactoCampania c = crearContacto("Test", "5491111111111");
        campaniaService.encolarCampania(deviceCampania, agencia, List.of(c.getId()),
                "Hola {nombre}", null);

        campaniaService.procesarTick();

        EnvioCampania envio = envioRepo.findAll().get(0);
        assertThat(envio.getEstado()).isEqualTo(EnvioCampania.Estado.SENT);
        assertThat(envio.getFechaEnviado()).isNotNull();
    }

    @Test
    @DisplayName("Worker marca FAILED cuando el bot devuelve error")
    void worker_marcaFailedCuandoBotFalla() {
        mockBotFalla();

        ContactoCampania c = crearContacto("Test", "5491111111111");
        campaniaService.encolarCampania(deviceCampania, agencia, List.of(c.getId()),
                "Hola {nombre}", null);

        campaniaService.procesarTick();

        EnvioCampania envio = envioRepo.findAll().get(0);
        assertThat(envio.getEstado()).isEqualTo(EnvioCampania.Estado.FAILED);
        assertThat(envio.getErrorMsg()).isNotBlank();
    }

    @Test
    @DisplayName("Worker no procesa si el device está desconectado")
    void worker_noProcesaSiDeviceDesconectado() {
        deviceCampania.setEstado("DISCONNECTED");
        dispositivoRepo.save(deviceCampania);

        ContactoCampania c = crearContacto("Test", "5491111111111");
        campaniaService.encolarCampania(deviceCampania, agencia, List.of(c.getId()),
                "Hola {nombre}", null);

        campaniaService.procesarTick();

        EnvioCampania envio = envioRepo.findAll().get(0);
        assertThat(envio.getEstado()).isEqualTo(EnvioCampania.Estado.PENDING);
    }

    // ════════════════════════════════════════════════════════════════════════
    // AISLAMIENTO: webhook entrante a device CAMPANIAS
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Webhook entrante a device CAMPANIAS crea ContactoCampania, NO crea Cliente del embudo")
    void webhookEntranteACampanias_noCreaCliente() {
        long clientesAntes = clienteRepo.count();
        long contactosAntes = contactoRepo.count();

        // Simulamos un mensaje entrante al device CAMPANIAS
        whatsAppService.procesarMensajeRobot(new MensajeEntranteRequest(
                "5491111111111@s.whatsapp.net",  // from (con sufijo, lo limpia el service)
                "Hola, vi tu mensaje",
                "Juan Lead",
                deviceCampania.getSessionId(),
                null, "TEXTO", null, null
        ));

        // No se creó ningún Cliente
        assertThat(clienteRepo.count()).isEqualTo(clientesAntes);
        // Se creó un ContactoCampania
        assertThat(contactoRepo.count()).isEqualTo(contactosAntes + 1);
        // Y un MensajeCampania de tipo IN
        List<MensajeCampania> mensajes = mensajeRepo.findAll();
        assertThat(mensajes).hasSize(1);
        assertThat(mensajes.get(0).getDireccion()).isEqualTo(MensajeCampania.Direccion.IN);
        assertThat(mensajes.get(0).getTexto()).isEqualTo("Hola, vi tu mensaje");
    }

    @Test
    @DisplayName("Webhook entrante a device PRINCIPAL no toca tablas de campañas")
    void webhookEntranteAPrincipal_noCreaContactoCampania() {
        long contactosCampaniaAntes = contactoRepo.count();

        whatsAppService.procesarMensajeRobot(new MensajeEntranteRequest(
                "5491111111111@s.whatsapp.net",
                "Mensaje al principal",
                "Cliente Real",
                devicePrincipal.getSessionId(),
                null, "TEXTO", null, null
        ));

        // No se creó ningún ContactoCampania (el flow del embudo creó un Cliente)
        assertThat(contactoRepo.count()).isEqualTo(contactosCampaniaAntes);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHATS: responder manual + bandeja
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("responderManual envía al bot y guarda MensajeCampania OUT")
    void responderManual_guardaMensajeOut() {
        mockBotResponde2xx();

        ContactoCampania c = crearContacto("Test", "5491111111111");

        MensajeCampania m = campaniaService.responderManual(c.getId(), agencia.getId(), "Te respondo");

        assertThat(m.getId()).isNotNull();
        assertThat(m.getDireccion()).isEqualTo(MensajeCampania.Direccion.OUT);
        assertThat(m.getTexto()).isEqualTo("Te respondo");
        assertThat(m.isLeido()).isTrue();
    }

    // ════════════════════════════════════════════════════════════════════════
    // PLANTILLAS
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("CRUD de plantillas funciona y respeta multi-tenant")
    void plantillas_crud() {
        PlantillaCampania p = campaniaService.crearPlantilla(agencia, "Bienvenida", "Hola {nombre}!");
        assertThat(p.getId()).isNotNull();

        List<PlantillaCampania> lista = campaniaService.listarPlantillas(agencia.getId());
        assertThat(lista).hasSize(1);
        assertThat(lista.get(0).getCuerpo()).isEqualTo("Hola {nombre}!");

        campaniaService.eliminarPlantilla(p.getId(), agencia.getId());
        assertThat(campaniaService.listarPlantillas(agencia.getId())).isEmpty();
    }

    @SuppressWarnings("null")
    @Test
    @DisplayName("Eliminar plantilla de otra agencia no la borra (multi-tenant)")
    void plantillas_otraAgenciaNoBorra() {
        Agencia otra = agenciaRepo.save(new Agencia("Otra_" + System.nanoTime(), "OT_" + System.nanoTime()));
        PlantillaCampania p = campaniaService.crearPlantilla(otra, "X", "Y");

        campaniaService.eliminarPlantilla(p.getId(), agencia.getId());

        // Sigue existiendo
        assertThat(plantillaRepo.findById(p.getId())).isPresent();
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════════════

    private ContactoCampania crearContacto(String nombre, String telefono) {
        ContactoCampania c = new ContactoCampania();
        c.setNombre(nombre);
        c.setTelefono(telefono);
        c.setDispositivo(deviceCampania);
        c.setAgencia(agencia);
        return contactoRepo.save(c);
    }

    private byte[] construirExcel(String[]... rows) throws Exception {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Contactos");
            for (int i = 0; i < rows.length; i++) {
                Row row = sheet.createRow(i);
                for (int j = 0; j < rows[i].length; j++) {
                    row.createCell(j).setCellValue(rows[i][j]);
                }
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    @SuppressWarnings({"null", "unchecked"})
    private void mockBotResponde2xx() {
        ResponseEntity<Map<String, Object>> okResponse =
                ResponseEntity.ok(Map.<String, Object>of("status", "SENT", "id", "WA_123"));
        when(restTemplate.exchange(
                contains("/send-message"),
                eq(HttpMethod.POST),
                any(),
                any(ParameterizedTypeReference.class)
        )).thenReturn(okResponse);
    }

    @SuppressWarnings({"null", "unchecked"})
    private void mockBotFalla() {
        when(restTemplate.exchange(
                contains("/send-message"),
                eq(HttpMethod.POST),
                any(),
                any(ParameterizedTypeReference.class)
        )).thenThrow(new RuntimeException("Bot offline"));
    }
}
