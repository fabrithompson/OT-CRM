package service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;

import model.AgentConfig;
import model.AiAuditReport;
import model.Agencia;
import model.Mensaje;
import repository.AgenciaRepository;
import repository.AgentConfigRepository;
import repository.AiAuditReportRepository;
import repository.ClienteRepository;
import repository.MensajeRepository;

@Service
public class AiAuditService {

    private static final Logger log = LoggerFactory.getLogger(AiAuditService.class);
    private static final int MAX_CLIENTES = 30;
    private static final int MAX_MENSAJES_POR_CLIENTE = 25;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final ChatClient chatClient;
    private final AgentConfigRepository agentConfigRepository;
    private final AiAuditReportRepository auditReportRepository;
    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final AgenciaRepository agenciaRepository;
    private final ObjectMapper objectMapper;

    public AiAuditService(ChatClient chatClient,
                          AgentConfigRepository agentConfigRepository,
                          AiAuditReportRepository auditReportRepository,
                          ClienteRepository clienteRepository,
                          MensajeRepository mensajeRepository,
                          AgenciaRepository agenciaRepository,
                          ObjectMapper objectMapper) {
        this.chatClient = chatClient;
        this.agentConfigRepository = agentConfigRepository;
        this.auditReportRepository = auditReportRepository;
        this.clienteRepository = clienteRepository;
        this.mensajeRepository = mensajeRepository;
        this.agenciaRepository = agenciaRepository;
        this.objectMapper = objectMapper;
    }

