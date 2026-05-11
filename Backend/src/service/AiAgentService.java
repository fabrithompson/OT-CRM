package service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.AgentConfig;
import model.AiConversationState;
import model.AiConversationState.AiStatus;
import model.Cliente;
import model.Etapa;
import model.Etiqueta;
import model.Plan;
import model.RespuestaRapida;
import repository.AgentConfigRepository;
import repository.AiConversationStateRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;
import repository.RespuestaRapidaRepository;

@Service
public class AiAgentService {

    private static final Logger log = LoggerFactory.getLogger(AiAgentService.class);
    private static final String TRANSFER_SIGNAL = "[TRANSFER_TO_HUMAN]";
    private static final int REENGAGEMENT_HOURS = 24;

    private final ChatClient chatClient;
    private final AgentConfigRepository agentConfigRepository;
    private final AiConversationStateRepository aiStateRepository;
    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final EtiquetaRepository etiquetaRepository;
    private final RespuestaRapidaRepository respuestaRapidaRepository;
    private final WhatsAppService whatsAppService;
    private final TelegramBridgeService telegramBridgeService;
    private final SubscriptionValidationService subscriptionValidationService;

    public AiAgentService(ChatClient chatClient,
                          AgentConfigRepository agentConfigRepository,
                          AiConversationStateRepository aiStateRepository,
                          ClienteRepository clienteRepository,
                          EtapaRepository etapaRepository,
                          EtiquetaRepository etiquetaRepository,
                          RespuestaRapidaRepository respuestaRapidaRepository,
                          @Lazy WhatsAppService whatsAppService,
                          TelegramBridgeService telegramBridgeService,
                          SubscriptionValidationService subscriptionValidationService) {
        this.chatClient = chatClient;
        this.agentConfigRepository = agentConfigRepository;
        this.aiStateRepository = aiStateRepository;
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.etiquetaRepository = etiquetaRepository;
        this.respuestaRapidaRepository = respuestaRapidaRepository;
        this.whatsAppService = whatsAppService;
        this.telegramBridgeService = telegramBridgeService;
        this.subscriptionValidationService = subscriptionValidationService;
    }

    /**
     * Returns true if the AI is still handling the conversation, false if transferred to human.
     */
    @Transactional
    @SuppressWarnings("null")
    public boolean processCustomerMessage(Long clienteId, String incomingMessage) {
        if (clienteId == null || incomingMessage == null) return false;
        Cliente cliente = clienteRepository.findById(clienteId).orElse(null);
        if (cliente == null || cliente.getAgencia() == null) return false;

        Plan plan = subscriptionValidationService.getPlanEfectivoAgencia(cliente.getAgencia());
        if (!"ENTERPRISE".equals(plan.getNombre())) {
            log.debug("AI agent skipped for cliente {} — plan is {}", clienteId, plan.getNombre());
            return false;
        }

        Long agenciaId = cliente.getAgencia().getId();
        AgentConfig config = agentConfigRepository.findByAgenciaId(agenciaId).orElse(null);
        if (config == null || !config.isEnabled()) {
            log.debug("AI agent skipped for cliente {} — config null or disabled", clienteId);
            return false;
        }

        AiConversationState state = aiStateRepository.findByClienteId(clienteId)
                .orElseGet(() -> {
                    AiConversationState s = new AiConversationState(cliente);
                    return aiStateRepository.save(s);
                });

        // Re-engage HUMAN_REQUIRED clients after 24 h if they contact again
        if (state.getStatus() == AiStatus.HUMAN_REQUIRED) {
            boolean expired = state.getUpdatedAt() != null
                    && state.getUpdatedAt().isBefore(LocalDateTime.now().minusHours(REENGAGEMENT_HOURS));
            if (expired) {
                state.setStatus(AiStatus.AI_HANDLING);
                aiStateRepository.save(state);
                log.info("Re-engaging cliente {} after {}h", clienteId, REENGAGEMENT_HOURS);
            } else {
                return false;
            }
        }

        List<Etapa> etapas = etapaRepository.findByAgenciaIdOrderByOrdenAsc(agenciaId);
        List<Etiqueta> etiquetas = etiquetaRepository.findByAgenciaId(agenciaId);
        List<RespuestaRapida> respuestasRapidas = respuestaRapidaRepository.findByAgenciaId(agenciaId);

        String systemPrompt = buildSystemPrompt(config, cliente, etapas, etiquetas, respuestasRapidas);

        CustomerAgentTools tools = new CustomerAgentTools(
                clienteId, agenciaId, clienteRepository, etapaRepository, etiquetaRepository);

        String aiReply;
        try {
            aiReply = chatClient.prompt()
                    .system(systemPrompt)
                    .user(incomingMessage)
                    .tools(tools)
                    .call()
                    .content();
        } catch (Exception e) {
            log.error("Spring AI call failed for cliente {}: {}", clienteId, e.getMessage());
            return false;
        }

        if (aiReply == null || aiReply.isBlank()) return false;

        if (aiReply.contains(TRANSFER_SIGNAL)) {
            state.setStatus(AiStatus.HUMAN_REQUIRED);
            if (config.getHumanSector() != null) state.setSectorId(config.getHumanSector().getId());
            aiStateRepository.save(state);
            String cleanReply = aiReply.replace(TRANSFER_SIGNAL, "").strip();
            if (!cleanReply.isEmpty()) sendReply(cliente, cleanReply);
            log.info("Cliente {} transferred to human via TRANSFER_SIGNAL", clienteId);
            return false;
        }

        // If the agent moved the client to the configured human sector via tool, also transfer state
        if (config.getHumanSector() != null) {
            Cliente refreshed = clienteRepository.findById(clienteId).orElse(cliente);
            if (refreshed.getEtapa() != null
                    && refreshed.getEtapa().getId().equals(config.getHumanSector().getId())) {
                state.setStatus(AiStatus.HUMAN_REQUIRED);
                state.setSectorId(config.getHumanSector().getId());
                aiStateRepository.save(state);
                sendReply(cliente, aiReply);
                log.info("Cliente {} transferred to human via stage tool call", clienteId);
                return false;
            }
        }

        sendReply(cliente, aiReply);
        return true;
    }

