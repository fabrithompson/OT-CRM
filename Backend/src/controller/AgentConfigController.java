package controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import model.AgentConfig;
import model.Agencia;
import model.RespuestaRapida;
import model.Usuario;
import repository.AgentConfigRepository;
import repository.RespuestaRapidaRepository;
import repository.UsuarioRepository;

@RestController
@RequestMapping("/api/v1/agent-config")
public class AgentConfigController {

    private static final String SETUP_SYSTEM_PROMPT =
        "Sos un asistente de configuración para un CRM de ventas. " +
        "Tu objetivo es ayudar al usuario a configurar su agente de IA haciendo preguntas sobre su negocio. " +
        "Preguntá sobre: rubro o industria, productos o servicios que ofrece, tono de comunicación preferido, " +
        "preguntas frecuentes de sus clientes, y en qué casos quiere derivar la conversación a un humano. " +
        "Sé conciso y amigable. Hacé una pregunta a la vez. " +
        "Cuando creas que tenés suficiente información, ofrecé un resumen claro de las instrucciones " +
        "que el agente debería seguir para responder a los clientes.";

    private final ChatModel chatModel;
    private final AgentConfigRepository agentConfigRepository;
    private final UsuarioRepository usuarioRepository;
    private final RespuestaRapidaRepository respuestaRapidaRepository;

    public AgentConfigController(ChatModel chatModel,
                                  AgentConfigRepository agentConfigRepository,
                                  UsuarioRepository usuarioRepository,
                                  RespuestaRapidaRepository respuestaRapidaRepository) {
        this.chatModel = chatModel;
        this.agentConfigRepository = agentConfigRepository;
        this.usuarioRepository = usuarioRepository;
        this.respuestaRapidaRepository = respuestaRapidaRepository;
    }

    record ChatMessage(String role, String content) {}
    record ChatRequest(List<ChatMessage> messages) {}
    record AgentConfigRequest(String instructions, String businessContext, boolean enabled) {}

    @Transactional(readOnly = true)
    @GetMapping
    public ResponseEntity<?> getConfig(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) return ResponseEntity.ok(defaultConfig());
        AgentConfig config = agentConfigRepository.findByAgenciaId(usuario.getAgencia().getId()).orElse(null);
        if (config == null) return ResponseEntity.ok(defaultConfig());
        return ResponseEntity.ok(toMap(config));
    }

    @Transactional
    @PutMapping
    public ResponseEntity<?> saveConfig(@AuthenticationPrincipal UserDetails userDetails,
                                        @RequestBody AgentConfigRequest req) {
        Usuario usuario = getUsuario(userDetails);
        if (usuario.getAgencia() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Sin agencia"));
        }
        Agencia agencia = usuario.getAgencia();
        AgentConfig config = agentConfigRepository.findByAgenciaId(agencia.getId())
                .orElseGet(() -> {
                    AgentConfig c = new AgentConfig();
                    c.setAgencia(agencia);
                    return c;
                });
        config.setInstructions(req.instructions());
        config.setBusinessContext(req.businessContext());
        config.setEnabled(req.enabled());
        agentConfigRepository.save(config);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @Transactional(readOnly = true)
    @PostMapping("/chat")
    public ResponseEntity<?> chat(@AuthenticationPrincipal UserDetails userDetails,
                                   @RequestBody ChatRequest req) {
        if (req.messages() == null || req.messages().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No messages"));
        }

        String systemPrompt = buildChatSystemPrompt(userDetails);

        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(systemPrompt));
        for (ChatMessage m : req.messages()) {
            if ("user".equals(m.role())) {
                messages.add(new UserMessage(m.content()));
            } else if ("assistant".equals(m.role())) {
                messages.add(new AssistantMessage(m.content()));
            }
        }

        try {
            String reply = chatModel.call(new Prompt(messages))
                    .getResult().getOutput().getText();
            return ResponseEntity.ok(Map.of("reply", reply != null ? reply : ""));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    private String buildChatSystemPrompt(UserDetails userDetails) {
        StringBuilder sb = new StringBuilder(SETUP_SYSTEM_PROMPT);
        try {
            Usuario usuario = getUsuario(userDetails);
            if (usuario.getAgencia() != null) {
                List<RespuestaRapida> respuestas = respuestaRapidaRepository.findByAgencia(usuario.getAgencia());
                if (!respuestas.isEmpty()) {
                    sb.append("\n\nRespuestas rápidas ya configuradas en el CRM de este negocio " +
                              "(podés referenciarlas o sugerir mejoras):\n");
                    for (RespuestaRapida r : respuestas) {
                        sb.append("- /").append(r.getAtajo())
                          .append(" → \"").append(r.getRespuesta()).append("\"\n");
                    }
                }
            }
        } catch (Exception ignored) {}
        return sb.toString();
    }

    private Map<String, Object> defaultConfig() {
        Map<String, Object> m = new HashMap<>();
        m.put("instructions", "");
        m.put("businessContext", "");
        m.put("enabled", false);
        return m;
    }

    private Map<String, Object> toMap(AgentConfig c) {
        Map<String, Object> m = new HashMap<>();
        m.put("instructions", c.getInstructions() != null ? c.getInstructions() : "");
        m.put("businessContext", c.getBusinessContext() != null ? c.getBusinessContext() : "");
        m.put("enabled", c.isEnabled());
        return m;
    }

    private Usuario getUsuario(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
    }
}
