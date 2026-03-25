package controller;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import model.Dispositivo;
import model.Usuario;
import repository.DispositivoRepository;
import repository.UsuarioRepository;
import service.PlanService;
import service.TelegramBridgeService;
import util.DispositivoMapper;

@RestController
@RequestMapping("/api/v1/telegram-devices")
public class TelegramDispositivoController {

    private static final Logger log = LoggerFactory.getLogger(TelegramDispositivoController.class);

    private final UsuarioRepository usuarioRepository;
    private final DispositivoRepository dispositivoRepository;
    private final TelegramBridgeService telegramService;
    private final PlanService planService;

    public TelegramDispositivoController(UsuarioRepository usuarioRepository, DispositivoRepository dispositivoRepository, TelegramBridgeService telegramService, PlanService planService) {
        this.usuarioRepository = usuarioRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.telegramService = telegramService;
        this.planService = planService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listarDispositivos(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        List<Map<String, Object>> dtos = dispositivoRepository
                .findByAgenciaIdAndPlataforma(usuario.getAgencia().getId(), Dispositivo.Plataforma.TELEGRAM)
                .stream()
                .filter(d -> !"ELIMINADO".equals(d.getEstado()) && Boolean.TRUE.equals(d.isVisible()))
                .map(DispositivoMapper::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    public record CreateDeviceRequest(Long deviceId, String alias, String phone) {}

    @SuppressWarnings("null")
    @PostMapping
    public ResponseEntity<Object> crearDispositivo(@AuthenticationPrincipal UserDetails userDetails, @RequestBody CreateDeviceRequest request) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            if (request.deviceId() == null && !planService.puedeConectarDispositivo(usuario.getId(), Dispositivo.Plataforma.TELEGRAM)) {
                return ResponseEntity.status(402).body(Map.of("error", "Límite de dispositivos Telegram alcanzado. Mejora tu plan para agregar más."));
            }

            Dispositivo dispositivo;
            if (request.deviceId() != null) {
                dispositivo = dispositivoRepository.findById(request.deviceId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dispositivo no encontrado"));
                if (!dispositivo.getAgencia().getId().equals(usuario.getAgencia().getId())) {
                    return ResponseEntity.status(403).body(Map.of("error", "No autorizado"));
                }
            } else {
                dispositivo = new Dispositivo();
                dispositivo.setAgencia(usuario.getAgencia());
                dispositivo.setPlataforma(Dispositivo.Plataforma.TELEGRAM);
                dispositivo.setEstado("DESCONECTADO");
                dispositivo.setSessionId("TEMP_" + System.currentTimeMillis());
            }

            if (request.alias() != null && !request.alias().isEmpty()) dispositivo.setAlias(request.alias());

            if (request.phone() == null || request.phone().isEmpty()) {
                dispositivoRepository.save(dispositivo);
                return ResponseEntity.ok(Map.of("status", "CREATED", "deviceId", dispositivo.getId()));
            }

            dispositivo.setNumeroTelefono(request.phone());
            dispositivoRepository.save(dispositivo);

            Map<String, Object> respuestaPython = telegramService.solicitarCodigo(dispositivo);
            respuestaPython.put("deviceId", dispositivo.getId());
            return ResponseEntity.ok(respuestaPython);
        } catch (Exception e) {
            log.error("Error en dispositivo Telegram: ", e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{deviceId}/disconnect")
    public ResponseEntity<Object> desvincularDispositivo(@AuthenticationPrincipal UserDetails userDetails, @PathVariable Long deviceId) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            @SuppressWarnings("null")
            Dispositivo dispositivo = dispositivoRepository.findById(deviceId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dispositivo no encontrado"));

            if (!dispositivo.getAgencia().getId().equals(usuario.getAgencia().getId())) return ResponseEntity.status(403).body(Map.of("error", "No autorizado"));

            telegramService.desvincular(dispositivo);
            dispositivo.setEstado("DESCONECTADO");
            dispositivoRepository.save(dispositivo);
            return ResponseEntity.ok(Map.of("status", "DISCONNECTED"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    public record ValidateCodeRequest(Long deviceId, String code, String hash) {}

    @PostMapping("/validate")
    public ResponseEntity<Object> validarCodigo(@AuthenticationPrincipal UserDetails userDetails, @RequestBody ValidateCodeRequest request) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            @SuppressWarnings("null")
            Dispositivo dispositivo = dispositivoRepository.findById(request.deviceId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dispositivo no encontrado"));

            if (!dispositivo.getAgencia().getId().equals(usuario.getAgencia().getId())) {
                return ResponseEntity.status(403).body(Map.of("error", "No autorizado"));
            }
            return ResponseEntity.ok(telegramService.validarCodigo(dispositivo, request.code(), request.hash()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @SuppressWarnings("null")
    @DeleteMapping("/{deviceId}")
    public ResponseEntity<Object> eliminarDispositivo(@AuthenticationPrincipal UserDetails userDetails, @PathVariable Long deviceId) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        return dispositivoRepository.findById(deviceId).map(dispositivo -> {
            if (!dispositivo.getAgencia().getId().equals(usuario.getAgencia().getId())) return ResponseEntity.status(403).body((Object) Map.of("error", "No autorizado"));
            telegramService.eliminarDispositivo(deviceId);
            return ResponseEntity.ok((Object) Map.of("message", "Eliminado correctamente"));
        }).orElse(ResponseEntity.notFound().build());
    }

    private Usuario getUsuarioOrThrow(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuario no encontrado en sesión"));
    }
}