package service;

import java.time.format.DateTimeFormatter;

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
            String periodo  = report.getPeriodoInicio().format(FMT) + " – " + report.getPeriodoFin().format(FMT);
            int incumpl     = report.getIncumplimientos();
            String estadoTxt = incumpl == 0 ? "Sin incumplimientos" : incumpl + " incumplimiento(s) detectado(s)";

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from("OT CRM Auditor <" + emailFrom + ">")
                    .to(emailDestino)
                    .subject("Reporte de Auditoría — " + periodo + " (" + estadoTxt + ")")
                    .html(buildEmailHtml(report))
                    .build();
            CreateEmailResponse data = new Resend(apiKey).emails().send(params);
            log.info("[Auditor] Reporte enviado a {} — ID: {}", emailDestino, data.getId());
        } catch (ResendException e) {
            log.error("[Auditor] Error Resend enviando reporte: {}", e.getMessage());
        } catch (Exception e) {
            log.error("[Auditor] Error inesperado enviando reporte: ", e);
        }
    }

    // ─── Email HTML detallado ─────────────────────────────────────────────────

    private String buildEmailHtml(AiAuditReport report) {
        try {
            String jsonStr = report.getHallazgosJson();
            JsonNode root  = jsonStr != null && !jsonStr.isBlank()
                    ? objectMapper.readTree(jsonStr)
                    : objectMapper.createObjectNode();

            String resumenEj    = root.path("resumen_ejecutivo").asText("");
            if (resumenEj.isBlank()) resumenEj = report.getResumen() != null ? report.getResumen() : "";
            JsonNode procsNode  = root.path("procedimientos");
            JsonNode hallazgosNode = root.path("hallazgos");
            JsonNode convsNode  = root.path("conversaciones");
            JsonNode statsNode  = root.path("estadisticas");

            String periodo   = report.getPeriodoInicio().format(FMT) + " – " + report.getPeriodoFin().format(FMT);
            int incumpl      = report.getIncumplimientos();
            int score        = report.getScore();
            String scoreClr  = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
            String estadoClr = incumpl == 0 ? "#10b981" : incumpl <= 3 ? "#f59e0b" : "#ef4444";
            String estadoTxt = incumpl == 0 ? "✓ Sin incumplimientos" : incumpl + " incumplimiento(s)";

            StringBuilder h = new StringBuilder(12288);

            h.append("<!DOCTYPE html><html><head><meta charset='UTF-8'></head>")
             .append("<body style='margin:0;padding:0;background:#0a0a0a;font-family:Segoe UI,Arial,sans-serif;'>")
             .append("<div style='max-width:680px;margin:32px auto;background:#111118;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;'>");

            // ── HEADER ──
            h.append("<div style='background:linear-gradient(135deg,#1e1e2e,#14141f);padding:28px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);'>")
             .append("<div style='font-size:1.6rem;font-weight:900;color:#fff;letter-spacing:2px;'>O&apos;T CRM</div>")
             .append("<div style='color:#94a3b8;margin-top:5px;font-size:0.88rem;'>Reporte de Auditoría IA</div>")
             .append("</div>");

            // ── META: período / score / estado ──
            h.append("<table width='100%' cellpadding='0' cellspacing='0' style='background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06);'>")
             .append("<tr>")
             .append("<td style='padding:18px 24px;vertical-align:top;'>")
             .append("<div style='font-size:0.68rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;'>Período</div>")
             .append("<div style='color:#e2e8f0;font-weight:600;margin-top:3px;font-size:0.87rem;'>").append(escHtml(periodo)).append("</div>")
             .append("</td>")
             .append("<td style='padding:18px 24px;text-align:center;vertical-align:middle;'>")
             .append("<div style='font-size:2.4rem;font-weight:900;color:").append(scoreClr).append(";line-height:1;'>").append(score).append("</div>")
             .append("<div style='font-size:0.68rem;color:#64748b;margin-top:2px;'>/100</div>")
             .append("</td>")
             .append("<td style='padding:18px 24px;text-align:right;vertical-align:top;'>")
             .append("<div style='font-size:0.68rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;'>Estado</div>")
             .append("<div style='color:").append(estadoClr).append(";font-weight:700;margin-top:3px;font-size:0.87rem;'>").append(estadoTxt).append("</div>")
             .append("</td>")
             .append("</tr></table>");

            h.append("<div style='padding:24px 32px;'>");

            // ── RESUMEN EJECUTIVO ──
            if (!resumenEj.isBlank()) {
                h.append(secTitle("Resumen ejecutivo"));
                h.append("<div style='background:rgba(255,255,255,0.02);border-left:3px solid #334155;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;'>");
                for (String p : resumenEj.split("\\n+")) {
                    if (!p.trim().isEmpty())
                        h.append("<p style='margin:0 0 8px;color:#cbd5e1;font-size:0.87rem;line-height:1.7;'>").append(escHtml(p.trim())).append("</p>");
                }
                h.append("</div>");
            }

            // ── ESTADÍSTICAS ──
            if (!statsNode.isMissingNode() && !statsNode.isNull()) {
                int sTotal   = statsNode.path("total_conversaciones").asInt(0);
                int sCerr    = statsNode.path("cerradas").asInt(0);
                int sPresup  = statsNode.path("presupuestadas").asInt(0);
                int sSinR    = statsNode.path("sin_responder").asInt(0);
                int sIncomp  = statsNode.path("incompletas").asInt(0);
                int sSeguim  = statsNode.path("seguimiento").asInt(0);
                int sTScore  = statsNode.path("respuesta_tiempo_score").asInt(-1);
                int sTAvg    = statsNode.path("tiempo_respuesta_promedio_minutos").asInt(-1);

                h.append(secTitle("Estadísticas del período"));
                String[][] items = {
                    {String.valueOf(sTotal),  "Conversaciones", "#a78bfa"},
                    {String.valueOf(sCerr),   "Cerradas",        "#10b981"},
                    {String.valueOf(sPresup), "Presupuestadas",  "#3b82f6"},
                    {String.valueOf(sSinR),   "Sin responder",   "#ef4444"},
                    {String.valueOf(sIncomp), "Incompletas",     "#f59e0b"},
                    {String.valueOf(sSeguim), "Seguimiento",     "#94a3b8"},
                };
                h.append("<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:separate;border-spacing:6px;margin-bottom:").append(sTScore >= 0 ? "8" : "24").append("px;'><tr>");
                for (int si = 0; si < items.length; si++) {
                    h.append("<td width='33%' style='background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px;text-align:center;'>")
                     .append("<div style='font-size:1.5rem;font-weight:900;color:").append(items[si][2]).append(";line-height:1;'>").append(items[si][0]).append("</div>")
                     .append("<div style='font-size:0.65rem;color:#64748b;margin-top:3px;'>").append(items[si][1]).append("</div>")
                     .append("</td>");
                    if (si == 2) h.append("</tr><tr>");
                }
                h.append("</tr></table>");
                if (sTScore >= 0) {
                    String tsClr = sTScore >= 80 ? "#10b981" : sTScore >= 50 ? "#f59e0b" : "#ef4444";
                    h.append("<div style='background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 14px;margin-bottom:24px;display:flex;align-items:center;gap:10px;'>")
                     .append("<span style='font-size:0.72rem;color:#64748b;'>⏱ Tiempo de respuesta:</span>")
                     .append("<span style='font-size:1.1rem;font-weight:800;color:").append(tsClr).append(";'>").append(sTScore).append("%</span>");
                    if (sTAvg >= 0) h.append("<span style='font-size:0.72rem;color:#64748b;'>· Promedio: ").append(sTAvg).append(" min</span>");
                    h.append("</div>");
                }
            }

            // ── PROCEDIMIENTOS ──
            if (procsNode.isArray() && procsNode.size() > 0) {
                h.append(secTitle("Etapas evaluadas"));
                h.append("<div style='display:flex;flex-direction:column;gap:8px;margin-bottom:24px;'>");
                for (JsonNode p : procsNode) {
                    String est    = p.path("estado").asText("sin_dato");
                    String punto  = p.path("punto").asText("");
                    String justif = p.path("justificacion").asText("");
                    String estClr = switch(est) {
                        case "cumplido"   -> "#10b981";
                        case "parcial"    -> "#f59e0b";
                        case "incumplido" -> "#ef4444";
                        default           -> "#64748b";
                    };
                    String estIco = switch(est) {
                        case "cumplido"   -> "✅";
                        case "parcial"    -> "⚠️";
                        case "incumplido" -> "❌";
                        default           -> "—";
                    };
                    String estLbl = switch(est) {
                        case "cumplido"   -> "Cumplido";
                        case "parcial"    -> "Parcial";
                        case "incumplido" -> "Incumplido";
                        case "no_aplica"  -> "No aplica";
                        default           -> est;
                    };
                    h.append("<div style='background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-left:3px solid ").append(estClr).append(";border-radius:0 8px 8px 0;padding:12px 14px;'>")
                     .append("<table width='100%' cellpadding='0' cellspacing='0'><tr>")
                     .append("<td style='color:#e2e8f0;font-weight:700;font-size:0.87rem;'>").append(estIco).append(" ").append(escHtml(punto)).append("</td>")
                     .append("<td style='text-align:right;white-space:nowrap;'>")
                     .append("<span style='font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:4px;background:").append(estClr).append("22;color:").append(estClr).append(";'>").append(estLbl).append("</span>")
                     .append("</td></tr></table>");
                    if (!justif.isBlank())
                        h.append("<div style='color:#94a3b8;font-size:0.82rem;line-height:1.5;margin-top:5px;'>").append(escHtml(justif)).append("</div>");
                    // Evidencias
                    JsonNode evs = p.path("evidencias");
                    if (evs.isArray() && evs.size() > 0) {
                        h.append("<div style='margin-top:8px;display:flex;flex-direction:column;gap:5px;'>");
                        for (JsonNode ev : evs) {
                            String cita  = ev.path("cita_textual").asText("");
                            String evV   = ev.path("vendedor").asText("");
                            String evT   = ev.path("cuando").asText("");
                            String evC   = ev.path("como").asText("");
                            if (cita.isBlank()) continue;
                            h.append("<div style='background:rgba(0,0,0,0.28);border-left:2px solid #334155;padding:7px 11px;border-radius:0 4px 4px 0;'>")
                             .append("<div style='color:#64748b;font-size:0.7rem;margin-bottom:4px;'>")
                             .append(escHtml(evV));
                            if (!evT.isBlank()) h.append(" · ").append(escHtml(evT));
                            if (!evC.isBlank()) h.append(" — ").append(escHtml(evC));
                            h.append("</div>")
                             .append("<div style='font-style:italic;color:#cbd5e1;font-size:0.82rem;line-height:1.5;'>&ldquo;").append(escHtml(cita)).append("&rdquo;</div>")
                             .append("</div>");
                        }
                        h.append("</div>");
                    }
                    h.append("</div>");
                }
                h.append("</div>");
            }

            // ── HALLAZGOS ──
            if (hallazgosNode.isArray() && hallazgosNode.size() > 0) {
                h.append(secTitle("Hallazgos detectados (" + hallazgosNode.size() + ")"));
                h.append("<div style='display:flex;flex-direction:column;gap:10px;margin-bottom:24px;'>");
                for (JsonNode hz : hallazgosNode) {
                    String sev    = hz.path("severidad").asText("media");
                    String sevClr = "alta".equals(sev) ? "#ef4444" : "media".equals(sev) ? "#f59e0b" : "#94a3b8";
                    String regla  = hz.path("regla_violada").asText("");
                    String descr  = hz.path("descripcion").asText("");
                    String cita   = hz.path("cita_textual").asText("");
                    String vendor = hz.path("vendedor").asText("");
                    String cuando = hz.path("cuando").asText("");
                    h.append("<div style='background:rgba(255,255,255,0.02);border-left:3px solid ").append(sevClr).append(";border-radius:0 8px 8px 0;padding:13px 14px;'>")
                     .append("<table width='100%' cellpadding='0' cellspacing='0'><tr>")
                     .append("<td style='font-weight:700;color:#e2e8f0;font-size:0.87rem;'>").append(escHtml(regla)).append("</td>")
                     .append("<td style='text-align:right;white-space:nowrap;'>")
                     .append("<span style='font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:4px;background:").append(sevClr).append("22;color:").append(sevClr).append(";'>").append(sev).append("</span>")
                     .append("</td></tr></table>");
                    if (!vendor.isBlank() || !cuando.isBlank()) {
                        h.append("<div style='color:#64748b;font-size:0.74rem;margin-top:4px;'>").append(escHtml(vendor));
                        if (!cuando.isBlank()) h.append(" · ").append(escHtml(cuando));
                        h.append("</div>");
                    }
                    if (!descr.isBlank())
                        h.append("<div style='color:#94a3b8;font-size:0.82rem;line-height:1.5;margin-top:5px;'>").append(escHtml(descr)).append("</div>");
                    if (!cita.isBlank())
                        h.append("<blockquote style='margin:6px 0 0;padding:8px 12px;background:rgba(0,0,0,0.28);border-left:2px solid #475569;border-radius:4px;font-style:italic;color:#cbd5e1;font-size:0.82rem;line-height:1.5;'>&ldquo;").append(escHtml(cita)).append("&rdquo;</blockquote>");
                    h.append("</div>");
                }
                h.append("</div>");
            } else {
                h.append("<div style='text-align:center;padding:20px;color:#10b981;font-size:0.9rem;margin-bottom:24px;'>✓ No se detectaron hallazgos en el período</div>");
            }

            // ── CONVERSACIONES ──
            if (convsNode.isArray() && convsNode.size() > 0) {
                h.append(secTitle("Conversaciones analizadas (" + convsNode.size() + ")"));
                h.append("<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;font-size:0.81rem;margin-bottom:8px;'>")
                 .append("<tr style='background:rgba(255,255,255,0.04);'>")
                 .append(th("Vendedor")).append(th("Cliente")).append(th("Estado")).append(th("Tiempo")).append(th("Análisis"))
                 .append("</tr>");
                int row = 0;
                for (JsonNode cv : convsNode) {
                    String cvEst   = cv.path("estado").asText("");
                    String cvVend  = cv.path("vendedor").asText("?");
                    String cvClId  = cv.path("cliente_id").asText("");
                    String cvAnal  = cv.path("analisis").asText(cv.path("resumen").asText(""));
                    if (cvAnal.length() > 200) cvAnal = cvAnal.substring(0, 197) + "...";
                    int tMin       = cv.path("tiempo_respuesta_minutos").asInt(-1);
                    boolean tOk    = cv.path("tiempo_ok").asBoolean(true);
                    String estClr  = switch(cvEst) {
                        case "cerrado"       -> "#10b981";
                        case "presupuestado" -> "#3b82f6";
                        case "sin_responder" -> "#ef4444";
                        case "incompleto"    -> "#f59e0b";
                        default              -> "#94a3b8";
                    };
                    String estLbl  = switch(cvEst) {
                        case "cerrado"       -> "Cerrado";
                        case "presupuestado" -> "Presupuestado";
                        case "sin_responder" -> "Sin responder";
                        case "incompleto"    -> "Incompleto";
                        case "seguimiento"   -> "Seguimiento";
                        default              -> cvEst;
                    };
                    String rowBg = (row++ % 2 == 0) ? "transparent" : "rgba(255,255,255,0.01)";
                    h.append("<tr style='background:").append(rowBg).append(";border-bottom:1px solid rgba(255,255,255,0.04);'>")
                     .append(td(escHtml(cvVend), "#e2e8f0"))
                     .append(td("#" + escHtml(cvClId), "#94a3b8"))
                     .append("<td style='padding:8px 10px;vertical-align:top;'><span style='color:").append(estClr).append(";font-weight:600;'>").append(estLbl).append("</span></td>")
                     .append("<td style='padding:8px 10px;text-align:center;vertical-align:top;color:").append(tMin >= 0 ? (tOk ? "#10b981" : "#ef4444") : "#64748b").append(";'>").append(tMin >= 0 ? tMin + "m" : "—").append("</td>")
                     .append(td(escHtml(cvAnal), "#94a3b8"))
                     .append("</tr>");
                }
                h.append("</table>");
            }

            h.append("</div>"); // end main content

            // ── FOOTER ──
            h.append("<div style='padding:14px 32px;text-align:center;color:#475569;font-size:0.76rem;border-top:1px solid rgba(255,255,255,0.05);'>")
             .append("Generado automáticamente por O&apos;T CRM Auditor IA")
             .append("</div>");

            h.append("</div></body></html>");
            return h.toString();

        } catch (Exception e) {
            log.warn("[EmailService] Error construyendo HTML del reporte, usando fallback: {}", e.getMessage());
            String periodo = report.getPeriodoInicio().format(FMT) + " – " + report.getPeriodoFin().format(FMT);
            return "<!DOCTYPE html><html><body style='background:#0a0a0a;color:#e2e8f0;font-family:sans-serif;padding:32px;'>"
                    + "<h2>O'T CRM — Reporte de Auditoría</h2><p>" + escHtml(periodo) + "</p>"
                    + "<p>" + escHtml(report.getResumen() != null ? report.getResumen() : "") + "</p>"
                    + "</body></html>";
        }
    }

    private static String secTitle(String t) {
        return "<div style='font-size:0.68rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:10px;'>" + escHtml(t) + "</div>";
    }
    private static String th(String t) {
        return "<th style='padding:7px 10px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.75rem;'>" + escHtml(t) + "</th>";
    }
    private static String td(String t, String color) {
        return "<td style='padding:8px 10px;vertical-align:top;color:" + color + ";line-height:1.4;'>" + t + "</td>";
    }

    // ─── Texto WhatsApp detallado ─────────────────────────────────────────────

    public String buildWhatsAppTexto(AiAuditReport report) {
        try {
            String jsonStr = report.getHallazgosJson();
            JsonNode root  = jsonStr != null && !jsonStr.isBlank()
                    ? objectMapper.readTree(jsonStr)
                    : objectMapper.createObjectNode();

            String resumenEj   = root.path("resumen_ejecutivo").asText("");
            if (resumenEj.isBlank()) resumenEj = report.getResumen() != null ? report.getResumen() : "";
            JsonNode procsNode  = root.path("procedimientos");
            JsonNode hallazgosNode = root.path("hallazgos");
            JsonNode convsNode  = root.path("conversaciones");
            JsonNode statsNode  = root.path("estadisticas");

            String periodo = report.getPeriodoInicio().format(FMT) + " → " + report.getPeriodoFin().format(FMT);
            int incumpl    = report.getIncumplimientos();
            int score      = report.getScore();

            StringBuilder sb = new StringBuilder(4000);

            sb.append("*📊 Auditoría IA — OT CRM*\n");
            sb.append("Período: ").append(periodo).append("\n");
            sb.append("Score: *").append(score).append("/100*");
            if (incumpl == 0) sb.append(" ✅");
            else sb.append(" · ").append(incumpl).append(" incumplimiento(s) ⚠️");
            sb.append("\n");

            // Estadísticas rápidas
            if (!statsNode.isMissingNode()) {
                int sTotal  = statsNode.path("total_conversaciones").asInt(0);
                int sCerr   = statsNode.path("cerradas").asInt(0);
                int sSinR   = statsNode.path("sin_responder").asInt(0);
                int sTScore = statsNode.path("respuesta_tiempo_score").asInt(-1);
                int sTAvg   = statsNode.path("tiempo_respuesta_promedio_minutos").asInt(-1);
                sb.append("💬 ").append(sTotal).append(" conversaciones · ✅ ").append(sCerr).append(" cerradas · ❌ ").append(sSinR).append(" sin responder\n");
                if (sTScore >= 0) {
                    sb.append("⏱️ Tiempo resp.: *").append(sTScore).append("%*");
                    if (sTAvg >= 0) sb.append(" (prom. ").append(sTAvg).append("min)");
                    sb.append("\n");
                }
            }

            // Resumen ejecutivo (primer párrafo, max 450 chars)
            if (!resumenEj.isBlank()) {
                sb.append("\n📝 *Resumen:*\n");
                String primer = resumenEj.split("\\n+")[0].trim();
                if (primer.length() > 450) primer = primer.substring(0, 447) + "...";
                sb.append(primer).append("\n");
            }

            // Procedimientos
            if (procsNode.isArray() && procsNode.size() > 0) {
                int cumpl = 0, parcial = 0, incumplido = 0;
                for (JsonNode p : procsNode) {
                    switch(p.path("estado").asText()) {
                        case "cumplido"   -> cumpl++;
                        case "parcial"    -> parcial++;
                        case "incumplido" -> incumplido++;
                    }
                }
                sb.append("\n📋 *Etapas:* ✅ ").append(cumpl).append(" cumplidas");
                if (parcial > 0)    sb.append(" · ⚠️ ").append(parcial).append(" parciales");
                if (incumplido > 0) sb.append(" · ❌ ").append(incumplido).append(" incumplidas");
                sb.append("\n");
                for (JsonNode p : procsNode) {
                    String est = p.path("estado").asText();
                    if (!"incumplido".equals(est) && !"parcial".equals(est)) continue;
                    sb.append("  ").append("incumplido".equals(est) ? "❌" : "⚠️").append(" ").append(p.path("punto").asText("")).append("\n");
                    JsonNode evs = p.path("evidencias");
                    if (evs.isArray() && evs.size() > 0) {
                        String cita = evs.get(0).path("cita_textual").asText("");
                        if (!cita.isBlank()) {
                            if (cita.length() > 120) cita = cita.substring(0, 117) + "...";
                            sb.append("    _\"").append(cita).append("\"_\n");
                        }
                    }
                }
            }

            // Top hallazgos (max 3)
            if (hallazgosNode.isArray() && hallazgosNode.size() > 0) {
                sb.append("\n⚠️ *Hallazgos:*\n");
                int cnt = 0;
                for (JsonNode hz : hallazgosNode) {
                    if (cnt >= 3) { sb.append("  + ").append(hallazgosNode.size() - 3).append(" más en el panel.\n"); break; }
                    String regla  = hz.path("regla_violada").asText("");
                    String vendor = hz.path("vendedor").asText("");
                    String cita   = hz.path("cita_textual").asText("");
                    sb.append("• *").append(regla).append("*");
                    if (!vendor.isBlank()) sb.append(" (").append(vendor).append(")");
                    sb.append("\n");
                    if (!cita.isBlank()) {
                        String cs = cita.length() > 130 ? cita.substring(0, 127) + "..." : cita;
                        sb.append("  _\"").append(cs).append("\"_\n");
                    }
                    cnt++;
                }
            }

            // Conversaciones (max 8)
            if (convsNode.isArray() && convsNode.size() > 0) {
                sb.append("\n💬 *Conversaciones (").append(convsNode.size()).append("):*\n");
                int max = Math.min(convsNode.size(), 8);
                for (int ci = 0; ci < max; ci++) {
                    JsonNode cv = convsNode.get(ci);
                    String cvEst  = cv.path("estado").asText("");
                    String cvVend = cv.path("vendedor").asText("?");
                    String cvId   = cv.path("cliente_id").asText("");
                    int tMin      = cv.path("tiempo_respuesta_minutos").asInt(-1);
                    boolean tOk   = cv.path("tiempo_ok").asBoolean(true);
                    String icon   = switch(cvEst) {
                        case "cerrado"       -> "✅";
                        case "presupuestado" -> "🔵";
                        case "sin_responder" -> "❌";
                        default              -> "⚠️";
                    };
                    String lbl = switch(cvEst) {
                        case "cerrado"       -> "cerrado";
                        case "presupuestado" -> "presupuestado";
                        case "sin_responder" -> "sin respuesta";
                        case "incompleto"    -> "incompleto";
                        case "seguimiento"   -> "seguimiento";
                        default              -> cvEst;
                    };
                    sb.append(icon).append(" ").append(cvVend).append(" — #").append(cvId).append(" (").append(lbl);
                    if (tMin >= 0) sb.append(", ").append(tMin).append("min ").append(tOk ? "✓" : "✗");
                    sb.append(")\n");
                }
                if (convsNode.size() > 8) sb.append("  + ").append(convsNode.size() - 8).append(" más en el panel.\n");
            }

            sb.append("\n_Reporte completo disponible en el panel._");
            return sb.toString();

        } catch (Exception e) {
            log.warn("[EmailService] Error construyendo mensaje WhatsApp del reporte: {}", e.getMessage());
            String periodo = report.getPeriodoInicio().format(FMT) + " → " + report.getPeriodoFin().format(FMT);
            int total = report.getIncumplimientos();
            return "*Reporte de Auditoría IA — OT CRM*\n" + "Período: " + periodo + "\n\n"
                    + (total == 0 ? "Sin incumplimientos detectados." : "Se detectaron *" + total + " incumplimiento(s)*.\n\n" + (report.getResumen() != null ? report.getResumen() : ""))
                    + "\n\n_Reporte completo en el panel._";
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