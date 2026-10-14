import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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

import model.Actividad;
import model.Agencia;
import model.Cliente;
import model.Etapa;
import model.Regla;
import model.Tarea;
import model.Usuario;
import repository.ActividadRepository;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.PlanRepository;
import repository.ReglaRepository;
import repository.TareaRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import security.JwtUtil;
import service.CloudStorageService;
import service.CustomUserDetailsService;
import service.EmailService;
import service.TareaRecordatorioScheduler;
import service.TareaService;
import service.TelegramBridgeService;

/**
 * Tareas y recordatorios, historial de actividad del contacto y automatizaciones.
 * Verifica también que nada de esto cruce los límites entre agencias.
 */
class AutomatizacionIntegrationTest extends BaseIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired PlanRepository planRepo;
    @Autowired EtapaRepository etapaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired TransaccionRepository transaccionRepo;
    @Autowired TareaRepository tareaRepo;
    @Autowired ActividadRepository actividadRepo;
    @Autowired ReglaRepository reglaRepo;
    @Autowired TareaRecordatorioScheduler scheduler;
    @Autowired JwtUtil jwtUtil;
    @Autowired CustomUserDetailsService userDetailsService;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean EmailService emailService;
    @MockitoBean SimpMessagingTemplate messagingTemplate;

    private record Tenant(Agencia agencia, Usuario usuario, Etapa etapa, Cliente cliente, String token) {}

    @AfterEach
    void limpiar() {
        // Base compartida: otros tests hacen clienteRepo.deleteAll() y los movimientos apuntan a contactos
        transaccionRepo.deleteAll();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("null")
    private Usuario crearUsuario(Agencia agencia, String prefijo, String rol) {
        long n = System.nanoTime();
        Usuario u = new Usuario();
        u.setUsername(prefijo.toLowerCase() + "_" + n);
        u.setPassword("$2a$10$dummyhashvalue1234567890123456");
        u.setEmail(prefijo.toLowerCase() + n + "@test.com");
        u.setRol(rol);
        u.setAgencia(agencia);
        u.setPlan(planRepo.findByNombre("FREE").orElseThrow());
        u.setVerificado(true);
        return usuarioRepo.save(u);
    }

    private String token(Usuario u) {
        return jwtUtil.generateToken(userDetailsService.loadUserByUsername(u.getUsername()));
    }

    @SuppressWarnings("null")
    private Etapa crearEtapa(Agencia a, String nombre, int orden, boolean inicial) {
        Etapa e = new Etapa(nombre, orden, inicial);
        e.setAgencia(a);
        return etapaRepo.save(e);
    }

    @SuppressWarnings("null")
    private Cliente crearCliente(Agencia a, Etapa etapa, String nombre, String tel) {
        Cliente c = new Cliente(nombre, tel, null, etapa);
        c.setAgencia(a);
        return clienteRepo.save(c);
    }

    @SuppressWarnings("null")
    private Tenant crearTenant(String prefijo) {
        long n = System.nanoTime();
        Agencia agencia = agenciaRepo.save(new Agencia(prefijo + "_" + n, prefijo + "_" + n));
        Usuario u = crearUsuario(agencia, prefijo, "ADMIN");
        Etapa etapa = crearEtapa(agencia, "Inicial " + prefijo, 1, true);
        Cliente c = crearCliente(agencia, etapa, "Cliente " + prefijo, "5491" + (n % 100000000));
        return new Tenant(agencia, u, etapa, c, token(u));
    }

    @SuppressWarnings("null")
    private ResponseEntity<String> llamar(HttpMethod m, String url, String token, String body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(token);
        return rest.exchange(url, m, new HttpEntity<>(body, h), String.class);
    }

    @SuppressWarnings({ "null", "rawtypes" })
    private ResponseEntity<List> listar(String url, String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        return rest.exchange(url, HttpMethod.GET, new HttpEntity<>(h), List.class);
    }

    @SuppressWarnings("null")
    private List<Actividad> actividadesDe(Cliente c) {
        return actividadRepo.findAll().stream().filter(a -> c.getId().equals(a.getClienteId())).toList();
    }

    // ════════════════════════════════════════════════════════════════════════
    // TAREAS (25)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Tareas: crear una tarea para un contacto la deja asignada al creador y aparece en 'mías'")
    @SuppressWarnings({ "rawtypes", "unchecked" })
    void crearTareaParaUnContacto() {
        Tenant a = crearTenant("TarA");

        ResponseEntity<String> resp = llamar(HttpMethod.POST, "/api/v1/tareas", a.token(),
                "{\"titulo\":\"Llamar mañana\",\"clienteId\":" + a.cliente().getId() + ",\"vencimiento\":\"2099-01-01T10:00:00\"}");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Tarea t = tareaRepo.findAll().stream()
                .filter(x -> a.agencia().getId().equals(x.getAgenciaId())).findFirst().orElseThrow();
        assertThat(t.getUsuarioId()).isEqualTo(a.usuario().getId());
        assertThat(t.getClienteId()).isEqualTo(a.cliente().getId());
        assertThat(t.isCompletada()).isFalse();

        ResponseEntity<List> mias = listar("/api/v1/tareas?alcance=mias", a.token());
        assertThat(mias.getBody()).hasSize(1);
        assertThat(((Map<String, Object>) mias.getBody().get(0)).get("clienteNombre")).isEqualTo(a.cliente().getNombre());
    }

    @Test
    @DisplayName("Tareas: título vacío, contacto ajeno o asignado de otra agencia se rechazan")
    void crearTareaValidaAgenciaYDatos() {
        Tenant a = crearTenant("TarValA");
        Tenant b = crearTenant("TarValB");

        assertThat(llamar(HttpMethod.POST, "/api/v1/tareas", a.token(), "{\"titulo\":\"  \"}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/tareas", a.token(),
                "{\"titulo\":\"X\",\"clienteId\":" + b.cliente().getId() + "}").getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(llamar(HttpMethod.POST, "/api/v1/tareas", a.token(),
                "{\"titulo\":\"X\",\"usuarioId\":" + b.usuario().getId() + "}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(tareaRepo.findAll().stream().filter(t -> a.agencia().getId().equals(t.getAgenciaId()))).isEmpty();
    }

    @Test
    @DisplayName("Tareas: completar y reabrir deja registro en el historial del contacto")
    void completarYReabrirTarea() {
        Tenant a = crearTenant("TarEst");
        llamar(HttpMethod.POST, "/api/v1/tareas", a.token(),
                "{\"titulo\":\"Enviar propuesta\",\"clienteId\":" + a.cliente().getId() + "}");
        Tarea t = tareaRepo.findAll().stream()
                .filter(x -> a.agencia().getId().equals(x.getAgenciaId())).findFirst().orElseThrow();

        ResponseEntity<String> completar = llamar(HttpMethod.PATCH,
                "/api/v1/tareas/" + t.getId() + "/completada?valor=true", a.token(), null);
        assertThat(completar.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(tareaRepo.findById(t.getId()).orElseThrow().isCompletada()).isTrue();

        llamar(HttpMethod.PATCH, "/api/v1/tareas/" + t.getId() + "/completada?valor=false", a.token(), null);
        assertThat(tareaRepo.findById(t.getId()).orElseThrow().isCompletada()).isFalse();

        assertThat(actividadesDe(a.cliente())).extracting(Actividad::getTexto)
                .anyMatch(x -> x.startsWith("Tarea creada"))
                .anyMatch(x -> x.startsWith("Tarea completada"))
                .anyMatch(x -> x.startsWith("Tarea reabierta"));
    }

    @Test
    @DisplayName("Tareas: completar o borrar la tarea de otra agencia retorna 404 y no cambia nada")
    void tareaAjenaNoSePuedeTocar() {
        Tenant a = crearTenant("TarAjA");
        Tenant b = crearTenant("TarAjB");
        llamar(HttpMethod.POST, "/api/v1/tareas", b.token(), "{\"titulo\":\"De B\"}");
        Tarea ajena = tareaRepo.findAll().stream()
                .filter(x -> b.agencia().getId().equals(x.getAgenciaId())).findFirst().orElseThrow();

        assertThat(llamar(HttpMethod.PATCH, "/api/v1/tareas/" + ajena.getId() + "/completada?valor=true",
                a.token(), null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(llamar(HttpMethod.DELETE, "/api/v1/tareas/" + ajena.getId(), a.token(), null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        Tarea despues = tareaRepo.findById(ajena.getId()).orElseThrow();
        assertThat(despues.isCompletada()).isFalse();
    }

    @Test
    @DisplayName("Tareas: 'mías' no incluye las de un compañero y 'equipo' sí, sin mezclar agencias")
    @SuppressWarnings("rawtypes")
    void alcanceMiasVsEquipo() {
        Tenant a = crearTenant("TarEq");
        Usuario colega = crearUsuario(a.agencia(), "TarColega", "USER");
        Tenant otra = crearTenant("TarEqOtra");

        llamar(HttpMethod.POST, "/api/v1/tareas", a.token(), "{\"titulo\":\"Mía\"}");
        llamar(HttpMethod.POST, "/api/v1/tareas", a.token(),
                "{\"titulo\":\"Del colega\",\"usuarioId\":" + colega.getId() + "}");
        llamar(HttpMethod.POST, "/api/v1/tareas", otra.token(), "{\"titulo\":\"Otra agencia\"}");

        ResponseEntity<List> mias = listar("/api/v1/tareas?alcance=mias", a.token());
        ResponseEntity<List> equipo = listar("/api/v1/tareas?alcance=equipo", a.token());

        assertThat(mias.getBody()).hasSize(1);
        assertThat(equipo.getBody()).hasSize(2);
    }

    @Test
    @DisplayName("Recordatorio: avisa una sola vez cada tarea vencida y no avisa las completadas ni las futuras")
    @SuppressWarnings("null")
    void schedulerAvisaUnaSolaVez() {
        Tenant a = crearTenant("TarSch");
        LocalDateTime ayer = TareaService.ahora().minusDays(1);

        Tarea vencida = nuevaTarea(a, "Vencida", ayer, false);
        Tarea completada = nuevaTarea(a, "Completada", ayer, true);
        Tarea futura = nuevaTarea(a, "Futura", TareaService.ahora().plusDays(5), false);

        int primera = scheduler.avisarVencidasAhora();
        int segunda = scheduler.avisarVencidasAhora();

        assertThat(primera).isGreaterThanOrEqualTo(1);
        assertThat(segunda).isZero();
        assertThat(tareaRepo.findById(vencida.getId()).orElseThrow().isNotificada()).isTrue();
        assertThat(tareaRepo.findById(completada.getId()).orElseThrow().isNotificada()).isFalse();
        assertThat(tareaRepo.findById(futura.getId()).orElseThrow().isNotificada()).isFalse();
    }

    @SuppressWarnings("null")
    private Tarea nuevaTarea(Tenant a, String titulo, LocalDateTime venc, boolean completada) {
        Tarea t = new Tarea();
        t.setAgenciaId(a.agencia().getId());
        t.setUsuarioId(a.usuario().getId());
        t.setTitulo(titulo);
        t.setVencimiento(venc);
        t.setCompletada(completada);
        return tareaRepo.save(t);
    }

    // ════════════════════════════════════════════════════════════════════════
    // HISTORIAL DE ACTIVIDAD (26)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Historial: agregar una nota la muestra primero en la línea de tiempo; una vacía retorna 400")
    @SuppressWarnings({ "rawtypes", "unchecked" })
    void agregarNota() {
        Tenant a = crearTenant("ActNota");

        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes/" + a.cliente().getId() + "/actividades",
                a.token(), "{\"texto\":\"   \"}").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes/" + a.cliente().getId() + "/actividades",
                a.token(), "{\"texto\":\"Pidió presupuesto\"}").getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<List> lista = listar("/api/v1/clientes/" + a.cliente().getId() + "/actividades", a.token());
        assertThat(lista.getBody()).hasSize(1);
        Map<String, Object> primera = (Map<String, Object>) lista.getBody().get(0);
        assertThat(primera.get("texto")).isEqualTo("Pidió presupuesto");
        assertThat(primera.get("tipo")).isEqualTo("NOTA");
    }

    @Test
    @DisplayName("Historial: no se puede leer ni escribir el historial de un contacto de otra agencia")
    void historialAjeno() {
        Tenant a = crearTenant("ActAjA");
        Tenant b = crearTenant("ActAjB");

        assertThat(llamar(HttpMethod.GET, "/api/v1/clientes/" + b.cliente().getId() + "/actividades",
                a.token(), null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(llamar(HttpMethod.POST, "/api/v1/clientes/" + b.cliente().getId() + "/actividades",
                a.token(), "{\"texto\":\"intruso\"}").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(actividadesDe(b.cliente())).isEmpty();
    }

    @Test
    @DisplayName("Historial: solo se pueden borrar las notas, no el registro automático del sistema")
    void soloSeBorranNotas() {
        Tenant a = crearTenant("ActDel");
        llamar(HttpMethod.POST, "/api/v1/clientes/" + a.cliente().getId() + "/actividades",
                a.token(), "{\"texto\":\"borrable\"}");
        Actividad nota = actividadesDe(a.cliente()).get(0);
        Actividad sistema = new Actividad();
        sistema.setAgenciaId(a.agencia().getId());
        sistema.setClienteId(a.cliente().getId());
        sistema.setTipo(Actividad.CAMBIO_ETAPA);
        sistema.setTexto("Movido");
        sistema = actividadRepo.save(sistema);

        assertThat(llamar(HttpMethod.DELETE, "/api/v1/clientes/" + a.cliente().getId() + "/actividades/" + sistema.getId(),
                a.token(), null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(llamar(HttpMethod.DELETE, "/api/v1/clientes/" + a.cliente().getId() + "/actividades/" + nota.getId(),
                a.token(), null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(actividadRepo.existsById(sistema.getId())).isTrue();
        assertThat(actividadRepo.existsById(nota.getId())).isFalse();
    }

    @Test
    @DisplayName("Historial: mover de etapa, cargar saldo y asignar responsable quedan registrados solos")
    void eventosSeRegistranAutomaticamente() {
        Tenant a = crearTenant("ActAuto");
        Etapa destino = crearEtapa(a.agencia(), "Propuesta", 2, false);
        Usuario vendedor = crearUsuario(a.agencia(), "ActVend", "USER");

        llamar(HttpMethod.PATCH, "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + destino.getId(),
                a.token(), null);
        llamar(HttpMethod.POST, "/api/v1/transacciones/guardar", a.token(),
                "{\"clienteId\":" + a.cliente().getId() + ",\"monto\":75,\"tipo\":\"CARGA\"}");
        llamar(HttpMethod.PATCH, "/api/v1/clientes/" + a.cliente().getId() + "/responsable?usuarioId=" + vendedor.getId(),
                a.token(), null);

        List<String> tipos = actividadesDe(a.cliente()).stream().map(Actividad::getTipo).toList();
        assertThat(tipos).contains(Actividad.CAMBIO_ETAPA, Actividad.TRANSACCION, Actividad.RESPONSABLE);
        assertThat(actividadesDe(a.cliente())).extracting(Actividad::getTexto)
                .anyMatch(x -> x.contains("Propuesta") && x.contains("Movido"))
                .anyMatch(x -> x.startsWith("Carga de $75"));
    }

    @Test
    @DisplayName("Seguridad: mover un contacto a una etapa de otra agencia se rechaza y no lo mueve")
    @SuppressWarnings("null")
    void noSePuedeMoverAUnaEtapaAjena() {
        Tenant a = crearTenant("MovA");
        Tenant b = crearTenant("MovB");

        ResponseEntity<String> resp = llamar(HttpMethod.PATCH,
                "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + b.etapa().getId(), a.token(), null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(clienteRepo.findById(a.cliente().getId()).orElseThrow().getEtapa().getId())
                .isEqualTo(a.etapa().getId());
    }

    // ════════════════════════════════════════════════════════════════════════
    // AUTOMATIZACIONES (27)
    // ════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Reglas: al entrar a la etapa se crea la tarea configurada y queda en el historial")
    void reglaCreaTareaAlEntrarEnLaEtapa() {
        Tenant a = crearTenant("RegTar");
        Etapa propuesta = crearEtapa(a.agencia(), "Propuesta enviada", 2, false);

        ResponseEntity<String> creada = llamar(HttpMethod.POST, "/api/v1/reglas", a.token(),
                "{\"nombre\":\"Seguimiento\",\"etapaId\":" + propuesta.getId()
                        + ",\"accion\":\"CREAR_TAREA\",\"tituloTarea\":\"Hacer seguimiento\",\"diasVencimiento\":3}");
        assertThat(creada.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        llamar(HttpMethod.PATCH, "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + propuesta.getId(),
                a.token(), null);

        List<Tarea> tareas = tareaRepo.findAll().stream()
                .filter(t -> a.cliente().getId().equals(t.getClienteId())).toList();
        assertThat(tareas).hasSize(1);
        assertThat(tareas.get(0).getTitulo()).isEqualTo("Hacer seguimiento");
        assertThat(tareas.get(0).getVencimiento()).isAfter(TareaService.ahora().plusDays(2));
        assertThat(actividadesDe(a.cliente())).extracting(Actividad::getTipo).contains(Actividad.AUTOMATIZACION);
    }

    @Test
    @DisplayName("Reglas: al entrar a la etapa se asigna el responsable configurado")
    @SuppressWarnings("null")
    void reglaAsignaResponsable() {
        Tenant a = crearTenant("RegResp");
        Usuario vendedor = crearUsuario(a.agencia(), "RegVend", "USER");
        Etapa cierre = crearEtapa(a.agencia(), "Cierre", 2, false);

        llamar(HttpMethod.POST, "/api/v1/reglas", a.token(),
                "{\"nombre\":\"Cierres a Ana\",\"etapaId\":" + cierre.getId()
                        + ",\"accion\":\"ASIGNAR_RESPONSABLE\",\"usuarioId\":" + vendedor.getId() + "}");
        llamar(HttpMethod.PATCH, "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + cierre.getId(),
                a.token(), null);

        assertThat(clienteRepo.findById(a.cliente().getId()).orElseThrow().getResponsableId())
                .isEqualTo(vendedor.getId());
    }

    @Test
    @DisplayName("Reglas: una regla desactivada no se ejecuta")
    @SuppressWarnings("null")
    void reglaInactivaNoSeEjecuta() {
        Tenant a = crearTenant("RegOff");
        Etapa destino = crearEtapa(a.agencia(), "Destino", 2, false);
        Regla r = new Regla();
        r.setAgenciaId(a.agencia().getId());
        r.setEtapaId(destino.getId());
        r.setNombre("Apagada");
        r.setAccion(Regla.CREAR_TAREA);
        r.setTituloTarea("No debería crearse");
        r.setDiasVencimiento(0);
        r.setActiva(false);
        reglaRepo.save(r);

        llamar(HttpMethod.PATCH, "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + destino.getId(),
                a.token(), null);

        assertThat(tareaRepo.findAll().stream().filter(t -> a.cliente().getId().equals(t.getClienteId()))).isEmpty();
    }

    @Test
    @DisplayName("Reglas: mover al mismo lugar donde ya está no dispara la regla de nuevo")
    void moverALaMismaEtapaNoDuplicaTareas() {
        Tenant a = crearTenant("RegDup");
        Etapa destino = crearEtapa(a.agencia(), "Destino", 2, false);
        llamar(HttpMethod.POST, "/api/v1/reglas", a.token(),
                "{\"nombre\":\"R\",\"etapaId\":" + destino.getId()
                        + ",\"accion\":\"CREAR_TAREA\",\"tituloTarea\":\"T\",\"diasVencimiento\":1}");

        String url = "/api/v1/clientes/" + a.cliente().getId() + "/etapa?nuevaEtapaId=" + destino.getId();
        llamar(HttpMethod.PATCH, url, a.token(), null);
        llamar(HttpMethod.PATCH, url, a.token(), null);

        assertThat(tareaRepo.findAll().stream().filter(t -> a.cliente().getId().equals(t.getClienteId()))).hasSize(1);
    }

    @Test
    @DisplayName("Reglas: no se puede crear una regla sobre la etapa o el usuario de otra agencia")
    void reglaValidaAgencia() {
        Tenant a = crearTenant("RegAjA");
        Tenant b = crearTenant("RegAjB");

        assertThat(llamar(HttpMethod.POST, "/api/v1/reglas", a.token(),
                "{\"nombre\":\"X\",\"etapaId\":" + b.etapa().getId()
                        + ",\"accion\":\"CREAR_TAREA\",\"tituloTarea\":\"T\"}").getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(llamar(HttpMethod.POST, "/api/v1/reglas", a.token(),
                "{\"nombre\":\"X\",\"etapaId\":" + a.etapa().getId()
                        + ",\"accion\":\"ASIGNAR_RESPONSABLE\",\"usuarioId\":" + b.usuario().getId() + "}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(reglaRepo.findByAgenciaIdOrderByIdDesc(a.agencia().getId())).isEmpty();
    }

    @Test
    @DisplayName("Reglas: un usuario sin rol de administrador puede verlas pero no crearlas")
    void soloAdminCreaReglas() {
        Tenant a = crearTenant("RegRol");
        Usuario comun = crearUsuario(a.agencia(), "RegComun", "USER");
        String tokenComun = token(comun);

        assertThat(llamar(HttpMethod.POST, "/api/v1/reglas", tokenComun,
                "{\"nombre\":\"X\",\"etapaId\":" + a.etapa().getId()
                        + ",\"accion\":\"CREAR_TAREA\",\"tituloTarea\":\"T\"}").getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(llamar(HttpMethod.GET, "/api/v1/reglas", tokenComun, null).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Reglas: no se puede activar ni borrar la regla de otra agencia")
    void reglaAjenaNoSeToca() {
        Tenant a = crearTenant("RegDelA");
        Tenant b = crearTenant("RegDelB");
        llamar(HttpMethod.POST, "/api/v1/reglas", b.token(),
                "{\"nombre\":\"De B\",\"etapaId\":" + b.etapa().getId()
                        + ",\"accion\":\"CREAR_TAREA\",\"tituloTarea\":\"T\"}");
        Regla ajena = reglaRepo.findByAgenciaIdOrderByIdDesc(b.agencia().getId()).get(0);

        assertThat(llamar(HttpMethod.DELETE, "/api/v1/reglas/" + ajena.getId(), a.token(), null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(llamar(HttpMethod.PATCH, "/api/v1/reglas/" + ajena.getId() + "/activa?valor=false",
                a.token(), null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(reglaRepo.findById(ajena.getId()).orElseThrow().isActiva()).isTrue();
    }
}
