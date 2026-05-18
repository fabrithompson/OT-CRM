package service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import model.Agencia;
import model.Dispositivo;
import model.EnvioCalentamiento;
import model.PlanCalentamiento;
import repository.DispositivoRepository;
import repository.EnvioCalentamientoRepository;
import repository.PlanCalentamientoRepository;

/**
 * Gestiona los planes de calentamiento entre líneas CAMPANIAS.
 *
 * El worker {@link #procesarColaCalentamiento()} corre cada 15 segundos:
 *   1. Para cada plan ACTIVO, genera un nuevo envío por par si no hay
 *      ninguno PENDING ya pendiente y no se alcanzó el límite diario.
 *   2. Procesa la cola PENDING con el mismo delay aleatorio que campañas.
 *
 * El método {@link #intentarAutorespuesta} es llamado por CampaniaService
 * cuando un dispositivo CAMPANIAS recibe un mensaje de otro dispositivo propio.
 */
@Service
public class CalentamientoService {

    private static final Logger log = LoggerFactory.getLogger(CalentamientoService.class);
    private static final String API_KEY_HEADER = "X-Bot-Token";

    private static final long DELAY_MIN_MS = 10_000L;
    private static final long DELAY_MAX_MS = 45_000L;
    private static final ZoneId ZONE_AR = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final long VENTANA_AUTORESPUESTA_HORAS = 2L;

    private final PlanCalentamientoRepository planRepo;
    private final EnvioCalentamientoRepository envioRepo;
    private final DispositivoRepository dispositivoRepo;
    private final RestTemplate http;

    private final Map<String, Long> proximoEnvioPermitido = new ConcurrentHashMap<>();

    @Value("${node.bot.url}")
    private String nodeBotUrl;

    @Value("${bot.secret.key}")
    private String botSecretKey;

