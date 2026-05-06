package controller;

import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.model.Media;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import model.AgentConfig;
import model.Agencia;
import model.Usuario;
import repository.AgentConfigRepository;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;
import repository.RespuestaRapidaRepository;
import repository.UsuarioRepository;
import service.CrmAgentTools;

@RestController
@RequestMapping("/api/v1/agent-config")
public class AgentConfigController {

    private static final String CRM_ASSISTANT_PROMPT =
        "Sos un asistente inteligente del CRM OT. Tenés tres roles:\n\n" +

        "1. CONFIGURAR EL AGENTE DE IA: Ayudás al usuario a configurar el agente de atención al cliente " +
        "haciendo preguntas sobre su negocio (rubro, productos/servicios, tono preferido, preguntas " +
        "frecuentes de sus clientes, cuándo derivar a un humano). Cuando tenés suficiente información, " +
        "ofrecés un resumen claro de las instrucciones que el agente debería seguir.\n\n" +

        "2. APRENDER DE CONVERSACIONES: El usuario puede enviarte capturas de pantalla de chats reales " +
        "con sus clientes. Cuando recibas imágenes, analizalas en profundidad:\n" +
        "  - Identificá el estilo de escritura (formal/informal, emojis, longitud de respuestas)\n" +
        "  - Detectá el tono y vocabulario específico del negocio\n" +
        "  - Notá cómo responden ante consultas, reclamos, dudas o cierres de venta\n" +
        "  - Observá frases o expresiones recurrentes del operador\n" +
        "Con ese análisis, sugerí instrucciones concretas y detalladas para que el agente imite ese estilo. " +
        "Podés decir: 'Basándome en estas conversaciones, te sugiero configurar el agente con estas instrucciones: ...' " +
        "y ofrecer el texto listo para copiar al campo de instrucciones.\n\n" +

        "3. GESTIONAR EL CRM: Podés realizar acciones directas usando las herramientas disponibles: " +
        "mover contactos entre etapas, agregar o quitar etiquetas, ajustar saldos, " +
        "listar contactos/etapas/etiquetas, y consultar respuestas rápidas.\n\n" +

        "Reglas generales:\n" +
        "- Cuando el usuario pida realizar una acción del CRM, usá las herramientas sin pedir confirmación innecesaria.\n" +
        "- Si no tenés información sobre algo, consultá las respuestas rápidas.\n" +
        "- Confirmá las acciones con un resumen claro y conciso.\n" +
        "- Sé amigable y respondé siempre en español.";

    private final ChatClient chatClient;
    private final AgentConfigRepository agentConfigRepository;
    private final UsuarioRepository usuarioRepository;
    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final EtiquetaRepository etiquetaRepository;
    private final RespuestaRapidaRepository respuestaRapidaRepository;

    public AgentConfigController(ChatClient chatClient,
                                  AgentConfigRepository agentConfigRepository,
                                  UsuarioRepository usuarioRepository,
                                  ClienteRepository clienteRepository,
                                  EtapaRepository etapaRepository,
                                  EtiquetaRepository etiquetaRepository,
                                  RespuestaRapidaRepository respuestaRapidaRepository) {
        this.chatClient = chatClient;
        this.agentConfigRepository = agentConfigRepository;
        this.usuarioRepository = usuarioRepository;
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.etiquetaRepository = etiquetaRepository;
        this.respuestaRapidaRepository = respuestaRapidaRepository;
    }

    record ImageData(String base64, String mimeType) {}
    record ChatMessage(String role, String content, List<ImageData> images) {}
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

    @Transactional
    @PostMapping("/chat")
    public ResponseEntity<?> chat(@AuthenticationPrincipal UserDetails userDetails,
                                   @RequestBody ChatRequest req) {
        if (req.messages() == null || req.messages().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No messages"));
        }

        Usuario usuario = getUsuario(userDetails);
        Long agenciaId = usuario.getAgencia() != null ? usuario.getAgencia().getId() : null;

        List<org.springframework.ai.chat.messages.Message> historyMessages = new ArrayList<>();
        for (ChatMessage m : req.messages()) {
            String content = java.util.Objects.requireNonNullElse(m.content(), "");
            if ("user".equals(m.role())) {
                List<ImageData> images = m.images();
                if (images != null && !images.isEmpty()) {
                    List<Media> mediaList = new ArrayList<>();
                    for (ImageData img : images) {
                        try {
                            String b64 = img.base64();
                            if (b64 != null && b64.contains(",")) b64 = b64.split(",")[1];
                            byte[] bytes = Base64.getDecoder().decode(b64);
                            String mime = img.mimeType() != null ? img.mimeType() : "image/jpeg";
                            mediaList.add(new Media(
                                MimeTypeUtils.parseMimeType(mime),
                                new ByteArrayResource(bytes)
                            ));
                        } catch (Exception ignored) {}
                    }
                    historyMessages.add(new UserMessage(content, mediaList));
                } else {
                    historyMessages.add(new UserMessage(content));
                }
            } else if ("assistant".equals(m.role())) {
                historyMessages.add(new AssistantMessage(content));
            }
        }

        try {
            ChatClient.ChatClientRequestSpec spec = chatClient.prompt()
                    .system(CRM_ASSISTANT_PROMPT)
                    .messages(historyMessages);

            if (agenciaId != null) {
                CrmAgentTools tools = new CrmAgentTools(
                        agenciaId, clienteRepository, etapaRepository,
                        etiquetaRepository, respuestaRapidaRepository);
                spec = spec.tools(tools);
            }

            String reply = spec.call().content();
            return ResponseEntity.ok(Map.of("reply", reply != null ? reply : ""));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
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
