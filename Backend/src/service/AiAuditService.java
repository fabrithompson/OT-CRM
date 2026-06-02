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
import model.AuditStage;
import model.Mensaje;
import repository.AgenciaRepository;
import repository.AgentConfigRepository;
import repository.AiAuditReportRepository;
import repository.AuditStageRepository;
import repository.ClienteRepository;
import repository.MensajeRepository;

@Service
public class AiAuditService {

    private static final Logger log = LoggerFactory.getLogger(AiAuditService.class);
    private static final int MAX_CLIENTES = 30;
    private static final int MAX_MENSAJES_POR_CLIENTE = 25;
    private static final int MAX_MEDIA_POR_CLIENTE = 3;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final ChatClient chatClient;
    private final AgentConfigRepository agentConfigRepository;
    private final AuditStageRepository auditStageRepository;
    private final AiAuditReportRepository auditReportRepository;
    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final AgenciaRepository agenciaRepository;
    private final ObjectMapper objectMapper;
    private final MediaAuditEnricher mediaEnricher;
    private final AuditStageMigrationService auditStageMigrationService;

    public AiAuditService(ChatClient chatClient,
                          AgentConfigRepository agentConfigRepository,
                          AuditStageRepository auditStageRepository,
                          AiAuditReportRepository auditReportRepository,
                          ClienteRepository clienteRepository,
                          MensajeRepository mensajeRepository,
                          AgenciaRepository agenciaRepository,
                          ObjectMapper objectMapper,
                          MediaAuditEnricher mediaEnricher,
                          AuditStageMigrationService auditStageMigrationService) {
        this.chatClient = chatClient;
        this.agentConfigRepository = agentConfigRepository;
        this.auditStageRepository = auditStageRepository;
        this.auditReportRepository = auditReportRepository;
        this.clienteRepository = clienteRepository;
        this.mensajeRepository = mensajeRepository;
        this.agenciaRepository = agenciaRepository;
        this.objectMapper = objectMapper;
        this.mediaEnricher = mediaEnricher;
        this.auditStageMigrationService = auditStageMigrationService;
    }

