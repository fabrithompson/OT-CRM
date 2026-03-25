package controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import model.Dispositivo;
import model.Usuario;
import repository.DispositivoRepository;
import repository.UsuarioRepository;
import service.PlanService;
import service.WhatsAppService;
import util.DispositivoMapper;

import jakarta.annotation.PostConstruct;

@RestController
@RequestMapping("/api/v1/whatsapp")
public class WhatsAppController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppController.class);
    private static final String HEADER_API_KEY = "X-Bot-Token";

    private final UsuarioRepository usuarioRepository;
    private final DispositivoRepository dispositivoRepository;
    private final WhatsAppService whatsAppService;
    @SuppressWarnings("unused")
    private final SimpMessagingTemplate messagingTemplate;
    private final RestTemplate restTemplate;
    private final PlanService planService;

    @SuppressWarnings("unused")
    private final ExecutorService msgExecutor = Executors.newFixedThreadPool(4);

    @Value("${bot.secret.key}")
    private String secretKey;

    public WhatsAppController(UsuarioRepository usuarioRepository, DispositivoRepository dispositivoRepository,
                              WhatsAppService whatsAppService, SimpMessagingTemplate messagingTemplate,
                              RestTemplateBuilder restTemplateBuilder, PlanService planService) {
        this.usuarioRepository = usuarioRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.whatsAppService = whatsAppService;
        this.messagingTemplate = messagingTemplate;
        this.planService = planService;
        this.restTemplate = restTemplateBuilder.requestFactory(() -> {
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(5000);
            factory.setReadTimeout(90000);
            return factory;
        }).build();
    }

    @PostConstruct
    public void init() {
        log.info("WHATSAPP CONTROLLER: Listo y securizado con pool de {} hilos.", 4);
    }

    public record CreateDeviceRequest(String alias) {}
    public record PairCodeRequest(Long deviceId, String phoneNumber) {}

    // -------------------------------------------------------------------------
    // ENDPOINTS INTERNOS FRONTEND
    // La clase tiene @RequestMapping("/api/v1/whatsapp"), los metodos usan rutas relativas
    // -------------------------------------------------------------------------

    @GetMapping("")
    public ResponseEntity<List<Map<String, Object>>> listarDispositivos(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.ok(List.of());
        List<Map<String, Object>> dtos = dispositivoRepository
                .findByAgenciaIdAndPlataformaAndVisibleTrue(usuario.getAgencia().getId(), Dispositivo.Plataforma.WHATSAPP)
                .stream()
                .map(DispositivoMapper::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("")
    public ResponseEntity<?> crearDispositivo(@AuthenticationPrincipal UserDetails userDetails, @RequestBody CreateDeviceRequest request) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            if (!planService.puedeConectarDispositivo(usuario.getId(), Dispositivo.Plataforma.WHATSAPP)) {
                return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", "Limite de dispositivos alcanzado."));
            }
            String alias = (request.alias() == null || request.alias().isBlank()) ? "Nuevo Dispositivo" : request.alias();
            Dispositivo d = whatsAppService.crearDispositivo(usuario.getAgencia(), alias);
            return ResponseEntity.ok(DispositivoMapper.toDto(d));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<?> eliminarDispositivo(@AuthenticationPrincipal UserDetails userDetails, @PathVariable @NonNull Long deviceId) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Sin agencia"));

        return dispositivoRepository.findById(deviceId)
                .filter(dev -> dev.getAgencia() != null && Objects.equals(dev.getAgencia().getId(), usuario.getAgencia().getId()))
                .map(d -> {
                    whatsAppService.eliminarDispositivoCompleto(deviceId);
                    return ResponseEntity.ok().body((Object) Map.of("message", "Eliminado"));
                })
                .orElse(ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "No autorizado")));
    }

    @PostMapping("/{deviceId}/disconnect")
    public ResponseEntity<Map<String, String>> desvincularDispositivo(@AuthenticationPrincipal UserDetails userDetails, @PathVariable @NonNull Long deviceId) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Sin agencia"));

        return dispositivoRepository.findById(deviceId)
                .filter(dev -> dev.getAgencia() != null && Objects.equals(dev.getAgencia().getId(), usuario.getAgencia().getId()))
                .map(d -> {
                    whatsAppService.desvincularSesion(deviceId);
                    return ResponseEntity.ok(Map.of("message", "Dispositivo desvinculado correctamente."));
                })
                .orElse(ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "No autorizado")));
    }

    @GetMapping("/{deviceId}/qr")
    public ResponseEntity<Map<String, Object>> obtenerQr(@AuthenticationPrincipal UserDetails userDetails, @PathVariable @NonNull Long deviceId) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        Dispositivo d = dispositivoRepository.findById(deviceId)
                .filter(dev -> dev.getAgencia() != null && Objects.equals(dev.getAgencia().getId(), usuario.getAgencia().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "No autorizado"));

        String baseUrl = whatsAppService.getNodeBotUrl();
        try {
            @SuppressWarnings("null")
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    baseUrl + "/session/status/" + d.getSessionId(), HttpMethod.GET, null, new ParameterizedTypeReference<Map<String, Object>>() {}
            );
            Map<String, Object> body = response.getBody() != null ? new HashMap<>(response.getBody()) : new HashMap<>();
            String estadoBot = (String) body.getOrDefault("status", "UNKNOWN");

            if ("DISCONNECTED".equals(estadoBot)) {
                iniciarSesionBot(baseUrl, d.getSessionId());
                body.put("status", "STARTING");
                return ResponseEntity.ok(body);
            }
            if ("SCAN_QR".equals(estadoBot)) agregarQrAlBody(baseUrl, d.getSessionId(), body);

            return ResponseEntity.ok(body);
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("status", "OFFLINE", "error", "Bot inalcanzable"));
        }
    }

    @PostMapping("/pair-code")
    public ResponseEntity<Map<String, String>> solicitarCodigoVinculacion(@AuthenticationPrincipal UserDetails userDetails, @RequestBody PairCodeRequest request) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        if (request.deviceId() == null || request.phoneNumber() == null) return ResponseEntity.badRequest().body(Map.of("error", "Datos incompletos"));

        @SuppressWarnings("null")
        Dispositivo d = dispositivoRepository.findById(request.deviceId())
                .filter(dev -> dev.getAgencia() != null && Objects.equals(dev.getAgencia().getId(), usuario.getAgencia().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "No autorizado"));

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set(HEADER_API_KEY, secretKey);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of("sessionId", d.getSessionId(), "phoneNumber", request.phoneNumber()), headers);

            @SuppressWarnings("null")
            ResponseEntity<Map<String, String>> response = restTemplate.exchange(
                    whatsAppService.getNodeBotUrl() + "/session/pair-code", HttpMethod.POST, entity, new ParameterizedTypeReference<Map<String, String>>() {}
            );

            Map<String, String> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("code")) {
                return ResponseEntity.ok(Map.of("code", responseBody.get("code")));
            }

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Sin codigo"));
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Error Node: " + e.getMessage()));
        }
    }


    // Helpers privados
    // -------------------------------------------------------------------------

    private void iniciarSesionBot(String baseUrl, String sessionId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HEADER_API_KEY, secretKey);
        try {
            restTemplate.postForLocation(baseUrl + "/session/start", new HttpEntity<>(Map.of("sessionId", sessionId), headers));
        } catch (RestClientException e) {
            log.error("Error iniciando sesion: {}", e.getMessage());
        }
    }

    private void agregarQrAlBody(String baseUrl, String sessionId, Map<String, Object> body) {
        try {
            @SuppressWarnings("null")
            ResponseEntity<Map<String, String>> qrResponse = restTemplate.exchange(
                    baseUrl + "/qr/" + sessionId, HttpMethod.GET, null, new ParameterizedTypeReference<Map<String, String>>() {}
            );

            Map<String, String> qrBody = qrResponse.getBody();
            if (qrBody != null && qrBody.containsKey("qr")) {
                body.put("qr", qrBody.get("qr"));
            }

        } catch (RestClientException e) {
            log.warn("No se pudo obtener QR", e);
        }
    }

    private Usuario getUsuarioOrThrow(UserDetails userDetails) {
        if (userDetails == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesion invalida");
        return usuarioRepository.findByUsername(userDetails.getUsername()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }
}