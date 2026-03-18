package controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import model.Plan;
import model.Usuario;
import repository.PlanRepository;
import repository.UsuarioRepository;
import service.PlanService;
import service.SubscriptionValidationService;

@RestController
@RequestMapping("/api/v1/planes")
public class PlanController {

    private final PlanService planService;
    private final PlanRepository planRepository;
    private final UsuarioRepository usuarioRepository;
    private final SubscriptionValidationService subscriptionValidationService;

    public PlanController(PlanService planService, PlanRepository planRepository,
                          UsuarioRepository usuarioRepository,
                          SubscriptionValidationService subscriptionValidationService) {
        this.planService = planService;
        this.planRepository = planRepository;
        this.usuarioRepository = usuarioRepository;
        this.subscriptionValidationService = subscriptionValidationService;
    }

    @GetMapping
    public ResponseEntity<List<Plan>> obtenerPlanes() {
        return ResponseEntity.ok(planRepository.findAll());
    }

    @GetMapping("/mi-plan")
    public ResponseEntity<?> miPlan(@AuthenticationPrincipal UserDetails userDetails) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            Map<String, Object> result = new HashMap<>();
            Plan planEfectivo;
            String vencimientoStr;
            if (usuario.getAgencia() != null) {
                planEfectivo = subscriptionValidationService.getPlanEfectivoAgencia(usuario.getAgencia());
                Usuario admin = subscriptionValidationService.getAdminAgencia(usuario.getAgencia());
                vencimientoStr = (admin != null && admin.getPlanVencimiento() != null)
                        ? admin.getPlanVencimiento().toString() : "Sin vencimiento";
            } else {
                planEfectivo = usuario.getPlan();
                vencimientoStr = usuario.getPlanVencimiento() != null
                        ? usuario.getPlanVencimiento().toString() : "Sin vencimiento";
            }
            result.put("plan", planEfectivo != null ? planEfectivo : Map.of("nombre", "FREE"));
            result.put("vencimiento", vencimientoStr);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "plan", Map.of("nombre", "FREE"),
                    "vencimiento", "Sin vencimiento"
            ));
        }
    }

    @PostMapping("/cambiar/{planId}")
    public ResponseEntity<?> cambiarPlan(@AuthenticationPrincipal UserDetails userDetails,
                                          @PathVariable Long planId) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            @SuppressWarnings("null")
            Plan plan = planRepository.findById(planId)
                    .orElseThrow(() -> new RuntimeException("Plan no encontrado"));

            if (plan.getPrecioMensual() == 0) {
                planService.cambiarPlan(usuario.getId(), planId);
                return ResponseEntity.ok(Map.of("mensaje", "Plan actualizado a FREE"));
            }

            return ResponseEntity.ok(Map.of(
                    "mensaje", "Redirigir a pago",
                    "requierePago", true,
                    "planId", planId,
                    "precio", plan.getPrecioMensual()
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/equipo")
    public ResponseEntity<?> suscripcionEquipo(@AuthenticationPrincipal UserDetails userDetails) {
        try {
            Usuario usuario = getUsuarioOrThrow(userDetails);
            if (usuario.getAgencia() == null) {
                return ResponseEntity.ok(Map.of("miembros", List.of()));
            }

            Long agenciaId = usuario.getAgencia().getId();
            List<Usuario> miembros = usuarioRepository.findByAgenciaId(agenciaId);

            List<Map<String, Object>> miembrosInfo = miembros.stream().map(m -> {
                Map<String, Object> info = new HashMap<>();
                info.put("id", m.getId());
                info.put("username", m.getUsername());
                info.put("nombreCompleto", m.getNombreCompleto());
                info.put("fotoUrl", m.getFotoUrl());
                info.put("rol", m.getRol());
                info.put("proveedorPago", m.getProveedorPago());

                if (m.getPlan() != null) {
                    Map<String, Object> planMap = new HashMap<>();
                    planMap.put("id", m.getPlan().getId());
                    planMap.put("nombre", m.getPlan().getNombre());
                    planMap.put("precioMensual", m.getPlan().getPrecioMensual());
                    info.put("plan", planMap);
                } else {
                    info.put("plan", Map.of("nombre", "FREE"));
                }

                info.put("planVencimiento", m.getPlanVencimiento() != null ? m.getPlanVencimiento().toString() : null);
                return info;
            }).collect(Collectors.toList());

            // Find admin's plan as the effective team plan
            Map<String, Object> planEfectivo = miembros.stream()
                    .filter(m -> "ADMIN".equals(m.getRol()) && m.getPlan() != null)
                    .findFirst()
                    .map(admin -> {
                        Map<String, Object> p = new HashMap<>();
                        p.put("id", admin.getPlan().getId());
                        p.put("nombre", admin.getPlan().getNombre());
                        p.put("maxDispositivos", admin.getPlan().getMaxDispositivos());
                        p.put("maxContactos", admin.getPlan().getMaxContactos());
                        p.put("precioMensual", admin.getPlan().getPrecioMensual());
                        p.put("vencimiento", admin.getPlanVencimiento() != null ? admin.getPlanVencimiento().toString() : null);
                        p.put("proveedorPago", admin.getProveedorPago());
                        return p;
                    })
                    .orElse(new HashMap<>(Map.of("nombre", "FREE")));

            Map<String, Object> result = new HashMap<>();
            result.put("miembros", miembrosInfo);
            result.put("planEfectivo", planEfectivo);
            result.put("agenciaNombre", usuario.getAgencia().getNombre());
            result.put("totalMiembros", miembros.size());

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private Usuario getUsuarioOrThrow(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
    }
}