    @SuppressWarnings("null")
    @Transactional
    public AiAuditReport auditarAgencia(Long agenciaId, LocalDateTime desde, LocalDateTime hasta) {
        AgentConfig config = agentConfigRepository.findByAgenciaId(agenciaId).orElse(null);
        if (config == null || !config.isAuditEnabled()) {
            throw new IllegalStateException("Auditoría no habilitada para esta agencia");
        }

        Agencia agencia = agenciaRepository.findById(agenciaId)
                .orElseThrow(() -> new IllegalArgumentException("Agencia no encontrada"));

        // Obtener etapas activas; migración lazy si el cliente aún usa texto libre
        List<AuditStage> stages = auditStageRepository.findActiveByAgentConfigId(config.getId());
        if (stages.isEmpty() && config.getAuditProcedures() != null
                && !config.getAuditProcedures().isBlank()) {
            log.info("[AiAuditService] Migración lazy de etapas para config {}", config.getId());
            if (auditStageMigrationService.migrarAgentConfig(config)) {
                stages = auditStageRepository.findActiveByAgentConfigId(config.getId());
            }
        }

        boolean legacyMode = stages.isEmpty();
        if (legacyMode && (config.getAuditProcedures() == null || config.getAuditProcedures().isBlank())) {
            throw new IllegalStateException("No hay etapas configuradas para auditar");
        }
        if (legacyMode) {
            log.info("[AiAuditService] Usando modo legacy (auditProcedures) para config {}", config.getId());
        }

        List<Long> clienteIds = mensajeRepository
                .findClienteIdsActivosEnPeriodo(agenciaId, desde, hasta, PageRequest.of(0, MAX_CLIENTES));

        if (clienteIds.isEmpty()) {
            AiAuditReport report = buildEmptyReport(agencia, desde, hasta);
            return auditReportRepository.save(report);
        }

        String conversacionesCtx = buildConversacionesContext(clienteIds, desde, hasta);
        String systemPrompt = legacyMode
                ? buildLegacyAuditSystemPrompt(config.getAuditProcedures())
                : buildAuditSystemPrompt(stages);
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

        String hallazgosJson = "{\"procedimientos\":[],\"hallazgos\":[]}";
        String resumen = "";
        int incumplimientos = 0;
        int scoreCalculado = 0;
        try {
            String cleaned = rawResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\s*", "").replaceAll("```\\s*$", "").trim();
            }
            JsonNode root = objectMapper.readTree(cleaned);

            if (root.isArray()) {
                ObjectNode wrapper = objectMapper.createObjectNode();
                wrapper.set("hallazgos", root);
                wrapper.putArray("procedimientos");
                root = wrapper;
            }

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

            // Preservar conversaciones y estadísticas si la IA las devuelve
            if (root.has("conversaciones")) normalized.set("conversaciones", root.get("conversaciones"));
            if (root.has("estadisticas")) normalized.set("estadisticas", root.get("estadisticas"));

            String resumenEjecutivo = root.has("resumen_ejecutivo")
                    ? root.get("resumen_ejecutivo").asText("")
                    : (root.has("resumen") ? root.get("resumen").asText("") : "");
            if (!resumenEjecutivo.isBlank()) {
                normalized.put("resumen_ejecutivo", resumenEjecutivo);
            }

            hallazgosJson = objectMapper.writeValueAsString(normalized);

            incumplimientos = procsIncumplidos > 0 ? procsIncumplidos : hallazgosOut.size();

            if (!resumenEjecutivo.isBlank()) {
                String firstLine = resumenEjecutivo.split("\\R", 2)[0];
                resumen = firstLine.length() > 280 ? firstLine.substring(0, 277) + "..." : firstLine;
            } else {
                resumen = incumplimientos == 0
                        ? "No se detectaron incumplimientos en el período analizado."
                        : "Se detectaron " + incumplimientos + " incumplimiento(s).";
            }

            // Score calculado en backend a partir de los pesos configurados
            scoreCalculado = calcularScorePonderado(stages, hallazgosJson);

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
        report.setScore(scoreCalculado);
        return auditReportRepository.save(report);
    }

    private AiAuditReport buildEmptyReport(Agencia agencia, LocalDateTime desde, LocalDateTime hasta) {
        AiAuditReport r = new AiAuditReport();
        r.setAgencia(agencia);
        r.setPeriodoInicio(desde);
        r.setPeriodoFin(hasta);
        r.setResumen("No se encontraron conversaciones en el período analizado.");
        r.setHallazgosJson("{\"resumen_ejecutivo\":\"No se encontraron conversaciones en el período analizado.\",\"procedimientos\":[],\"hallazgos\":[]}");
        r.setIncumplimientos(0);
        r.setTokensUsados(0);
        r.setScore(0);
        return r;
    }

    private int calcularScorePonderado(List<AuditStage> stages, String hallazgosJson) {
        try {
            JsonNode root = objectMapper.readTree(hallazgosJson);
            JsonNode procs = root.get("procedimientos");
            if (procs == null || !procs.isArray()) return 0;

            java.util.Map<Long, Double> multiplicadores = new java.util.HashMap<>();
            for (JsonNode p : procs) {
                if (!p.has("stage_id")) continue;
                long sid = p.get("stage_id").asLong();
                String estado = p.has("estado") ? p.get("estado").asText("") : "";
                double mult = switch (estado) {
                    case "cumplido"   -> 1.0;
                    case "parcial"    -> 0.5;
                    case "incumplido" -> 0.0;
                    case "no_aplica"  -> -1.0; // se excluye del cálculo
                    default            -> 0.0;
                };
                multiplicadores.put(sid, mult);
            }

            double pesoTotal = 0;
            double pesoLogrado = 0;
            for (AuditStage s : stages) {
                Double mult = multiplicadores.get(s.getId());
                if (mult == null || mult < 0) continue; // sin data o no_aplica
                pesoTotal   += s.getPeso();
                pesoLogrado += s.getPeso() * mult;
            }
            if (pesoTotal == 0) return 0;
            return (int) Math.round((pesoLogrado / pesoTotal) * 100);
        } catch (Exception e) {
            log.warn("Error calculando score ponderado: {}", e.getMessage());
            return 0;
        }
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

            int mediaEnriquecida = 0;
            for (Mensaje m : mensajes) {
                String hora = m.getFechaHora() != null ? m.getFechaHora().format(FMT) : "?";
                String quien = m.isEsSalida()
                        ? "VENDEDOR[" + (m.getAutor() != null ? m.getAutor() : "?") + "]"
                        : "CLIENTE";
                sb.append("[").append(hora).append("] ").append(quien)
                  .append(": ").append(m.getContenido());

                if (mediaEnriquecida < MAX_MEDIA_POR_CLIENTE) {
                    String extra = mediaEnricher.enriquecer(m);
                    if (extra != null) {
                        sb.append(" ").append(extra);
                        mediaEnriquecida++;
                    }
                }
                sb.append("\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    // Prompt legacy para configs que aún usan auditProcedures (texto libre).
    // Se usa como fallback cuando la migración automática falla (ej: clave de test).
    private String buildLegacyAuditSystemPrompt(String procedures) {
        return "Sos un auditor experto y exigente de conversaciones de ventas por WhatsApp. "
                + "Tu tarea es producir un INFORME DETALLADO de cumplimiento, punto por punto, "
                + "sobre la lista de procedimientos de atención configurada por la agencia.\n\n"
                + "NOTA SOBRE EL CONTEXTO: Algunos mensajes incluyen contenido enriquecido entre corchetes:\n"
                + "- [Transcripción de audio: \"...\"] — texto extraído de un audio.\n"
                + "- [Contenido del documento (PDF/DOCX/TXT): ...] — texto de un documento adjunto.\n\n"
                + "PROCEDIMIENTOS A AUDITAR:\n\"\"\"\n" + procedures + "\n\"\"\"\n\n"
                + "INSTRUCCIONES OBLIGATORIAS:\n"
                + "1. Por CADA punto, indicá si se cumplió (\"cumplido\"), parcialmente (\"parcial\") o no (\"incumplido\").\n"
                + "2. Para cada evidencia incluí quién, cuándo y cita textual exacta.\n"
                + "3. El resumen ejecutivo debe tener 2-3 párrafos con panorama, vendedores y recomendaciones.\n"
                + "4. Respondé ÚNICAMENTE con JSON, sin markdown ni texto adicional:\n"
                + "{\n"
                + "  \"resumen_ejecutivo\": \"...\",\n"
                + "  \"procedimientos\": [\n"
                + "    { \"punto\": \"...\", \"estado\": \"cumplido|parcial|incumplido\",\n"
                + "      \"justificacion\": \"...\", \"evidencias\": [] }\n"
                + "  ],\n"
                + "  \"hallazgos\": []\n"
                + "}";
    }

    private String buildAuditSystemPrompt(List<AuditStage> stages) {
        StringBuilder etapasTexto = new StringBuilder();
        for (int i = 0; i < stages.size(); i++) {
            AuditStage s = stages.get(i);
            etapasTexto.append("\nETAPA ").append(i + 1).append(" | ")
                       .append(s.getNombre().toUpperCase()).append("\n");
            if (s.getDescripcion() != null && !s.getDescripcion().isBlank()) {
                etapasTexto.append(s.getDescripcion()).append("\n");
            }
            etapasTexto.append("(ID interno: ").append(s.getId()).append(")\n");
        }

        return "Sos un auditor experto y exigente de procesos de venta por WhatsApp. "
            + "Tu tarea es analizar las conversaciones del período y producir un informe "
            + "detallado de cumplimiento.\n\n"

            + "## ETAPAS A AUDITAR\n"
            + "Cada agencia define sus propias etapas. Para esta agencia las etapas son:\n"
            + etapasTexto.toString() + "\n"

            + "## IDENTIFICACIÓN DE VENDEDORES\n"
            + "Para cada mensaje del vendedor, identificá su nombre usando esta prioridad:\n"
            + "1. Nombre entre corchetes en el prefijo del mensaje: VENDEDOR[nombre].\n"
            + "2. Nombre al pie de documentos PDF si aparece campo 'Vendedor:' o similar.\n"
            + "3. Si no podés identificarlo, usá 'Vendedor desconocido'.\n\n"

            + "## EVALUACIÓN DE CUMPLIMIENTO POR ETAPA\n"
            + "Por cada etapa, asigná un estado:\n"
            + "- 'cumplido': el vendedor siguió la etapa correctamente.\n"
            + "- 'parcial': la etapa se cumplió incompleta o con errores menores.\n"
            + "- 'incumplido': la etapa no se ejecutó o tuvo errores graves.\n"
            + "- 'no_aplica': la etapa no corresponde a este contexto (ej: post-venta cuando "
            + "no hubo venta).\n\n"

            + "## ESTADOS DE CONVERSACIÓN\n"
            + "Para cada conversación, asigná un estado final:\n"
            + "- cerrado: hay confirmación explícita de compra.\n"
            + "- presupuestado: se entregó propuesta/precio pero sin confirmación.\n"
            + "- sin_responder: el cliente escribió y el vendedor nunca respondió.\n"
            + "- incompleto: el proceso se cortó antes de llegar a propuesta.\n"
            + "- seguimiento: necesita seguimiento activo.\n\n"

            + "## TIEMPOS DE RESPUESTA\n"
            + "Calculá el tiempo en minutos desde el primer mensaje del CLIENTE hasta la "
            + "primera respuesta del VENDEDOR. Si el cliente escribió fuera del horario "
            + "laboral configurado, marcá 'tiempo_ok' como true sin penalizar.\n\n"

            + "## CONTEXTO DE MENSAJES\n"
            + "Algunos mensajes incluyen contenido enriquecido entre corchetes:\n"
            + "- [Transcripción de audio: \"...\"] — texto de un audio.\n"
            + "- [Contenido del documento (PDF/DOCX/TXT): ...] — texto de un adjunto.\n"
            + "Analizá ese contenido con el mismo criterio que el texto plano. Si el "
            + "contenido es relevante para una etapa, citá el fragmento como evidencia.\n\n"

            + "## INSTRUCCIONES OBLIGATORIAS\n"
            + "1. Por CADA etapa listada arriba, devolvé un objeto en 'procedimientos' con "
            + "el ID interno exacto (campo 'stage_id') y el estado.\n"
            + "2. Por cada evidencia incluí: vendedor (nombre, no ID), cliente_id, "
            + "cuando (dd/MM HH:mm exacto), como (descripción), cita_textual (texto exacto).\n"
            + "3. Si la etapa fue parcial o incumplida, incluí 'esperado' (qué dictaba la "
            + "etapa) vs 'ocurrido' (qué pasó).\n"
            + "4. NO des respuestas genéricas. Sin cita textual exacta, no incluyas la evidencia.\n"
            + "5. Si la etapa no tuvo actividad relevante, marcá 'no_aplica' con justificación "
            + "'Sin evidencia suficiente en el período'.\n"
            + "6. El resumen_ejecutivo: mínimo 150 palabras, 2-3 párrafos. Mencioná "
            + "vendedores por nombre y recomendaciones accionables.\n"
            + "7. En 'conversaciones' analizá cada hilo de cliente por separado.\n"
            + "8. NO calculés el score final — el backend lo calcula con los pesos configurados.\n"
            + "9. Respondé ÚNICAMENTE con el JSON. Sin markdown, sin texto antes ni después.\n\n"

            + "## FORMATO JSON ESTRICTO\n"
            + "{\n"
            + "  \"resumen_ejecutivo\": \"2-3 párrafos con panorama, vendedores destacados/críticos y recomendaciones.\",\n"
            + "  \"procedimientos\": [\n"
            + "    {\n"
            + "      \"stage_id\": 123,\n"
            + "      \"punto\": \"Nombre de la etapa\",\n"
            + "      \"estado\": \"cumplido\" | \"parcial\" | \"incumplido\" | \"no_aplica\",\n"
            + "      \"justificacion\": \"Explicación detallada con nombres de vendedores.\",\n"
            + "      \"evidencias\": [\n"
            + "        {\n"
            + "          \"vendedor\": \"Nombre\",\n"
            + "          \"cliente_id\": 123,\n"
            + "          \"cuando\": \"dd/MM HH:mm\",\n"
            + "          \"como\": \"Descripción\",\n"
            + "          \"cita_textual\": \"Texto exacto\",\n"
            + "          \"esperado\": \"Qué se esperaba\",\n"
            + "          \"ocurrido\": \"Qué pasó realmente\"\n"
            + "        }\n"
            + "      ]\n"
            + "    }\n"
            + "  ],\n"
            + "  \"conversaciones\": [\n"
            + "    {\n"
            + "      \"cliente_id\": 123,\n"
            + "      \"vendedor\": \"Nombre\",\n"
            + "      \"estado\": \"cerrado|presupuestado|sin_responder|incompleto|seguimiento\",\n"
            + "      \"tiempo_respuesta_minutos\": null,\n"
            + "      \"tiempo_ok\": true,\n"
            + "      \"resumen\": \"Una oración máx 15 palabras.\",\n"
            + "      \"analisis\": \"2-3 oraciones con errores concretos.\",\n"
            + "      \"etapas_cumplidas\": [123, 456]\n"
            + "    }\n"
            + "  ],\n"
            + "  \"hallazgos\": [\n"
            + "    {\n"
            + "      \"tipo\": \"incumplimiento\" | \"advertencia\",\n"
            + "      \"vendedor\": \"Nombre\",\n"
            + "      \"cliente_id\": 123,\n"
            + "      \"regla_violada\": \"Nombre del incumplimiento\",\n"
            + "      \"cita_textual\": \"Texto exacto\",\n"
            + "      \"cuando\": \"dd/MM HH:mm\",\n"
            + "      \"severidad\": \"alta\" | \"media\" | \"baja\",\n"
            + "      \"confianza\": \"alta\" | \"media\" | \"baja\",\n"
            + "      \"descripcion\": \"Explicación e impacto\"\n"
            + "    }\n"
            + "  ],\n"
            + "  \"estadisticas\": {\n"
            + "    \"total_conversaciones\": 0,\n"
            + "    \"cerradas\": 0,\n"
            + "    \"presupuestadas\": 0,\n"
            + "    \"sin_responder\": 0,\n"
            + "    \"incompletas\": 0,\n"
            + "    \"tiempo_respuesta_promedio_minutos\": null\n"
            + "  }\n"
            + "}";
    }
}
