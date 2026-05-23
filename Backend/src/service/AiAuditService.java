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
import com.fasterxml.jackson.databind.node.ObjectNode;

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

        // Estructura nueva: { resumen_ejecutivo, procedimientos[], hallazgos[] }
        // Se guarda el objeto completo en hallazgos_json (JSONB). El frontend parsea
        // defensivamente para soportar reportes legacy que eran arrays de hallazgos.
        String hallazgosJson = "{\"procedimientos\":[],\"hallazgos\":[]}";
        String resumen = "";
        int incumplimientos = 0;
        try {
            String cleaned = rawResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\s*", "").replaceAll("```\\s*$", "").trim();
            }
            JsonNode root = objectMapper.readTree(cleaned);

            // Si el modelo respondió directamente con un array (formato viejo),
            // lo envolvemos en la estructura nueva sin perder data.
            if (root.isArray()) {
                ObjectNode wrapper = objectMapper.createObjectNode();
                wrapper.set("hallazgos", root);
                wrapper.putArray("procedimientos");
                root = wrapper;
            }

            // 1) Hallazgos individuales (descarte de los que no traen cita_textual)
            ObjectNode normalized = objectMapper.createObjectNode();
            ArrayNode hallazgosOut = objectMapper.createArrayNode();
            JsonNode hallazgosNode = root.has("hallazgos") ? root.get("hallazgos") : null;
            if (hallazgosNode != null && hallazgosNode.isArray()) {
                for (JsonNode h : hallazgosNode) {
                    String cita = h.has("cita_textual") ? h.get("cita_textual").asText("") : "";
                    if (!cita.isBlank()) hallazgosOut.add(h);
                }
            }
            normalized.set("hallazgos", hallazgosOut);

            // 2) Procedimientos (análisis punto por punto). Aceptamos cualquier
            // procedimiento aun sin evidencias para mostrar el estado del control.
            ArrayNode procsOut = objectMapper.createArrayNode();
            JsonNode procsNode = root.has("procedimientos") ? root.get("procedimientos") : null;
            int procsIncumplidos = 0;
            if (procsNode != null && procsNode.isArray()) {
                for (JsonNode p : procsNode) {
                    procsOut.add(p);
                    String estado = p.has("estado") ? p.get("estado").asText("") : "";
                    if ("incumplido".equalsIgnoreCase(estado)) procsIncumplidos++;
                }
            }
            normalized.set("procedimientos", procsOut);

            // 3) Resumen ejecutivo extendido (2-3 párrafos) + resumen corto
            String resumenEjecutivo = root.has("resumen_ejecutivo")
                    ? root.get("resumen_ejecutivo").asText("")
                    : (root.has("resumen") ? root.get("resumen").asText("") : "");
            if (!resumenEjecutivo.isBlank()) {
                normalized.put("resumen_ejecutivo", resumenEjecutivo);
            }

            hallazgosJson = objectMapper.writeValueAsString(normalized);

            // El conteo de incumplimientos prioriza el análisis punto por punto;
            // si no hay procedimientos, cae al conteo legacy de hallazgos.
            incumplimientos = procsIncumplidos > 0 ? procsIncumplidos : hallazgosOut.size();

            // Resumen corto: lo primero del resumen ejecutivo o un default
            if (!resumenEjecutivo.isBlank()) {
                String firstLine = resumenEjecutivo.split("\\R", 2)[0];
                resumen = firstLine.length() > 280 ? firstLine.substring(0, 277) + "..." : firstLine;
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
        // Estructura nueva (wrapper) para que el frontend la parsee igual que un reporte real
        r.setHallazgosJson("{\"resumen_ejecutivo\":\"No se encontraron conversaciones en el período analizado.\",\"procedimientos\":[],\"hallazgos\":[]}");
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

    // Prompt detallado: el auditor debe producir un INFORME PUNTO POR PUNTO
    // sobre la lista de procedimientos configurada, con quién/cómo/cuándo y
    // comparación esperado vs. ocurrido cuando haya incumplimiento.
    private String buildAuditSystemPrompt(String procedures) {
        return "Sos un auditor experto y exigente de conversaciones de ventas por WhatsApp. "
                + "Tu tarea es producir un INFORME DETALLADO de cumplimiento, punto por punto, "
                + "sobre la lista de procedimientos de atención configurada por la agencia.\n\n"
                + "PROCEDIMIENTOS A AUDITAR (cada línea o ítem es un punto de control):\n"
                + "\"\"\"\n" + procedures + "\n\"\"\"\n\n"
                + "INSTRUCCIONES OBLIGATORIAS:\n"
                + "1. Identificá cada punto/regla de la lista anterior como un elemento separado.\n"
                + "2. Por CADA punto, indicá si se cumplió (\"cumplido\"), se cumplió parcialmente (\"parcial\") o no se cumplió (\"incumplido\"), y justificá con evidencia textual.\n"
                + "3. Para CADA evidencia incluí, de forma explícita y no genérica:\n"
                + "   • QUIÉN: el NOMBRE del vendedor que mandó el mensaje (no su ID), tal como aparece entre corchetes en la transcripción (VENDEDOR[nombre]).\n"
                + "   • CUÁNDO: el horario exacto del mensaje en formato dd/MM HH:mm tal como aparece en la transcripción.\n"
                + "   • CÓMO: descripción del modo en que actuó — tono usado, si siguió el formato/lenguaje del procedimiento, claridad, oportunidad.\n"
                + "   • CITA TEXTUAL: el texto EXACTO del mensaje relevante, entre comillas, sin parafrasear.\n"
                + "   • Si es parcial o incumplido: ESPERADO (qué dictaba el procedimiento) vs OCURRIDO (qué pasó en realidad).\n"
                + "4. NO des respuestas genéricas, vagas ni del estilo \"se cumplió correctamente\". Siempre citá el mensaje o describí concretamente la acción.\n"
                + "5. Si no podés citar el mensaje exacto, NO incluyas la evidencia.\n"
                + "6. Si un mismo punto se manifiesta con varios vendedores o varias conversaciones, listá una evidencia separada por cada caso.\n"
                + "7. Si para un punto no hay actividad relevante en el período, marcalo como \"parcial\" con justificación \"Sin evidencia suficiente en el período\" y dejá evidencias vacías.\n"
                + "8. El resumen ejecutivo debe tener entre 2 y 3 párrafos: panorama general, vendedores destacados/críticos por nombre, y recomendaciones accionables.\n"
                + "9. Además, listá los hallazgos individuales más graves (los \"red flags\") en el array \"hallazgos\" — un objeto por hallazgo grave.\n\n"
                + "FORMATO DE RESPUESTA — JSON ESTRICTO, sin markdown, sin bloques de código, sin texto antes ni después:\n"
                + "{\n"
                + "  \"resumen_ejecutivo\": \"Párrafo 1 ... \\n\\nPárrafo 2 ... \\n\\nPárrafo 3 ...\",\n"
                + "  \"procedimientos\": [\n"
                + "    {\n"
                + "      \"punto\": \"Texto breve del punto del procedimiento\",\n"
                + "      \"estado\": \"cumplido\" | \"parcial\" | \"incumplido\",\n"
                + "      \"justificacion\": \"Explicación detallada del estado, mencionando vendedores por nombre cuando corresponda\",\n"
                + "      \"evidencias\": [\n"
                + "        {\n"
                + "          \"vendedor\": \"Nombre del vendedor (NO ID)\",\n"
                + "          \"cliente_id\": 123,\n"
                + "          \"cuando\": \"dd/MM HH:mm\",\n"
                + "          \"como\": \"Cómo lo hizo: tono, formato, claridad\",\n"
                + "          \"cita_textual\": \"Texto exacto del mensaje\",\n"
                + "          \"esperado\": \"Qué dictaba el procedimiento (solo si parcial/incumplido)\",\n"
                + "          \"ocurrido\": \"Qué pasó realmente (solo si parcial/incumplido)\"\n"
                + "        }\n"
                + "      ]\n"
                + "    }\n"
                + "  ],\n"
                + "  \"hallazgos\": [\n"
                + "    {\n"
                + "      \"tipo\": \"incumplimiento\" | \"advertencia\",\n"
                + "      \"vendedor\": \"Nombre\",\n"
                + "      \"cliente_id\": 123,\n"
                + "      \"regla_violada\": \"Regla breve\",\n"
                + "      \"cita_textual\": \"Texto exacto\",\n"
                + "      \"cuando\": \"dd/MM HH:mm\",\n"
                + "      \"severidad\": \"alta\" | \"media\" | \"baja\",\n"
                + "      \"confianza\": \"alta\" | \"media\" | \"baja\",\n"
                + "      \"descripcion\": \"Explicación detallada\"\n"
                + "    }\n"
                + "  ]\n"
                + "}\n\n"
                + "IMPORTANTE: Respondé ÚNICAMENTE con el JSON, sin texto adicional, sin saludos, sin disculpas, sin markdown.";
    }
}
