import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
import model.Dispositivo;
import model.Etapa;
import model.Mensaje;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;
import repository.PlanRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.HistorialService;
import service.TelegramBridgeService;
import service.WhatsAppService;

/**
 * Importación del historial de WhatsApp/Telegram al vincular una cuenta y
 * deduplicación entre historial y mensajes en vivo.
 */
class HistorialIntegrationTest extends BaseIntegrationTest {

    private static final ZoneId ZONA = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired MensajeRepository mensajeRepo;
    @Autowired DispositivoRepository dispositivoRepo;
    @Autowired TransaccionRepository transaccionRepo;
    @Autowired HistorialService historialService;
    @Autowired WhatsAppService whatsAppService;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @Value("${bot.secret.key}") String botKey;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private record Tenant(Agencia agencia, Usuario usuario, Etapa etapa, Dispositivo wa, Dispositivo tg, String token) {}

    @AfterEach
    void limpiar() {
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

        Etapa etapa = new Etapa("Inicial " + prefijo, 1, true);
        etapa.setAgencia(agencia);
        etapa = etapaRepo.save(etapa);

        Dispositivo wa = new Dispositivo("WA " + prefijo, "wa_" + n, agencia, Dispositivo.Plataforma.WHATSAPP);
        wa.setProposito(Dispositivo.Proposito.PRINCIPAL);
        wa.setEstado("CONNECTED");
        wa.setActivo(true);
        wa = dispositivoRepo.save(wa);

        Dispositivo tg = new Dispositivo("TG " + prefijo, "tg_" + n, agencia, Dispositivo.Plataforma.TELEGRAM);
        tg.setProposito(Dispositivo.Proposito.PRINCIPAL);
        tg.setEstado("CONNECTED");
        tg.setActivo(true);
        tg = dispositivoRepo.save(tg);

        String token = jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
        return new Tenant(agencia, u, etapa, wa, tg, token);
    }

    private static long epoch(int anio, int mes, int dia, int hora, int minuto) {
        return LocalDateTime.of(anio, mes, dia, hora, minuto).atZone(ZONA).toEpochSecond();
    }

    private static HistorialService.MensajeHistorial msj(String tel, String nombre, boolean saliente, String texto,
                                                        long ts, String id) {
        return new HistorialService.MensajeHistorial(tel, nombre, saliente, texto, null, ts, id, null);
    }

