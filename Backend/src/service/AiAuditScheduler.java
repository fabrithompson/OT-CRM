package service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import model.Agencia;
import model.AgentConfig;
import model.AiAuditReport;
import model.Dispositivo;
import repository.AgentConfigRepository;

@Component
public class AiAuditScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiAuditScheduler.class);
    private static final ZoneId ZONE_AR = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");
    private static final LocalTime DEFAULT_TRIGGER = LocalTime.of(7, 0);

    private final AgentConfigRepository agentConfigRepository;
    private final AiAuditService auditService;
    private final EmailService emailService;
    private final WhatsAppService whatsAppService;
    private final AiAuditScheduler self;

    public AiAuditScheduler(AgentConfigRepository agentConfigRepository,
                             AiAuditService auditService,
                             EmailService emailService,
                             WhatsAppService whatsAppService,
                             @Lazy AiAuditScheduler self) {
        this.agentConfigRepository = agentConfigRepository;
        this.auditService = auditService;
        this.emailService = emailService;
        this.whatsAppService = whatsAppService;
        this.self = self;
    }

    /**
     * Tick por minuto: dispara la auditoría automática de cada agencia con
     * audit_enabled=true cuando el reloj AR llega a su horario laboral de fin
     * (o 07:00 si la agencia no configuró horario). Dedupe por día via
     * {@code last_auto_audit_at} para sobrevivir reinicios y múltiples instancias.
     */
    @Scheduled(cron = "0 * * * * *", zone = "America/Argentina/Buenos_Aires")
    public void tickAuditoriaPorHorario() {
        ZonedDateTime nowAr = ZonedDateTime.now(ZONE_AR);
        LocalDate today = nowAr.toLocalDate();
        LocalTime nowHm = nowAr.toLocalTime().withSecond(0).withNano(0);

        List<Long> ids = self.candidatosParaDisparar(nowHm, today);
        for (Long agentConfigId : ids) {
            try {
                self.procesarAgencia(agentConfigId, today);
            } catch (Exception e) {
                log.error("[AuditScheduler] Error procesando agentConfig {}: {}", agentConfigId, e.getMessage());
            }
        }
    }

    /**
     * Lee en una TX read-only y devuelve los IDs de AgentConfig cuya agencia
     * debe disparar la auditoría en este minuto.
     */
    @Transactional(readOnly = true)
    public List<Long> candidatosParaDisparar(LocalTime nowHm, LocalDate today) {
        List<AgentConfig> configs = agentConfigRepository.findByAuditEnabledTrue();
        return configs.stream()
                .filter(c -> debeDispararse(c, nowHm, today))
                .map(AgentConfig::getId)
                .toList();
    }

    private boolean debeDispararse(AgentConfig config, LocalTime nowHm, LocalDate today) {
        Agencia agencia = config.getAgencia();
        if (agencia == null) return false;

        LocalTime horarioFin = agencia.getHorarioLaboralFin();
        LocalTime trigger = horarioFin != null ? horarioFin.withSecond(0).withNano(0) : DEFAULT_TRIGGER;
        if (!nowHm.equals(trigger)) return false;

        LocalDateTime last = config.getLastAutoAuditAt();
        return last == null || !last.toLocalDate().equals(today);
    }

    /**
     * Ejecuta la auditoría de una agencia, persiste el reporte y envía las
     * notificaciones. Cada agencia corre en su propia TX para que una falla no
     * arrastre al resto del tick.
     */
    @SuppressWarnings("null")
    @Transactional
    public void procesarAgencia(Long agentConfigId, LocalDate today) {
        AgentConfig config = agentConfigRepository.findById(agentConfigId).orElse(null);
        if (config == null) return;

        Agencia agencia = config.getAgencia();
        if (agencia == null) return;

        // Re-chequeo del dedupe ya dentro de la TX (defensivo ante races).
        LocalDateTime last = config.getLastAutoAuditAt();
        if (last != null && last.toLocalDate().equals(today)) return;

        LocalTime horarioInicio = agencia.getHorarioLaboralInicio();
        LocalTime horarioFin = agencia.getHorarioLaboralFin();
        LocalDateTime hasta;
        LocalDateTime desde;
        if (horarioInicio != null && horarioFin != null) {
            hasta = LocalDateTime.of(today, horarioFin);
            desde = LocalDateTime.of(today, horarioInicio);
            if (!desde.isBefore(hasta)) {
                desde = hasta.minusHours(24);
            }
        } else {
            hasta = ZonedDateTime.now(ZONE_AR).toLocalDateTime();
            desde = hasta.minusHours(24);
        }

        log.info("[AuditScheduler] Disparo automático agencia {} — período {} a {}",
                agencia.getId(), desde.format(FMT), hasta.format(FMT));

        AiAuditReport report = auditService.auditarAgencia(agencia.getId(), desde, hasta);
        enviarNotificaciones(config, report);

        config.setLastAutoAuditAt(LocalDateTime.now());
        agentConfigRepository.save(config);
    }

    private void enviarNotificaciones(AgentConfig config, AiAuditReport report) {
        Long agenciaId = config.getAgencia() != null ? config.getAgencia().getId() : null;

        String email = config.getAuditEmail();
        if (email != null && !email.isBlank()) {
            try {
                emailService.enviarReporteAuditoria(email, report);
            } catch (Exception e) {
                log.error("[AuditScheduler] Error enviando email para agencia {}: {}",
                        agenciaId, e.getMessage());
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
                        agenciaId, e.getMessage());
            }
        }
    }

    private String buildWhatsAppSummary(AiAuditReport report) {
        return emailService.buildWhatsAppTexto(report);
    }
}
