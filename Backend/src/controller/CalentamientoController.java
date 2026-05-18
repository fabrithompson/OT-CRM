package controller;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import model.Agencia;
import model.PlanCalentamiento;
import model.Usuario;
import repository.UsuarioRepository;
import service.CalentamientoService;

/**
 * Endpoints del módulo de calentamiento de líneas.
 * Todos requieren autenticación JWT y aíslan por agencia (multi-tenant).
 */
@RestController
@RequestMapping("/api/v1/calentamiento")
public class CalentamientoController {

    private static final Logger log = LoggerFactory.getLogger(CalentamientoController.class);

    private final UsuarioRepository usuarioRepo;
    private final CalentamientoService calentamientoService;

    public CalentamientoController(UsuarioRepository usuarioRepo,
                                   CalentamientoService calentamientoService) {
        this.usuarioRepo = usuarioRepo;
        this.calentamientoService = calentamientoService;
    }

    // ── Listar planes ────────────────────────────────────────────────────────

    @GetMapping("/planes")
    public ResponseEntity<List<Map<String, Object>>> listarPlanes(
            @AuthenticationPrincipal UserDetails ud) {
        Agencia agencia = requireAgencia(ud);
        List<Map<String, Object>> dtos = calentamientoService.listarPlanes(agencia.getId())
                .stream()
                .map(calentamientoService::planToDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    // ── Crear plan ───────────────────────────────────────────────────────────

    public record CrearPlanRequest(
            String nombre,
            List<Long> dispositivoIds,
            int mensajesPorParPorDia,
            List<String> textos
    ) {}

    @PostMapping("/planes")
    public ResponseEntity<?> crearPlan(@AuthenticationPrincipal UserDetails ud,
                                       @RequestBody CrearPlanRequest body) {
        if (body.nombre() == null || body.nombre().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El nombre es obligatorio"));
        }
        if (body.textos() == null || body.textos().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El pool de mensajes no puede estar vacío"));
        }
        if (body.dispositivoIds() == null || body.dispositivoIds().size() < 2) {
            return ResponseEntity.badRequest().body(Map.of("error", "Se necesitan al menos 2 dispositivos"));
        }

        try {
            Agencia agencia = requireAgencia(ud);
            PlanCalentamiento plan = calentamientoService.crearPlan(
                    agencia,
                    body.nombre(),
                    body.dispositivoIds(),
                    body.mensajesPorParPorDia(),
                    body.textos()
            );
            return ResponseEntity.ok(calentamientoService.planToDto(plan));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error creando plan de calentamiento: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Error interno"));
        }
    }

    // ── Pausar / reanudar ────────────────────────────────────────────────────

    @PatchMapping("/planes/{planId}/pausar")
    public ResponseEntity<?> pausar(@AuthenticationPrincipal UserDetails ud,
                                    @PathVariable @NonNull Long planId) {
        return cambiarEstado(ud, planId, PlanCalentamiento.Estado.PAUSADO);
    }

    @PatchMapping("/planes/{planId}/reanudar")
    public ResponseEntity<?> reanudar(@AuthenticationPrincipal UserDetails ud,
                                      @PathVariable @NonNull Long planId) {
        return cambiarEstado(ud, planId, PlanCalentamiento.Estado.ACTIVO);
    }

    private ResponseEntity<?> cambiarEstado(UserDetails ud, Long planId,
                                             PlanCalentamiento.Estado estado) {
        try {
            Agencia agencia = requireAgencia(ud);
            PlanCalentamiento plan = calentamientoService.cambiarEstado(planId, agencia.getId(), estado);
            return ResponseEntity.ok(calentamientoService.planToDto(plan));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Eliminar plan ────────────────────────────────────────────────────────

    @DeleteMapping("/planes/{planId}")
    public ResponseEntity<?> eliminarPlan(@AuthenticationPrincipal UserDetails ud,
                                          @PathVariable @NonNull Long planId) {
        Agencia agencia = requireAgencia(ud);
        calentamientoService.eliminarPlan(planId, agencia.getId());
        return ResponseEntity.ok(Map.of("message", "Plan eliminado"));
    }

    // ── Historial de envíos de un plan ───────────────────────────────────────

    @GetMapping("/planes/{planId}/historial")
    public ResponseEntity<?> historial(@AuthenticationPrincipal UserDetails ud,
                                       @PathVariable @NonNull Long planId) {
        try {
            Agencia agencia = requireAgencia(ud);
            return ResponseEntity.ok(calentamientoService.listarHistorial(planId, agencia.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Agencia requireAgencia(UserDetails ud) {
        if (ud == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida");
        Usuario usuario = usuarioRepo.findByUsername(ud.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Agencia agencia = usuario.getAgencia();
        if (agencia == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sin agencia");
        return agencia;
    }
}
