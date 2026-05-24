package controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import model.AgentConfig;
import model.AiAuditReport;
import model.Agencia;
import model.Dispositivo;
import model.Usuario;
import repository.AgentConfigRepository;
import repository.AiAuditReportRepository;
import repository.UsuarioRepository;
import service.AiAuditService;
import service.EmailService;
import service.SubscriptionValidationService;
import service.WhatsAppService;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private static final Logger log = LoggerFactory.getLogger(AuditController.class);

    private final AiAuditService auditService;
    private final UsuarioRepository usuarioRepository;
    private final AiAuditReportRepository auditReportRepository;
    private final SubscriptionValidationService subscriptionValidationService;
    private final ObjectMapper objectMapper;
    private final AgentConfigRepository agentConfigRepository;
    private final EmailService emailService;
    private final WhatsAppService whatsAppService;

    public AuditController(AiAuditService auditService,
                           UsuarioRepository usuarioRepository,
                           AiAuditReportRepository auditReportRepository,
                           SubscriptionValidationService subscriptionValidationService,
                           ObjectMapper objectMapper,
                           AgentConfigRepository agentConfigRepository,
                           EmailService emailService,
                           WhatsAppService whatsAppService) {
        this.auditService = auditService;
        this.usuarioRepository = usuarioRepository;
        this.auditReportRepository = auditReportRepository;
        this.subscriptionValidationService = subscriptionValidationService;
        this.objectMapper = objectMapper;
        this.agentConfigRepository = agentConfigRepository;
        this.emailService = emailService;
        this.whatsAppService = whatsAppService;
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

            // Envío inmediato del reporte (independiente del scheduler diario).
            // El endpoint no espera la confirmación del envío para no bloquear al usuario:
            // email es @Async, y WhatsApp se intenta de forma síncrona pero capturamos errores.
            boolean sentEmail = false;
            boolean sentWhatsapp = false;
            AgentConfig config = agentConfigRepository.findByAgenciaId(agencia.getId()).orElse(null);
            if (config != null) {
                String email = config.getAuditEmail();
                if (email != null && !email.isBlank()) {
                    try {
                        emailService.enviarReporteAuditoria(email, report);
                        sentEmail = true;
                    } catch (Exception e) {
                        log.warn("[Audit/run-now] Falló envío email para agencia {}: {}",
                                agencia.getId(), e.getMessage());
                    }
                }
                String phone = config.getAuditWhatsappPhone();
                Dispositivo disp = config.getAuditDispositivo();
                if (phone != null && !phone.isBlank() && disp != null) {
                    try {
                        String resumen = buildWhatsAppSummary(report);
                        sentWhatsapp = whatsAppService.enviarTextoANumero(phone, resumen, disp);
                    } catch (Exception e) {
                        log.warn("[Audit/run-now] Falló envío WhatsApp para agencia {}: {}",
                                agencia.getId(), e.getMessage());
                    }
                }
            }

            Map<String, Object> resp = new HashMap<>(toMap(report));
            resp.put("sentEmail", sentEmail);
            resp.put("sentWhatsapp", sentWhatsapp);
            return ResponseEntity.ok(resp);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // Mismo formato que el del scheduler, para que el resumen por WhatsApp luzca consistente
    // venga del envío programado o del botón "Auditar ahora".
    private String buildWhatsAppSummary(AiAuditReport report) {
        java.time.format.DateTimeFormatter fmt = java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm");
        String periodo = report.getPeriodoInicio().format(fmt) + " al " + report.getPeriodoFin().format(fmt);
        int total = report.getIncumplimientos();
        StringBuilder sb = new StringBuilder();
        sb.append("*Reporte de Auditoría IA — OT CRM*\n");
        sb.append("Período: ").append(periodo).append("\n\n");
        if (total == 0) {
            sb.append("Sin incumplimientos detectados en el período analizado.");
        } else {
            sb.append("Se detectaron *").append(total).append(" incumplimiento(s)*.\n\n");
            sb.append(report.getResumen() != null ? report.getResumen() : "");
        }
        sb.append("\n\n_Reporte completo disponible en el panel._");
        return sb.toString();
    }

    @GetMapping("/reports")
    public ResponseEntity<?> getReports(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) {
            return ResponseEntity.ok(List.of());
        }
        // Respeta orden manual del usuario (orden NOT NULL) y cae a fecha DESC para el resto
        List<AiAuditReport> reports = auditReportRepository
                .findAllForAgenciaSorted(usuario.getAgencia().getId());
        return ResponseEntity.ok(reports.stream().map(this::toMap).toList());
    }

    // ─── CRUD del historial (Fase 7) ─────────────────────────────────────────

    // DTO para editar metadatos del reporte
    record ReportMetaRequest(String nombre, String notas) {}

    // DTO para reordenar el historial
    record ReorderRequest(List<Long> orden) {}

    @Transactional
    @PatchMapping("/reports/{reportId}")
    public ResponseEntity<?> updateReportMeta(@AuthenticationPrincipal UserDetails userDetails,
                                                @PathVariable Long reportId,
                                                @RequestBody ReportMetaRequest req) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));

        @SuppressWarnings("null")
		AiAuditReport report = auditReportRepository.findById(reportId).orElse(null);
        if (report == null || report.getAgencia() == null
                || !report.getAgencia().getId().equals(usuario.getAgencia().getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Reporte no encontrado"));
        }
        if (req != null) {
            // Permitimos string vacío para limpiar el campo, pero nulls dejan el valor anterior
            if (req.nombre() != null) report.setNombre(req.nombre().isBlank() ? null : req.nombre().trim());
            if (req.notas()  != null) report.setNotas(req.notas().isBlank() ? null : req.notas());
        }
        auditReportRepository.save(report);
        return ResponseEntity.ok(toMap(report));
    }

    @Transactional
    @DeleteMapping("/reports/{reportId}")
    public ResponseEntity<?> deleteReport(@AuthenticationPrincipal UserDetails userDetails,
                                           @PathVariable Long reportId) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));

        @SuppressWarnings("null")
		AiAuditReport report = auditReportRepository.findById(reportId).orElse(null);
        if (report == null || report.getAgencia() == null
                || !report.getAgencia().getId().equals(usuario.getAgencia().getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Reporte no encontrado"));
        }
        auditReportRepository.delete(report);
        return ResponseEntity.ok(Map.of("ok", true, "id", reportId));
    }

    @Transactional
    @PostMapping("/reports/reorder")
    public ResponseEntity<?> reorderReports(@AuthenticationPrincipal UserDetails userDetails,
                                             @RequestBody ReorderRequest req) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));
        if (req == null || req.orden() == null || req.orden().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Lista de orden vacía"));
        }

        Long agenciaId = usuario.getAgencia().getId();
        // Solo aplicamos el orden a los reportes que pertenecen a la agencia del usuario.
        // Los IDs que no correspondan se ignoran silenciosamente.
        int i = 0;
        for (Long id : req.orden()) {
            if (id == null) continue;
            AiAuditReport r = auditReportRepository.findById(id).orElse(null);
            if (r != null && r.getAgencia() != null && agenciaId.equals(r.getAgencia().getId())) {
                r.setOrden(i++);
                auditReportRepository.save(r);
            }
        }
        return ResponseEntity.ok(Map.of("ok", true, "actualizados", i));
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

            // Compatibilidad con reportes legacy (array directo) y formato nuevo
            // (objeto { resumen_ejecutivo, procedimientos[], hallazgos[] }).
            JsonNode hallazgosNode;
            boolean isWrapper = root.isObject() && root.has("hallazgos") && root.get("hallazgos").isArray();
            if (isWrapper) {
                hallazgosNode = root.get("hallazgos");
            } else if (root.isArray()) {
                hallazgosNode = root;
            } else {
                return ResponseEntity.badRequest().body(Map.of("error", "Formato de hallazgos inválido"));
            }

            if (idx < 0 || idx >= hallazgosNode.size()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Índice inválido"));
            }
            ObjectNode hallazgo = (ObjectNode) hallazgosNode.get(idx);
            boolean actual = hallazgo.has("false_positive") && hallazgo.get("false_positive").asBoolean();
            hallazgo.put("false_positive", !actual);
            report.setHallazgosJson(objectMapper.writeValueAsString(root));

            // Recalcular conteo de incumplimientos: prioriza procedimientos con
            // estado="incumplido"; si no hay, cae al conteo de hallazgos no marcados como FP.
            int realCount = 0;
            if (isWrapper && root.has("procedimientos") && root.get("procedimientos").isArray()) {
                for (JsonNode p : root.get("procedimientos")) {
                    String estado = p.has("estado") ? p.get("estado").asText("") : "";
                    if ("incumplido".equalsIgnoreCase(estado)) realCount++;
                }
            }
            if (realCount == 0) {
                for (JsonNode h : hallazgosNode) {
                    if (!h.has("false_positive") || !h.get("false_positive").asBoolean()) realCount++;
                }
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
        // Metadatos editables del Fase 7 — el frontend los usa para nombre/notas/orden
        m.put("nombre", r.getNombre());
        m.put("notas", r.getNotas());
        m.put("orden", r.getOrden());
        return m;
    }

    private Usuario getUsuario(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
    }
}
