package controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

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
    private final ObjectMapper objectMapper;

    public AuditController(AiAuditService auditService,
                           UsuarioRepository usuarioRepository,
                           AiAuditReportRepository auditReportRepository,
                           SubscriptionValidationService subscriptionValidationService,
                           ObjectMapper objectMapper) {
        this.auditService = auditService;
        this.usuarioRepository = usuarioRepository;
        this.auditReportRepository = auditReportRepository;
        this.subscriptionValidationService = subscriptionValidationService;
        this.objectMapper = objectMapper;
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

    @SuppressWarnings("null")
    @Transactional
    @PatchMapping("/reports/{reportId}/hallazgo/{idx}/false-positive")
    public ResponseEntity<?> toggleFalsePositive(@AuthenticationPrincipal UserDetails userDetails,
                                                  @PathVariable Long reportId,
                                                  @PathVariable int idx) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));

        AiAuditReport report = auditReportRepository.findById(reportId).orElse(null);
        if (report == null || report.getAgencia() == null
                || !report.getAgencia().getId().equals(usuario.getAgencia().getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Reporte no encontrado"));
        }

        try {
            String json = report.getHallazgosJson() != null ? report.getHallazgosJson() : "[]";
            JsonNode root = objectMapper.readTree(json);
            if (!root.isArray() || idx < 0 || idx >= root.size()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Índice inválido"));
            }
            ObjectNode hallazgo = (ObjectNode) root.get(idx);
            boolean actual = hallazgo.has("false_positive") && hallazgo.get("false_positive").asBoolean();
            hallazgo.put("false_positive", !actual);
            report.setHallazgosJson(objectMapper.writeValueAsString(root));

            int realCount = 0;
            for (JsonNode h : root) {
                if (!h.has("false_positive") || !h.get("false_positive").asBoolean()) realCount++;
            }
            report.setIncumplimientos(realCount);
            auditReportRepository.save(report);
            return ResponseEntity.ok(toMap(report));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
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