    @SuppressWarnings("null")
    @Transactional
    public AiAuditReport auditarAgencia(Long agenciaId, LocalDateTime desde, LocalDateTime hasta) {
        AgentConfig config = agentConfigRepository.findByAgenciaId(agenciaId).orElse(null);
        if (config == null || !config.isAuditEnabled()) {
            throw new IllegalStateException("Auditoría no habilitada para esta agencia");
        }
        if (config.getAuditProcedures() == null || config.getAuditProcedures().isBlank()) {
            throw new IllegalStateException("No hay procedimientos configurados para auditar");
        }

        Agencia agencia = agenciaRepository.findById(agenciaId)
                .orElseThrow(() -> new IllegalArgumentException("Agencia no encontrada"));

        List<Long> clienteIds = mensajeRepository
                .findClienteIdsActivosEnPeriodo(agenciaId, desde, hasta, PageRequest.of(0, MAX_CLIENTES));

        if (clienteIds.isEmpty()) {
            AiAuditReport report = buildEmptyReport(agencia, desde, hasta);
            return auditReportRepository.save(report);
        }

        String conversacionesCtx = buildConversacionesContext(clienteIds, desde, hasta);
        String systemPrompt = buildAuditSystemPrompt(config.getAuditProcedures());
        String userPrompt = "Auditá las conversaciones del período "
                + desde.format(FMT) + " al " + hasta.format(FMT) + ":\n\n" + conversacionesCtx;

        ChatResponse chatResponse;
        try {
            chatResponse = chatClient.prompt()
                    .options(OpenAiChatOptions.builder()
                            .model("gpt-4o")
                            .temperature(0.1)
                            .build())
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .chatResponse();
        } catch (Exception e) {
            log.error("GPT audit call failed for agencia {}: {}", agenciaId, e.getMessage());
            throw new RuntimeException("Error al llamar al modelo de IA: " + e.getMessage(), e);
        }

        String rawResponse = "";
        int tokensUsados = 0;
        if (chatResponse != null) {
            if (chatResponse.getResult() != null && chatResponse.getResult().getOutput() != null) {
                rawResponse = chatResponse.getResult().getOutput().getText();
                if (rawResponse == null) rawResponse = "";
            }
            if (chatResponse.getMetadata() != null && chatResponse.getMetadata().getUsage() != null) {
                var usage = chatResponse.getMetadata().getUsage();
                if (usage.getTotalTokens() != null) {
                    tokensUsados = ((Number) usage.getTotalTokens()).intValue();
                }
            }
        }

        String hallazgosJson = "[]";
        String resumen = "";
        int incumplimientos = 0;
        try {
            String cleaned = rawResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\s*", "").replaceAll("```\\s*$", "").trim();
            }
            JsonNode root = objectMapper.readTree(cleaned);
            JsonNode hallazgosNode = root.has("hallazgos") ? root.get("hallazgos") : root;
            if (hallazgosNode.isArray()) {
                ArrayNode filtered = objectMapper.createArrayNode();
                for (JsonNode h : hallazgosNode) {
                    String cita = h.has("cita_textual") ? h.get("cita_textual").asText("") : "";
                    if (!cita.isBlank()) filtered.add(h);
                }
                hallazgosJson = objectMapper.writeValueAsString(filtered);
                incumplimientos = filtered.size();
            }
            if (root.has("resumen")) {
                resumen = root.get("resumen").asText();
            } else {
                resumen = incumplimientos == 0
                        ? "No se detectaron incumplimientos en el período analizado."
                        : "Se detectaron " + incumplimientos + " incumplimiento(s).";
            }
        } catch (Exception e) {
            log.warn("Could not parse audit JSON for agencia {}: {}", agenciaId, e.getMessage());
            resumen = "Error al procesar la respuesta del auditor.";
        }

        AiAuditReport report = new AiAuditReport();
        report.setAgencia(agencia);
        report.setPeriodoInicio(desde);
        report.setPeriodoFin(hasta);
        report.setResumen(resumen);
        report.setHallazgosJson(hallazgosJson);
        report.setIncumplimientos(incumplimientos);
        report.setTokensUsados(tokensUsados);
        return auditReportRepository.save(report);
    }

    private AiAuditReport buildEmptyReport(Agencia agencia, LocalDateTime desde, LocalDateTime hasta) {
        AiAuditReport r = new AiAuditReport();
        r.setAgencia(agencia);
        r.setPeriodoInicio(desde);
        r.setPeriodoFin(hasta);
        r.setResumen("No se encontraron conversaciones en el período analizado.");
        r.setHallazgosJson("[]");
        r.setIncumplimientos(0);
        r.setTokensUsados(0);
        return r;
    }

    @SuppressWarnings("null")
    private String buildConversacionesContext(List<Long> clienteIds, LocalDateTime desde, LocalDateTime hasta) {
        StringBuilder sb = new StringBuilder();
        for (Long clienteId : clienteIds) {
            var cliente = clienteRepository.findById(clienteId).orElse(null);
            if (cliente == null) continue;

            List<Mensaje> mensajes = new ArrayList<>(
                    mensajeRepository.findByClienteIdAndFechaHoraBetween(clienteId, desde, hasta));
            if (mensajes.isEmpty()) continue;

            mensajes.sort(Comparator.comparing(
                    m -> m.getFechaHora() != null ? m.getFechaHora() : LocalDateTime.MIN));
            if (mensajes.size() > MAX_MENSAJES_POR_CLIENTE) {
                mensajes = mensajes.subList(mensajes.size() - MAX_MENSAJES_POR_CLIENTE, mensajes.size());
            }

            String nombre = cliente.getNombre() != null && !cliente.getNombre().isBlank()
                    ? cliente.getNombre() : cliente.getTelefono();
            sb.append("=== CLIENTE: ").append(nombre).append(" (ID:").append(clienteId).append(") ===\n");

            for (Mensaje m : mensajes) {
                String hora = m.getFechaHora() != null ? m.getFechaHora().format(FMT) : "?";
                String quien = m.isEsSalida()
                        ? "VENDEDOR[" + (m.getAutor() != null ? m.getAutor() : "?") + "]"
                        : "CLIENTE";
                sb.append("[").append(hora).append("] ").append(quien)
                  .append(": ").append(m.getContenido()).append("\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private String buildAuditSystemPrompt(String procedures) {
        return "Sos un auditor experto de conversaciones de ventas por WhatsApp. "
                + "Tu tarea es analizar transcripciones de conversaciones entre vendedores y clientes "
                + "y detectar incumplimientos a los procedimientos de atención establecidos.\n\n"
                + "PROCEDIMIENTOS A AUDITAR:\n" + procedures + "\n\n"
                + "INSTRUCCIONES:\n"
                + "- Para cada incumplimiento, incluí OBLIGATORIAMENTE una cita textual del mensaje que lo evidencia.\n"
                + "- Si no podés citar textualmente el mensaje, NO reportes el incumplimiento.\n"
                + "- Evaluá solo lo que realmente ocurrió, no supongas intenciones.\n"
                + "- Considerá el contexto: horario, si el cliente interrumpió, etc.\n\n"
                + "FORMATO DE RESPUESTA (JSON puro, sin markdown, sin bloques de código):\n"
                + "{\"resumen\": \"texto conciso del análisis (2-3 oraciones)\","
                + "\"hallazgos\": [{\"tipo\": \"incumplimiento\" o \"advertencia\","
                + "\"vendedor\": \"nombre o ID del autor\","
                + "\"cliente_id\": 123,"
                + "\"regla_violada\": \"descripción breve de la regla incumplida\","
                + "\"cita_textual\": \"texto exacto del mensaje que lo evidencia\","
                + "\"severidad\": \"alta\" o \"media\" o \"baja\","
                + "\"confianza\": \"alta\" o \"media\" o \"baja\","
                + "\"descripcion\": \"explicación detallada\"}]}\n\n"
                + "Si no hay incumplimientos: {\"resumen\": \"No se detectaron incumplimientos.\", \"hallazgos\": []}\n"
                + "IMPORTANTE: Respondé ÚNICAMENTE con el JSON. Sin texto adicional.";
    }
}
