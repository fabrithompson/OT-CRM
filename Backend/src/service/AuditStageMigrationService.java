package service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import model.AgentConfig;
import model.AuditStage;
import repository.AgentConfigRepository;
import repository.AuditStageRepository;

@Service
public class AuditStageMigrationService {

    private static final Logger log = LoggerFactory.getLogger(AuditStageMigrationService.class);

    private final AgentConfigRepository agentConfigRepository;
    private final AuditStageRepository auditStageRepository;
    private final ChatClient chatClient;
    private final ObjectMapper objectMapper;

    public AuditStageMigrationService(AgentConfigRepository agentConfigRepository,
                                       AuditStageRepository auditStageRepository,
                                       ChatClient chatClient,
                                       ObjectMapper objectMapper) {
        this.agentConfigRepository = agentConfigRepository;
        this.auditStageRepository = auditStageRepository;
        this.chatClient = chatClient;
        this.objectMapper = objectMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Async
    public void migrarTodosAlArrancar() {
        log.info("[AuditStageMigration] Iniciando migración automática de etapas...");
        List<AgentConfig> configs = agentConfigRepository.findAll();
        int migradas = 0, saltadas = 0, fallidas = 0;

        for (AgentConfig config : configs) {
            try {
                if (auditStageRepository.countByAgentConfigId(config.getId()) > 0) {
                    saltadas++;
                    continue;
                }
                String texto = config.getAuditProcedures();
                if (texto == null || texto.isBlank()) {
                    saltadas++;
                    continue;
                }
                if (migrarAgentConfig(config)) migradas++;
                else fallidas++;
            } catch (Exception e) {
                log.error("[AuditStageMigration] Error migrando config {}: {}",
                        config.getId(), e.getMessage());
                fallidas++;
            }
        }

        log.info("[AuditStageMigration] Resumen: migradas={}, saltadas={}, fallidas={}",
                migradas, saltadas, fallidas);
    }

    @Transactional
    public boolean migrarAgentConfig(AgentConfig config) {
        String texto = config.getAuditProcedures();
        if (texto == null || texto.isBlank()) return false;

        String systemPrompt =
            "Sos un analista que extrae etapas de un proceso de ventas a partir de un texto " +
            "libre escrito por un dueño de negocio.\n\n" +
            "Tu tarea es identificar cada etapa o regla del proceso de ventas y devolverla en " +
            "formato estructurado.\n\n" +
            "REGLAS:\n" +
            "1. Identificá cada etapa como un item separado.\n" +
            "2. El nombre de cada etapa debe ser corto (máx 60 caracteres) y descriptivo.\n" +
            "3. La descripción debe explicar qué hay que evaluar en esa etapa (qué debe hacer " +
            "el vendedor, qué frases usar, qué información dar).\n" +
            "4. Asigná un peso (1-100) según la importancia relativa. Etapas críticas (saludo " +
            "inicial, envío de presupuesto, cierre) llevan más peso. Etapas opcionales o de " +
            "seguimiento llevan menos.\n" +
            "5. Si el texto no tiene etapas claras, inferí etapas razonables del proceso " +
            "descripto.\n" +
            "6. Devolvé entre 3 y 12 etapas como máximo.\n\n" +
            "FORMATO JSON ESTRICTO (sin markdown, sin texto antes ni después):\n" +
            "{\n" +
            "  \"stages\": [\n" +
            "    { \"nombre\": \"Nombre corto\", \"descripcion\": \"Qué evaluar y qué se espera\", \"peso\": 15 },\n" +
            "    ...\n" +
            "  ]\n" +
            "}";

        String rawResponse;
        try {
            rawResponse = chatClient.prompt()
                    .options(OpenAiChatOptions.builder()
                            .model("gpt-4o")
                            .temperature(0.2)
                            .build())
                    .system(systemPrompt)
                    .user("Texto a parsear:\n\n" + texto)
                    .call()
                    .content();
            if (rawResponse == null) return false;
        } catch (Exception e) {
            log.error("[AuditStageMigration] Llamada IA falló para config {}: {}",
                    config.getId(), e.getMessage());
            return false;
        }

        try {
            String cleaned = rawResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\s*", "")
                                 .replaceAll("```\\s*$", "").trim();
            }
            JsonNode root = objectMapper.readTree(cleaned);
            JsonNode stagesNode = root.has("stages") ? root.get("stages") : root;
            if (!stagesNode.isArray()) return false;

            int orden = 0;
            for (JsonNode s : stagesNode) {
                String nombre = s.has("nombre") ? s.get("nombre").asText("").trim() : "";
                if (nombre.isBlank()) continue;
                if (nombre.length() > 120) nombre = nombre.substring(0, 120);

                AuditStage stage = new AuditStage();
                stage.setAgentConfig(config);
                stage.setNombre(nombre);
                stage.setDescripcion(s.has("descripcion") ? s.get("descripcion").asText("") : "");
                int peso = s.has("peso") ? s.get("peso").asInt(10) : 10;
                stage.setPeso(Math.max(1, Math.min(100, peso)));
                stage.setOrden(orden++);
                stage.setActiva(true);
                auditStageRepository.save(stage);
            }
            log.info("[AuditStageMigration] Migradas {} etapas para config {}",
                    orden, config.getId());
            return orden > 0;
        } catch (Exception e) {
            log.error("[AuditStageMigration] Parseo falló para config {}: {}",
                    config.getId(), e.getMessage());
            return false;
        }
    }
}
