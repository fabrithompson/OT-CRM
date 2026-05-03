package service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.AgentConfig;
import model.AiConversationState;
import model.AiConversationState.AiStatus;
import model.Cliente;
import repository.AgentConfigRepository;
import repository.AiConversationStateRepository;
import repository.ClienteRepository;

@Service
public class AiAgentService {

    private static final Logger log = LoggerFactory.getLogger(AiAgentService.class);
    private static final String TRANSFER_SIGNAL = "[TRANSFER_TO_HUMAN]";

    private final ChatClient chatClient;
    private final AgentConfigRepository agentConfigRepository;
    private final AiConversationStateRepository aiStateRepository;
    private final ClienteRepository clienteRepository;
    private final WhatsAppService whatsAppService;
    private final TelegramBridgeService telegramBridgeService;

    public AiAgentService(ChatClient chatClient,
                          AgentConfigRepository agentConfigRepository,
                          AiConversationStateRepository aiStateRepository,
                          ClienteRepository clienteRepository,
                          WhatsAppService whatsAppService,
                          TelegramBridgeService telegramBridgeService) {
        this.chatClient = chatClient;
        this.agentConfigRepository = agentConfigRepository;
        this.aiStateRepository = aiStateRepository;
        this.clienteRepository = clienteRepository;
        this.whatsAppService = whatsAppService;
        this.telegramBridgeService = telegramBridgeService;
    }

    /**
     * Returns true if the AI is still handling the conversation, false if it transferred to human.
     */
    @Transactional
    @SuppressWarnings("null")
    public boolean processCustomerMessage(Long clienteId, String incomingMessage) {
        if (clienteId == null || incomingMessage == null) return false;
        Cliente cliente = clienteRepository.findById(clienteId).orElse(null);
        if (cliente == null || cliente.getAgencia() == null) return false;

        Long agenciaId = cliente.getAgencia().getId();
        AgentConfig config = agentConfigRepository.findByAgenciaId(agenciaId).orElse(null);

        if (config == null || !config.isEnabled()) return false;

        AiConversationState state = aiStateRepository.findByClienteId(clienteId)
                .orElseGet(() -> {
                    AiConversationState s = new AiConversationState(cliente);
                    return aiStateRepository.save(s);
                });

        if (state.getStatus() == AiStatus.HUMAN_REQUIRED) return false;

        String systemPrompt = buildSystemPrompt(config, cliente);
        String aiReply;
        try {
            aiReply = chatClient.prompt()
                    .system(String.valueOf(systemPrompt))
                    .user(String.valueOf(incomingMessage))
                    .call()
                    .content();
        } catch (Exception e) {
            log.error("Spring AI call failed for cliente {}: {}", clienteId, e.getMessage());
            return false;
        }

        if (aiReply == null || aiReply.isBlank()) return false;

        if (aiReply.contains(TRANSFER_SIGNAL)) {
            transferToHuman(state, config, cliente);
            String cleanReply = aiReply.replace(TRANSFER_SIGNAL, "").strip();
            if (!cleanReply.isEmpty()) sendReply(cliente, cleanReply);
            return false;
        }

        sendReply(cliente, aiReply);
        return true;
    }

    private void transferToHuman(AiConversationState state, AgentConfig config, Cliente cliente) {
        state.setStatus(AiStatus.HUMAN_REQUIRED);
        if (config.getHumanSector() != null) {
            state.setSectorId(config.getHumanSector().getId());
            cliente.setEtapa(config.getHumanSector());
            clienteRepository.save(cliente);
        }
        aiStateRepository.save(state);
        log.info("Conversation {} transferred to human (sector {})",
                cliente.getId(), state.getSectorId());
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

    private String buildSystemPrompt(AgentConfig config, Cliente cliente) {
        StringBuilder sb = new StringBuilder();
        sb.append("Eres un agente de atención al cliente. ");

        if (config.getInstructions() != null && !config.getInstructions().isBlank()) {
            sb.append(config.getInstructions()).append(" ");
        }

        if (config.getBusinessContext() != null && !config.getBusinessContext().isBlank()) {
            sb.append("\n\nContexto del negocio:\n").append(config.getBusinessContext());
        }

        sb.append("\n\nDatos del cliente: nombre='").append(cliente.getNombre())
          .append("', teléfono='").append(cliente.getTelefono()).append("'.");

        sb.append("\n\nSi la consulta requiere atención humana o no puedes resolverla, ")
          .append("responde con ").append(TRANSFER_SIGNAL)
          .append(" al inicio de tu mensaje (puedes incluir un mensaje de despedida después).");

        return sb.toString();
    }
}