    @SuppressWarnings("null")
    private ResponseEntity<String> postConToken(String url, Object body, String token) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.set("X-Bot-Token", token);
        return rest.exchange(url, HttpMethod.POST, new HttpEntity<>(body, h), String.class);
    }

    private List<Mensaje> mensajesDe(Cliente c) {
        return mensajeRepo.findByClienteIdOrderByFechaHoraDesc(c.getId());
    }

    @SuppressWarnings("null")
    private Cliente clientePorTelefono(Tenant t, String tel) {
        return clienteRepo.findByAgenciaIdAndTelefono(t.agencia().getId(), tel).orElseThrow();
    }

    // ════════════════════════════════════════════════════════════════════════
    // WhatsApp
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Historial WhatsApp: crea el contacto, guarda los mensajes con su fecha original y no duplica al reenviar")
    void importaHistorialWhatsApp() {
        Tenant a = crearTenant("HisWa");
        List<HistorialService.MensajeHistorial> lote = List.of(
                msj("1155550001", "Ana", false, "Hola, ¿precio?", epoch(2026, 3, 1, 10, 0), "W1"),
                msj("1155550001", null, true, "Te paso la lista", epoch(2026, 3, 1, 10, 5), "W2"),
                msj("1155550001", "Ana", false, "Gracias", epoch(2026, 3, 2, 9, 0), "W3"));

        ResponseEntity<String> r1 = postConToken("/api/webhook/whatsapp/history",
                Map.of("sessionId", a.wa().getSessionId(), "mensajes", lote), botKey);
        assertThat(r1.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(r1.getBody()).contains("\"mensajesNuevos\":3").contains("\"contactosCreados\":1");

        Cliente c = clientePorTelefono(a, "5491155550001");
        assertThat(c.getNombre()).isEqualTo("Ana");
        assertThat(c.getEtapa().getId()).isEqualTo(a.etapa().getId());
        assertThat(c.getMensajesSinLeer()).isZero(); // el historial no cuenta como no leído
        assertThat(c.getUltimoMensajeResumen()).isEqualTo("Gracias");
        assertThat(c.getUltimoMensajeFecha()).isEqualTo(LocalDateTime.of(2026, 3, 2, 9, 0));

        List<Mensaje> msgs = mensajesDe(c);
        assertThat(msgs).hasSize(3);
        Mensaje saliente = msgs.stream().filter(Mensaje::isEsSalida).findFirst().orElseThrow();
        assertThat(saliente.getAutor()).isEqualTo("EXTERNO_WSP");
        assertThat(saliente.getFechaHora()).isEqualTo(LocalDateTime.of(2026, 3, 1, 10, 5));

        // Reenviar el mismo lote (reintento del bot) no duplica nada
        ResponseEntity<String> r2 = postConToken("/api/webhook/whatsapp/history",
                Map.of("sessionId", a.wa().getSessionId(), "mensajes", lote), botKey);
        assertThat(r2.getBody()).contains("\"mensajesNuevos\":0").contains("\"duplicados\":3");
        assertThat(mensajesDe(c)).hasSize(3);
    }

    @Test
    @DisplayName("Historial: lotes concurrentes del mismo contacto nuevo no duplican contacto ni mensajes")
    @SuppressWarnings("null")
    void lotesConcurrentesNoDuplican() throws Exception {
        Tenant a = crearTenant("HisConc");
        // 8 lotes idénticos (20 mensajes del mismo contacto nuevo) disparados a la vez
        List<HistorialService.MensajeHistorial> lote = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) {
            lote.add(msj("1155559001", "Zoe", i % 2 == 0, "msg " + i, epoch(2026, 4, 1, 9, 0) + i, "CC" + i));
        }
        int hilos = 8;
        var pool = java.util.concurrent.Executors.newFixedThreadPool(hilos);
        var listo = new java.util.concurrent.CountDownLatch(hilos);
        var arranque = new java.util.concurrent.CountDownLatch(1);
        var tareas = new java.util.ArrayList<java.util.concurrent.Future<HistorialService.Resultado>>();
        for (int i = 0; i < hilos; i++) {
            tareas.add(pool.submit(() -> {
                listo.countDown();
                arranque.await();
                return historialService.importar(a.wa().getSessionId(), HistorialService.WHATSAPP, lote, false);
            }));
        }
        listo.await();
        arranque.countDown(); // todos arrancan casi en simultáneo
        int totalNuevos = 0;
        for (var f : tareas) totalNuevos += f.get().mensajesNuevos();
        pool.shutdown();

        // Entre todos los hilos se guardó el lote una sola vez
        assertThat(totalNuevos).isEqualTo(20);
        List<Cliente> clientes = clienteRepo.findByAgenciaIdOrderByFechaRegistroDesc(a.agencia().getId());
        assertThat(clientes).hasSize(1);
        List<Mensaje> msgs = mensajesDe(clientes.get(0));
        assertThat(msgs).hasSize(20);
        assertThat(msgs.stream().map(Mensaje::getWhatsappId).distinct().count()).isEqualTo(20L);
    }

    @Test
    @DisplayName("Historial WhatsApp: sin el token del bot retorna 401")
    void historialSinToken() {
        Tenant a = crearTenant("HisTok");
        ResponseEntity<String> r = postConToken("/api/webhook/whatsapp/history",
                Map.of("sessionId", a.wa().getSessionId(), "mensajes", List.of()), "token-falso");
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("Historial: un contacto existente recibe los mensajes y su nombre genérico se completa")
    @SuppressWarnings("null")
    void contactoExistenteSeCompleta() {
        Tenant a = crearTenant("HisExist");
        Cliente existente = new Cliente("Cliente 5491155550002", "5491155550002", null, a.etapa());
        existente.setAgencia(a.agencia());
        existente.setDispositivo(a.wa());
        existente = clienteRepo.save(existente);

        HistorialService.Resultado r = historialService.importar(a.wa().getSessionId(), HistorialService.WHATSAPP,
                List.of(msj("5491155550002", "Bruno", false, "hola", epoch(2026, 1, 5, 8, 0), "E1")), false);

        assertThat(r.contactosCreados()).isZero();
        assertThat(r.mensajesNuevos()).isEqualTo(1);
        assertThat(clienteRepo.findById(existente.getId()).orElseThrow().getNombre()).isEqualTo("Bruno");
    }

    @Test
    @DisplayName("Historial: sesión desconocida o línea de campañas se ignoran")
    @SuppressWarnings("null")
    void sesionDesconocidaOCampanias() {
        Tenant a = crearTenant("HisIgn");
        Dispositivo camp = new Dispositivo("Camp", "camp_" + System.nanoTime(), a.agencia(), Dispositivo.Plataforma.WHATSAPP);
        camp.setProposito(Dispositivo.Proposito.CAMPANIAS);
        camp.setActivo(true);
        camp = dispositivoRepo.save(camp);
        var lote = List.of(msj("1155550003", "X", false, "hola", epoch(2026, 1, 1, 1, 0), "I1"));

        assertThat(historialService.importar("no-existe", HistorialService.WHATSAPP, lote, false).mensajesNuevos()).isZero();
        assertThat(historialService.importar(camp.getSessionId(), HistorialService.WHATSAPP, lote, false).mensajesNuevos()).isZero();
        assertThat(clienteRepo.findByAgenciaIdAndTelefono(a.agencia().getId(), "5491155550003")).isEmpty();
    }

    @Test
    @DisplayName("Historial: respeta el límite de contactos del plan")
    @SuppressWarnings("null")
    void respetaLimiteDelPlan() {
        Tenant a = crearTenant("HisLim");
        int limite = planRepo.findByNombre("FREE").orElseThrow().getMaxContactos();
        for (int i = 0; i < limite; i++) {
            Cliente c = new Cliente("Relleno " + i, "54922" + String.format("%08d", i), null, a.etapa());
            c.setAgencia(a.agencia());
            clienteRepo.save(c);
        }

        HistorialService.Resultado r = historialService.importar(a.wa().getSessionId(), HistorialService.WHATSAPP,
                List.of(msj("1155550004", "Nuevo", false, "hola", epoch(2026, 1, 1, 1, 0), "L1")), false);

        assertThat(r.omitidosPorLimite()).isEqualTo(1);
        assertThat(r.contactosCreados()).isZero();
        assertThat(clienteRepo.findByAgenciaIdAndTelefono(a.agencia().getId(), "5491155550004")).isEmpty();
    }

    @Test
    @DisplayName("En vivo: un mensaje que ya llegó por el historial no se duplica (mismo id de WhatsApp)")
    void mensajeEnVivoNoDuplicaHistorial() {
        Tenant a = crearTenant("HisVivo");
        historialService.importar(a.wa().getSessionId(), HistorialService.WHATSAPP,
                List.of(msj("1155550005", "Caro", false, "ya importado", epoch(2026, 4, 1, 12, 0), "DUP1")), false);
        Cliente c = clientePorTelefono(a, "5491155550005");

        whatsAppService.procesarMensajeRobot(new WhatsAppService.MensajeEntranteRequest(
                "5491155550005", "ya importado", "Caro", a.wa().getSessionId(), null, "WHATSAPP", null, null,
                "DUP1", epoch(2026, 4, 1, 12, 0)));
        whatsAppService.procesarMensajeRobot(new WhatsAppService.MensajeEntranteRequest(
                "5491155550005", "uno nuevo", "Caro", a.wa().getSessionId(), null, "WHATSAPP", null, null,
                "NUEVO1", epoch(2026, 4, 1, 12, 30)));

        List<Mensaje> msgs = mensajesDe(c);
        assertThat(msgs).hasSize(2);
        assertThat(msgs).extracting(Mensaje::getWhatsappId).containsExactlyInAnyOrder("DUP1", "NUEVO1");
        // La hora del mensaje en vivo es la real, no la de llegada
        assertThat(msgs.stream().filter(m -> "NUEVO1".equals(m.getWhatsappId())).findFirst().orElseThrow()
                .getFechaHora()).isEqualTo(LocalDateTime.of(2026, 4, 1, 12, 30));
    }

    @Test
    @DisplayName("Chat: el historial se ordena por fecha aunque los mensajes viejos se hayan importado después")
    @SuppressWarnings({ "unchecked", "rawtypes", "null" })
    void chatOrdenadoPorFecha() {
        Tenant a = crearTenant("HisOrden");
        // Primero llega uno "en vivo" (hoy) y después el historial (viejo)
        whatsAppService.procesarMensajeRobot(new WhatsAppService.MensajeEntranteRequest(
                "5491155550006", "en vivo", "Dani", a.wa().getSessionId(), null, "WHATSAPP", null, null,
                "VIVO1", null));
        historialService.importar(a.wa().getSessionId(), HistorialService.WHATSAPP, List.of(
                msj("5491155550006", "Dani", false, "viejo 1", epoch(2025, 1, 1, 9, 0), "OLD1"),
                msj("5491155550006", "Dani", true, "viejo 2", epoch(2025, 1, 1, 9, 1), "OLD2")), false);
        Cliente c = clientePorTelefono(a, "5491155550006");

        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(a.token());
        ResponseEntity<List> resp = rest.exchange("/api/v1/chat/" + c.getId() + "/historial?size=50",
                HttpMethod.GET, new HttpEntity<>(h), List.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<String> contenidos = ((List<Map<String, Object>>) resp.getBody()).stream()
                .map(m -> (String) m.get("contenido")).toList();
        assertThat(contenidos).containsExactly("viejo 1", "viejo 2", "en vivo");

        // Paginación hacia atrás desde el mensaje "en vivo": trae los dos viejos
        Object idEnVivo = ((List<Map<String, Object>>) resp.getBody()).get(2).get("id");
        ResponseEntity<List> anteriores = rest.exchange("/api/v1/chat/" + c.getId() + "/historial?size=50&beforeId=" + idEnVivo,
                HttpMethod.GET, new HttpEntity<>(h), List.class);
        assertThat(((List<Map<String, Object>>) anteriores.getBody()).stream().map(m -> (String) m.get("contenido")).toList())
                .containsExactly("viejo 1", "viejo 2");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Telegram
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Historial Telegram: importa por el endpoint del puente sin normalizar el id del usuario")
    void importaHistorialTelegram() {
        Tenant a = crearTenant("HisTg");
        var lote = List.of(
                msj("987654321", "Lucas", false, "hola por telegram", epoch(2026, 2, 1, 15, 0), "TG_x_987654321_1"),
                msj("987654321", null, true, "respuesta", epoch(2026, 2, 1, 15, 2), "TG_x_987654321_2"));

        ResponseEntity<String> r = postConToken("/api/telegram/webhook/history",
                Map.of("deviceId", a.tg().getSessionId(), "mensajes", lote), botKey);

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        Cliente c = clientePorTelefono(a, "987654321"); // el id de Telegram queda tal cual
        assertThat(c.getOrigen()).isEqualTo("TELEGRAM");
        assertThat(mensajesDe(c)).hasSize(2);
        assertThat(mensajesDe(c).stream().filter(Mensaje::isEsSalida).findFirst().orElseThrow().getAutor())
                .isEqualTo("EXTERNO_TG");
    }

    @Test
    @DisplayName("Telegram: el mensaje enviado desde el celular se registra en el chat (y sin token se rechaza)")
    void salienteTelegramDesdeElCelular() {
        Tenant a = crearTenant("HisTgOut");
        var lote = List.of(msj("555000111", "Sofi", true, "lo mandé desde el celu", epoch(2026, 5, 1, 18, 0), "TG_y_555000111_9"));

        assertThat(postConToken("/api/telegram/webhook/outbound",
                Map.of("deviceId", a.tg().getSessionId(), "mensajes", lote), "malo").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<String> r = postConToken("/api/telegram/webhook/outbound",
                Map.of("deviceId", a.tg().getSessionId(), "mensajes", lote), botKey);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        Cliente c = clientePorTelefono(a, "555000111");
        assertThat(mensajesDe(c)).hasSize(1);
        assertThat(mensajesDe(c).get(0).isEsSalida()).isTrue();
    }
}