    public CalentamientoService(PlanCalentamientoRepository planRepo,
                                EnvioCalentamientoRepository envioRepo,
                                DispositivoRepository dispositivoRepo,
                                RestTemplate restTemplate) {
        this.planRepo = planRepo;
        this.envioRepo = envioRepo;
        this.dispositivoRepo = dispositivoRepo;
        this.http = restTemplate;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CRUD DE PLANES
    // ════════════════════════════════════════════════════════════════════════

    @SuppressWarnings("null")
    @Transactional
    public PlanCalentamiento crearPlan(Agencia agencia,
                                       String nombre,
                                       List<Long> dispositivoIds,
                                       int mensajesPorParPorDia,
                                       List<String> textos) {
        if (textos == null || textos.isEmpty()) {
            throw new IllegalArgumentException("El plan necesita al menos un mensaje en el pool");
        }
        if (dispositivoIds == null || dispositivoIds.size() < 2) {
            throw new IllegalArgumentException("El plan necesita al menos 2 dispositivos");
        }

        PlanCalentamiento plan = new PlanCalentamiento();
        plan.setNombre(nombre);
        plan.setAgencia(agencia);
        plan.setMensajesPorParPorDia(Math.max(1, mensajesPorParPorDia));
        plan.setTextos(new ArrayList<>(textos));

        for (Long dId : dispositivoIds) {
            dispositivoRepo.findById(dId)
                    .filter(d -> d.getAgencia().getId().equals(agencia.getId()))
                    .filter(d -> d.getProposito() == Dispositivo.Proposito.CAMPANIAS)
                    .ifPresent(plan.getDispositivos()::add);
        }

        if (plan.getDispositivos().size() < 2) {
            throw new IllegalArgumentException(
                    "Se necesitan al menos 2 dispositivos CAMPANIAS de esta agencia");
        }

        return planRepo.save(plan);
    }

    @Transactional
    public PlanCalentamiento cambiarEstado(Long planId, Long agenciaId,
                                           PlanCalentamiento.Estado nuevoEstado) {
        PlanCalentamiento plan = planRepo.findByIdAndAgenciaId(planId, agenciaId)
                .orElseThrow(() -> new IllegalArgumentException("Plan no encontrado"));
        plan.setEstado(nuevoEstado);
        return planRepo.save(plan);
    }

    @Transactional
    public void eliminarPlan(Long planId, Long agenciaId) {
        planRepo.findByIdAndAgenciaId(planId, agenciaId)
                .ifPresent(planRepo::delete);
    }

    @Transactional(readOnly = true)
    public List<PlanCalentamiento> listarPlanes(Long agenciaId) {
        return planRepo.findByAgenciaIdOrderByFechaCreadoDesc(agenciaId);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listarHistorial(Long planId, Long agenciaId) {
        planRepo.findByIdAndAgenciaId(planId, agenciaId)
                .orElseThrow(() -> new IllegalArgumentException("Plan no encontrado"));

        List<EnvioCalentamiento> envios = envioRepo.findByPlanIdOrderByFechaCreadoDesc(
                planId, PageRequest.of(0, 100));

        List<Map<String, Object>> result = new ArrayList<>(envios.size());
        for (EnvioCalentamiento e : envios) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", e.getId());
            item.put("texto", e.getTexto());
            item.put("estado", e.getEstado().name());
            item.put("respondido", e.isRespondido());
            item.put("fechaCreado", e.getFechaCreado().toString());
            item.put("fechaEnviado", e.getFechaEnviado() != null ? e.getFechaEnviado().toString() : null);
            item.put("origen", e.getDispositivoOrigen().getAlias());
            item.put("destino", e.getDispositivoDestino().getAlias());
            result.add(item);
        }
        return result;
    }

    // ════════════════════════════════════════════════════════════════════════
    // WORKER PROGRAMADO
    // ════════════════════════════════════════════════════════════════════════

    @Scheduled(fixedDelay = 15_000L)
    public void procesarColaCalentamiento() {
        try {
            generarNuevosEnvios();
            procesarTick();
        } catch (Exception ex) {
            log.error("Error en worker de calentamiento: {}", ex.getMessage(), ex);
        }
    }

    /**
     * Para cada plan ACTIVO genera un envío PENDING por par de dispositivos,
     * siempre que: no haya ya un PENDING para ese par y no se haya alcanzado
     * el límite diario.
     */
    @Transactional
    public void generarNuevosEnvios() {
        List<PlanCalentamiento> planesActivos = planRepo.findAllActivos();
        LocalDateTime inicioDia = LocalDate.now(ZONE_AR).atStartOfDay();

        for (PlanCalentamiento plan : planesActivos) {
            if (plan.getTextos().isEmpty()) continue;

            List<Dispositivo> devices = plan.getDispositivos().stream()
                    .filter(d -> "CONNECTED".equalsIgnoreCase(d.getEstado()))
                    .toList();

            if (devices.size() < 2) continue;

            for (int i = 0; i < devices.size(); i++) {
                for (int j = 0; j < devices.size(); j++) {
                    if (i == j) continue;
                    Dispositivo origen = devices.get(i);
                    Dispositivo destino = devices.get(j);

                    // No superar el límite diario
                    long enviadosHoy = envioRepo.countSentBetweenPairSince(
                            origen.getId(), destino.getId(), inicioDia);
                    if (enviadosHoy >= plan.getMensajesPorParPorDia()) continue;

                    // No generar si ya hay un PENDING para este par
                    boolean tienePending = envioRepo.existsPendingForPair(
                            origen.getId(), destino.getId());
                    if (tienePending) continue;

                    String texto = textoAleatorio(plan.getTextos());
                    EnvioCalentamiento e = new EnvioCalentamiento();
                    e.setTexto(texto);
                    e.setDispositivoOrigen(origen);
                    e.setDispositivoDestino(destino);
                    e.setPlan(plan);
                    e.setAgencia(plan.getAgencia());
                    envioRepo.save(e);
                }
            }
        }
    }

    /**
     * Procesa la cola PENDING respetando el delay aleatorio por sesión.
     */
    @Transactional
    public void procesarTick() {
        long ahora = System.currentTimeMillis();
        List<EnvioCalentamiento> pendientes = envioRepo.findPendingBatch(PageRequest.of(0, 30));

        for (EnvioCalentamiento envio : pendientes) {
            Dispositivo origen = envio.getDispositivoOrigen();
            String sessionId = origen.getSessionId();

            Long permitidoDesde = proximoEnvioPermitido.get(sessionId);
            if (permitidoDesde != null && ahora < permitidoDesde) continue;

            if (!"CONNECTED".equalsIgnoreCase(origen.getEstado())) continue;

            String telefonoDestino = envio.getDispositivoDestino().getNumeroTelefono();
            if (telefonoDestino == null || telefonoDestino.isBlank()) {
                envio.setEstado(EnvioCalentamiento.Estado.FAILED);
                envio.setErrorMsg("Dispositivo destino sin número registrado");
                envioRepo.save(envio);
                continue;
            }

            boolean ok = enviarAlBot(origen, telefonoDestino, envio.getTexto());
            if (ok) {
                envio.setEstado(EnvioCalentamiento.Estado.SENT);
                envio.setFechaEnviado(LocalDateTime.now());
            } else {
                envio.setEstado(EnvioCalentamiento.Estado.FAILED);
                envio.setErrorMsg("Bot devolvió error o sin respuesta");
            }
            envioRepo.save(envio);

            long delay = ThreadLocalRandom.current().nextLong(DELAY_MIN_MS, DELAY_MAX_MS + 1);
            proximoEnvioPermitido.put(sessionId, ahora + delay);
            ahora = System.currentTimeMillis();
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // AUTO-RESPUESTA (llamado desde CampaniaService)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Intenta auto-responder cuando {@code receptorId} recibe un mensaje de
     * {@code telefonoFrom}. Solo actúa si existe un EnvioCalentamiento SENT
     * no respondido reciente. Marca el envío como respondido para cortar loops.
     */
    @Transactional
    public boolean intentarAutorespuesta(Long receptorId, String telefonoFrom) {
        LocalDateTime ventana = LocalDateTime.now().minusHours(VENTANA_AUTORESPUESTA_HORAS);

        Optional<EnvioCalentamiento> envioOpt = envioRepo.findEnvioNoRespondido(
                receptorId, telefonoFrom, ventana);
        if (envioOpt.isEmpty()) return false;

        EnvioCalentamiento envioOriginal = envioOpt.get();
        PlanCalentamiento plan = envioOriginal.getPlan();
        if (plan.getTextos().isEmpty()) return false;

        Dispositivo receptor = envioOriginal.getDispositivoDestino();
        if (!"CONNECTED".equalsIgnoreCase(receptor.getEstado())) return false;

        String textoRespuesta = textoAleatorio(plan.getTextos());
        boolean ok = enviarAlBot(receptor, telefonoFrom, textoRespuesta);

        if (ok) {
            envioOriginal.setRespondido(true);
            envioRepo.save(envioOriginal);
            log.debug("Auto-respuesta de calentamiento: {} → {}", receptor.getAlias(), telefonoFrom);
        }

        return ok;
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════════════

    private String textoAleatorio(List<String> textos) {
        return textos.get(ThreadLocalRandom.current().nextInt(textos.size()));
    }

    @SuppressWarnings("null")
    private boolean enviarAlBot(Dispositivo dispositivo, String telefono, String texto) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("sessionId", dispositivo.getSessionId());
            body.put("number", telefono);
            body.put("message", texto);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set(API_KEY_HEADER, botSecretKey);

            HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
            ResponseEntity<Map<String, Object>> resp = http.exchange(
                    nodeBotUrl + "/send-message",
                    HttpMethod.POST,
                    req,
                    new org.springframework.core.ParameterizedTypeReference<>() {});
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.warn("Fallo enviando calentamiento a {}: {}", telefono, e.getMessage());
            return false;
        }
    }

    public Map<String, Object> planToDto(PlanCalentamiento p) {
        List<Map<String, Object>> devices = p.getDispositivos().stream()
                .map(d -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", d.getId());
                    m.put("alias", d.getAlias());
                    m.put("numeroTelefono", d.getNumeroTelefono());
                    m.put("estado", d.getEstado());
                    return m;
                })
                .toList();

        return Map.of(
                "id", p.getId(),
                "nombre", p.getNombre(),
                "estado", p.getEstado().name(),
                "mensajesPorParPorDia", p.getMensajesPorParPorDia(),
                "textos", p.getTextos(),
                "dispositivos", devices,
                "fechaCreado", p.getFechaCreado().toString()
        );
    }
}
