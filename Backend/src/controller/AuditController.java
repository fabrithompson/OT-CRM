package controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import model.AiAuditReport;
import model.Agencia;
import model.Usuario;
import repository.AiAuditReportRepository;
import repository.UsuarioRepository;
import service.AiAuditService;
import service.SubscriptionValidationService;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final AiAuditService auditService;
    private final UsuarioRepository usuarioRepository;
    private final AiAuditReportRepository auditReportRepository;
    private final SubscriptionValidationService subscriptionValidationService;

    public AuditController(AiAuditService auditService,
                           UsuarioRepository usuarioRepository,
                           AiAuditReportRepository auditReportRepository,
                           SubscriptionValidationService subscriptionValidationService) {
        this.auditService = auditService;
        this.usuarioRepository = usuarioRepository;
        this.auditReportRepository = auditReportRepository;
        this.subscriptionValidationService = subscriptionValidationService;
    }

    @PostMapping("/run-now")
    public ResponseEntity<?> runAuditNow(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));
        }
        Agencia agencia = usuario.getAgencia();

        if (!subscriptionValidationService.puedeUsarAgenteIA(agencia)) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of("error", "Tu plan no incluye Agente IA. Actualizá a ENTERPRISE."));
        }

        try {
            LocalDateTime hasta = LocalDateTime.now();
            LocalDateTime desde = hasta.minusHours(24);
            AiAuditReport report = auditService.auditarAgencia(agencia.getId(), desde, hasta);
            return ResponseEntity.ok(toMap(report));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/reports")
    public ResponseEntity<?> getReports(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) {
            return ResponseEntity.ok(List.of());
        }
        List<AiAuditReport> reports = auditReportRepository
                .findByAgenciaIdOrderByCreatedAtDesc(usuario.getAgencia().getId());
        return ResponseEntity.ok(reports.stream().map(this::toMap).toList());
    }

    private Map<String, Object> toMap(AiAuditReport r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("periodoInicio", r.getPeriodoInicio() != null ? r.getPeriodoInicio().toString() : "");
        m.put("periodoFin", r.getPeriodoFin() != null ? r.getPeriodoFin().toString() : "");
        m.put("resumen", r.getResumen() != null ? r.getResumen() : "");
        m.put("hallazgosJson", r.getHallazgosJson() != null ? r.getHallazgosJson() : "[]");
        m.put("incumplimientos", r.getIncumplimientos());
        m.put("tokensUsados", r.getTokensUsados());
        m.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : "");
        return m;
    }

    private Usuario getUsuario(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
    }
}
