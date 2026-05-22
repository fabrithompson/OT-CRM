package service;

import java.time.format.DateTimeFormatter;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;

import model.AiAuditReport;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Value("${resend.api.key}")
    private String apiKey;

    @Value("${app.email.enabled:true}")
    private boolean emailEnabled;

    @Value("${app.email.from}")
    private String emailFrom;

    private final ObjectMapper objectMapper;

    public EmailService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Async
    public void enviarCodigoVerificacion(String emailDestino, String codigo) {

        if (!emailEnabled) {
            log.info("=================================================");
            log.info("[DEV] Email desactivado. Código para {}: {}", emailDestino, codigo);
            log.info("=================================================");
            return;
        }

        try {
            Resend resend = new Resend(apiKey);
            String htmlContent = """
                <!DOCTYPE html>
                <html>
                <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                    <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="color: #333; margin: 0;">OT CRM</h2>
                        </div>
                        <p style="color: #555; font-size: 16px;">Hola,</p>
                        <p style="color: #555;">Estás a un paso de comenzar. Usa el siguiente código para validar tu identidad:</p>
                        
                        <div style="background-color: #000000; color: #ffffff; text-align: center; padding: 15px; margin: 25px 0; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
                            """ + codigo + """
                        </div>
                        
                        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
                            Si no solicitaste este código, puedes ignorar este mensaje tranquilamente.
                        </p>
                    </div>
                </body>
                </html>
                """;

            String remitente = emailFrom;

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("OT CRM <" + remitente + ">")
                    .to(emailDestino)
                    .subject("Tu Código de Verificación")
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);

            log.info("[Resend] Correo enviado a {}. ID de envío: {}", emailDestino, data.getId());

        } catch (ResendException e) {
            log.error("Error de API Resend: {}", e.getMessage());
        } catch (Exception e) {
            log.error("Error inesperado enviando correo: ", e);
        }
    }

    @Async
    public void enviarReporteAuditoria(String emailDestino, AiAuditReport report) {
        if (!emailEnabled) {
            log.info("[DEV] Email desactivado. Reporte auditoría para {} omitido.", emailDestino);
            return;
        }
        try {
            String periodo = report.getPeriodoInicio().format(FMT) + " – " + report.getPeriodoFin().format(FMT);
            int total = report.getIncumplimientos();
            String color = total == 0 ? "#10b981" : total <= 3 ? "#f59e0b" : "#ef4444";
            String estado = total == 0 ? "Sin incumplimientos" : total + " incumplimiento(s) detectado(s)";

            StringBuilder hallazgosHtml = new StringBuilder();
            try {
                JsonNode arr = objectMapper.readTree(
                        report.getHallazgosJson() != null ? report.getHallazgosJson() : "[]");
                if (arr.isArray()) {
                    for (JsonNode h : arr) {
                        String sev = h.has("severidad") ? h.get("severidad").asText() : "media";
                        String sevColor = "alta".equals(sev) ? "#ef4444" : "media".equals(sev) ? "#f59e0b" : "#94a3b8";
                        hallazgosHtml.append("<div style='margin-bottom:16px;padding:14px;background:rgba(255,255,255,0.03);border-left:3px solid ")
                            .append(sevColor).append(";border-radius:0 8px 8px 0;'>")
                            .append("<div style='font-weight:700;color:#e2e8f0;margin-bottom:6px;'>")
                            .append(escHtml(h.has("regla_violada") ? h.get("regla_violada").asText() : ""))
                            .append("</div>")
                            .append("<div style='color:#94a3b8;font-size:0.85rem;margin-bottom:8px;'>")
                            .append(escHtml(h.has("descripcion") ? h.get("descripcion").asText() : ""))
                            .append("</div>")
                            .append("<blockquote style='margin:0;padding:8px 12px;background:rgba(0,0,0,0.3);border-left:2px solid #475569;border-radius:4px;font-style:italic;color:#cbd5e1;font-size:0.82rem;'>")
                            .append(escHtml(h.has("cita_textual") ? h.get("cita_textual").asText() : ""))
                            .append("</blockquote>")
                            .append("<div style='margin-top:6px;font-size:0.75rem;color:#64748b;'>")
                            .append("Vendedor: ").append(escHtml(h.has("vendedor") ? h.get("vendedor").asText() : "?"))
                            .append(" · Severidad: <span style='color:").append(sevColor).append("'>").append(sev).append("</span>")
                            .append("</div></div>");
                    }
                }
            } catch (Exception ignored) {}

            String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'></head>"
                    + "<body style='margin:0;padding:0;background:#0a0a0a;font-family:Segoe UI,Arial,sans-serif;'>"
                    + "<div style='max-width:640px;margin:32px auto;background:#111118;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;'>"
                    + "<div style='background:linear-gradient(135deg,#1e1e2e,#14141f);padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);'>"
                    + "<div style='font-size:1.6rem;font-weight:900;color:#fff;letter-spacing:2px;'>O'T CRM</div>"
                    + "<div style='color:#94a3b8;margin-top:6px;font-size:0.9rem;'>Reporte de Auditoría IA</div></div>"
                    + "<div style='padding:28px 32px;'>"
                    + "<div style='background:rgba(255,255,255,0.03);border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;'>"
                    + "<div><div style='font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;'>Período analizado</div>"
                    + "<div style='color:#e2e8f0;font-weight:600;margin-top:4px;'>" + escHtml(periodo) + "</div></div>"
                    + "<div style='text-align:right;'><div style='font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;'>Estado</div>"
                    + "<div style='color:" + color + ";font-weight:700;margin-top:4px;'>" + estado + "</div></div></div>"
                    + "<div style='background:rgba(255,255,255,0.02);border-radius:8px;padding:14px 18px;margin-bottom:24px;color:#cbd5e1;font-size:0.9rem;line-height:1.6;border-left:3px solid #334155;'>"
                    + escHtml(report.getResumen() != null ? report.getResumen() : "") + "</div>"
                    + (hallazgosHtml.length() > 0
                        ? "<div style='margin-bottom:8px;font-size:0.8rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;'>Hallazgos</div>"
                            + hallazgosHtml
                        : "<div style='text-align:center;padding:24px;color:#10b981;font-size:1rem;'>No se detectaron incumplimientos</div>")
                    + "</div>"
                    + "<div style='padding:16px 32px;text-align:center;color:#475569;font-size:0.78rem;border-top:1px solid rgba(255,255,255,0.05);'>"
                    + "Este reporte fue generado automáticamente por O'T CRM Auditor IA</div></div></body></html>";

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("OT CRM Auditor <" + emailFrom + ">")
                    .to(emailDestino)
                    .subject("Reporte de Auditoría — " + periodo + " (" + estado + ")")
                    .html(html)
                    .build();

            CreateEmailResponse data = new Resend(apiKey).emails().send(params);
            log.info("[Auditor] Reporte enviado a {} — ID: {}", emailDestino, data.getId());
        } catch (ResendException e) {
            log.error("[Auditor] Error Resend enviando reporte: {}", e.getMessage());
        } catch (Exception e) {
            log.error("[Auditor] Error inesperado enviando reporte: ", e);
        }
    }

    private static String escHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    @Async
    public void enviarCodigoRecuperacion(String emailDestino, String codigo) {
        
        if (!emailEnabled) {
            log.info("=================================================");
            log.info("[DEV] Email desactivado. Código de recuperación para {}: {}", emailDestino, codigo);
            log.info("=================================================");
            return;
        }

        try {
            Resend resend = new Resend(apiKey);
            String htmlContent = """
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Montserrat', Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 40px auto; background: linear-gradient(145deg, #1a1a1f, #0f0f14); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
                        .header { background: linear-gradient(135deg, #1e1e24, #14141a); padding: 40px 30px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); }
                        .logo { font-size: 2.5rem; font-weight: 900; color: #fff; letter-spacing: 3px; margin-bottom: 10px; }
                        .content { padding: 40px 30px; }
                        .code-box { background: rgba(16, 185, 129, 0.1); border: 2px solid #10b981; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
                        .code { font-size: 3rem; font-weight: 800; color: #10b981; letter-spacing: 8px; font-family: 'Courier New', monospace; }
                        .footer { padding: 20px 30px; text-align: center; color: #666; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.05); }
                        h1 { color: #10b981; margin: 0 0 10px 0; font-size: 1.8rem; }
                        p { color: #cbd5e1; line-height: 1.6; margin: 15px 0; }
                        .warning { background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 8px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">O'T CRM</div>
                            <p style="color: #94a3b8; margin: 0;">Sistema de Gestión Empresarial</p>
                        </div>
                        <div class="content">
                            <h1>Recuperación de Contraseña</h1>
                            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
                            <p>Usá este código de 6 dígitos para continuar:</p>
                            
                            <div class="code-box">
                                <div class="code">""" + codigo + """
                </div>
                            </div>
                            
                            <div class="warning">
                                <strong>Importante:</strong>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li>Este código es válido por 15 minutos</li>
                                    <li>Si no solicitaste este cambio, ignorá este email</li>
                                    <li>Nunca compartas este código con nadie</li>
                                </ul>
                            </div>
                            
                            <p style="margin-top: 30px; color: #94a3b8; font-size: 0.9rem;">
                                Si tenés problemas, contactá a soporte desde nuestro panel.
                            </p>
                        </div>
                        <div class="footer">
                            <p>© 2026 O'T CRM. Todos los derechos reservados.</p>
                            <p>Este es un email automático. Por favor no respondas.</p>
                        </div>
                    </div>
                </body>
                </html>
                """;

            String remitente = emailFrom;

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("OT CRM <" + remitente + ">")
                    .to(emailDestino)
                    .subject("Recuperación de Contraseña - O'T CRM")
                    .html(htmlContent)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);

            log.info("✅ [Resend] Email de recuperación enviado a {}. ID: {}", emailDestino, data.getId());

        } catch (ResendException e) {
            log.error("Error de API Resend al enviar recuperación: {}", e.getMessage());
        } catch (Exception e) {
            log.error("Error inesperado enviando email de recuperación: ", e);
        }
    }
    
}