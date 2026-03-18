package controller;

import java.security.Principal;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import listener.WebSocketPresenceEventListener;
import model.Usuario;
import repository.UsuarioRepository;

@RestController
public class PresenceController {

    private static final Logger log = LoggerFactory.getLogger(PresenceController.class);

    private final WebSocketPresenceEventListener presenceListener;
    private final UsuarioRepository usuarioRepository;

    public PresenceController(WebSocketPresenceEventListener presenceListener, UsuarioRepository usuarioRepository) {
        this.presenceListener = presenceListener;
        this.usuarioRepository = usuarioRepository;
    }

    @MessageMapping("/presence")
    public void handlePresence(@Payload Map<String, Object> payload, Principal principal) {
        if (principal != null) {
            String username = principal.getName();

            if (payload.containsKey("agenciaId")) {
                try {
                    Long id = Long.valueOf(payload.get("agenciaId").toString());
                    presenceListener.forceUserAgencia(username, id);
                } catch (NumberFormatException e) {
                    log.warn("ID de agencia inválido en heartbeat de {}", username);
                }
            }

            presenceListener.updateActivity(username);
            log.debug("💓 Heartbeat recibido de: {}", username);
        }
    }

    @GetMapping("/api/presence/active")
    public Set<String> getConnectedUsers(Principal principal) {
        if (principal == null) {
            return Collections.emptySet();
        }

        return usuarioRepository.findByUsername(principal.getName())
                .map(Usuario::getAgencia)
                .filter(Objects::nonNull)
                .map(agencia -> presenceListener.getOnlineUsers(agencia.getId()))
                .orElse(Collections.emptySet());
    }
}