package service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import model.AgentConfig;
import model.AiAuditReport;
import model.Dispositivo;
import repository.AgentConfigRepository;

@Component
public class AiAuditScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiAuditScheduler.class);
    private static final ZoneId ZONE_AR = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final AgentConfigRepository agentConfigRepository;
    private final AiAuditService auditService;
    private final EmailService emailService;
    private final WhatsAppService whatsAppService;

    public AiAuditScheduler(AgentConfigRepository agentConfigRepository,
                             AiAuditService auditService,
                             EmailService emailService,
                             WhatsAppService whatsAppService) {
        this.agentConfigRepository = agentConfigRepository;
        this.auditService = auditService;
        this.emailService = emailService;
        this.whatsAppService = whatsAppService;
    }

    @Scheduled(cron = "0 0 7 * * *", zone = "America/Argentina/Buenos_Aires")
    @Transactional(readOnly = true)
    public void ejecutarAuditoriaDiaria() {
        LocalDateTime hasta = ZonedDateTime.now(ZONE_AR).toLocalDateTime();
        LocalDateTime desde = hasta.minusHours(24);
        log.info("[AuditScheduler] Iniciando auditoría diaria — período {} a {}", desde.format(FMT), hasta.format(FMT));

        List<AgentConfig> configs = agentConfigRepository.findByAuditEnabledTrue();
        log.info("[AuditScheduler] {} agencia(s) con auditoría habilitada", configs.size());

        for (AgentConfig config : configs) {
            if (config.getAgencia() == null) continue;
            Long agenciaId = config.getAgencia().getId();
            try {
                AiAuditReport report = auditService.auditarAgencia(agenciaId, desde, hasta);
                enviarNotificaciones(config, report);
            } catch (Exception e) {
                log.error("[AuditScheduler] Error auditando agencia {}: {}", agenciaId, e.getMessage());
            }
        }

        log.info("[AuditScheduler] Auditoría diaria completada.");
    }

    private void enviarNotificaciones(AgentConfig config, AiAuditReport report) {
        String email = config.getAuditEmail();
        if (email != null && !email.isBlank()) {
            try {
                emailService.enviarReporteAuditoria(email, report);
            } catch (Exception e) {
                log.error("[AuditScheduler] Error enviando email para agencia {}: {}",
                        config.getAgencia().getId(), e.getMessage());
            }
        }

        String phone = config.getAuditWhatsappPhone();
        Dispositivo disp = config.getAuditDispositivo();
        if (phone != null && !phone.isBlank() && disp != null) {
            try {
                String resumen = buildWhatsAppSummary(report);
                whatsAppService.enviarTextoANumero(phone, resumen, disp);
            } catch (Exception e) {
                log.error("[AuditScheduler] Error enviando WhatsApp para agencia {}: {}",
                        config.getAgencia().getId(), e.getMessage());
            }
        }
    }

    private String buildWhatsAppSummary(AiAuditReport report) {
        String periodo = report.getPeriodoInicio().format(FMT) + " al " + report.getPeriodoFin().format(FMT);
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
}