    private void sendReply(Cliente cliente, String text) {
        try {
            if ("TELEGRAM".equalsIgnoreCase(cliente.getOrigen())) {
                telegramBridgeService.enviarMensajeDesdeCrm(cliente, text, "AI");
            } else {
                whatsAppService.enviarTextoDesdeCrm(cliente, text, "AI");
            }
        } catch (Exception e) {
            log.error("Failed to send AI reply to cliente {}: {}", cliente.getId(), e.getMessage());
        }
    }

    private String buildSystemPrompt(AgentConfig config, Cliente cliente,
                                      List<Etapa> etapas, List<Etiqueta> etiquetas,
                                      List<RespuestaRapida> respuestasRapidas) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sos un agente de atención al cliente de esta empresa.\n\n");

        if (config.getInstructions() != null && !config.getInstructions().isBlank()) {
            sb.append("## Instrucciones\n").append(config.getInstructions()).append("\n\n");
        }

        if (config.getBusinessContext() != null && !config.getBusinessContext().isBlank()) {
            sb.append("## Contexto del negocio\n").append(config.getBusinessContext()).append("\n\n");
        }

        sb.append("## Cliente actual\n");
        sb.append("- Nombre: ").append(cliente.getNombre() != null ? cliente.getNombre() : "Sin nombre").append("\n");
        sb.append("- Teléfono: ").append(cliente.getTelefono() != null ? cliente.getTelefono() : "-").append("\n");
        sb.append("- Etapa actual: ").append(cliente.getEtapa() != null ? cliente.getEtapa().getNombre() : "Sin etapa").append("\n");
        if (cliente.getEtiquetas() != null && !cliente.getEtiquetas().isEmpty()) {
            String etiquetasStr = cliente.getEtiquetas().stream()
                    .map(Etiqueta::getNombre).collect(Collectors.joining(", "));
            sb.append("- Etiquetas actuales: ").append(etiquetasStr).append("\n");
        }
        sb.append("\n");

        if (!etapas.isEmpty()) {
            sb.append("## Etapas del embudo disponibles\n");
            etapas.forEach(e -> sb.append("- ").append(e.getNombre()).append("\n"));
            sb.append("\n");
        }

        if (!etiquetas.isEmpty()) {
            sb.append("## Etiquetas disponibles\n");
            etiquetas.forEach(e -> sb.append("- ").append(e.getNombre()).append("\n"));
            sb.append("\n");
        }

        if (!respuestasRapidas.isEmpty()) {
            sb.append("## Información del negocio (referencia)\n");
            respuestasRapidas.forEach(r -> sb.append("- ")
                    .append(r.getAtajo()).append(": ").append(r.getRespuesta()).append("\n"));
            sb.append("\n");
        }

        sb.append("## Herramientas disponibles\n");
        sb.append("Podés usar estas herramientas directamente durante la conversación:\n");
        sb.append("- moverClienteEtapa(nombreEtapa): mueve al cliente a una etapa del embudo\n");
        sb.append("- agregarEtiquetaCliente(nombreEtiqueta): agrega una etiqueta al cliente\n");
        sb.append("- quitarEtiquetaCliente(nombreEtiqueta): quita una etiqueta del cliente\n\n");

        sb.append("## Reglas de comportamiento\n");
        sb.append("1. Respondé siempre en el idioma que usa el cliente.\n");
        sb.append("2. No menciones que sos una IA salvo que el cliente lo pregunte.\n");
        sb.append("3. Usá las etiquetas para clasificar al cliente según su consulta, interés o comportamiento. Aplicalas de forma proactiva.\n");
        sb.append("4. Cuando debas derivar al cliente a un operador humano:\n");
        sb.append("   a) Primero usá moverClienteEtapa para moverlo a la etapa correspondiente");
        if (config.getHumanSector() != null) {
            sb.append(" ('").append(config.getHumanSector().getNombre()).append("')");
        }
        sb.append(".\n");
        sb.append("   b) Luego respondé al cliente avisándole que pronto será atendido por un operador.\n");
        sb.append("   c) Incluí la señal ").append(TRANSFER_SIGNAL).append(" al comienzo de tu respuesta para confirmar la derivación.\n");
        sb.append("5. NUNCA incluyas ").append(TRANSFER_SIGNAL).append(" si no estás derivando al cliente a un humano.\n");

        return sb.toString();
    }
}
