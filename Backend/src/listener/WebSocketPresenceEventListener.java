package listener;

import java.security.Principal;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

@Component
public class WebSocketPresenceEventListener {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketPresenceEventListener.class);
    private static final long INACTIVITY_THRESHOLD_MS = 60_000;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<Long, Set<String>> onlineUsersByAgencia = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastActivity = new ConcurrentHashMap<>();
    private final Map<String, Long> userToAgencia = new ConcurrentHashMap<>();

    // Contador de sesiones activas por usuario — solo marcar offline cuando llega a 0
    private final Map<String, AtomicInteger> sessionCount = new ConcurrentHashMap<>();
    // Mapeo sessionId → username para saber quién se desconectó
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    public WebSocketPresenceEventListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal user = headerAccessor.getUser();
        String sessionId = headerAccessor.getSessionId();

        if (user != null) {
            String username = user.getName();
            Long agenciaId = extractAgenciaId(headerAccessor);

            if (sessionId != null) {
                sessionToUser.put(sessionId, username);
                sessionCount.computeIfAbsent(username, k -> new AtomicInteger(0)).incrementAndGet();
            }

            if (agenciaId != null) {
                userToAgencia.put(username, agenciaId);
                lastActivity.put(username, Instant.now());
                logger.info("Conexión establecida: {} (Agencia: {}, sesiones: {})",
                        username, agenciaId, sessionCount.getOrDefault(username, new AtomicInteger(0)).get());
            }
        }
    }

    @SuppressWarnings("null")
    @EventListener
    public void handleSessionSubscribeEvent(SessionSubscribeEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = headerAccessor.getDestination();
        Principal user = headerAccessor.getUser();

        if (user != null && destination != null && destination.startsWith("/topic/presence/")) {
            try {
                String[] parts = destination.split("/");
                Long agenciaId = Long.valueOf(parts[parts.length - 1]);
                String username = user.getName();
                onlineUsersByAgencia.computeIfAbsent(agenciaId, k -> ConcurrentHashMap.newKeySet()).add(username);
                userToAgencia.put(username, agenciaId);
                updateActivity(username);

                logger.debug("Suscripción activa: {} en agencia {}", username, agenciaId);

                messagingTemplate.convertAndSendToUser(username, "/queue/presence-snapshot", onlineUsersByAgencia.get(agenciaId));
                broadcastOnlineUsers(agenciaId);

            } catch (NumberFormatException | MessagingException e) {
                logger.warn("Error en suscripción: {}", e.getMessage());
            }
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        Principal user = headerAccessor.getUser();

        String username = null;
        if (user != null) {
            username = user.getName();
        } else if (sessionId != null) {
            username = sessionToUser.get(sessionId);
        }

        if (username == null) return;

        // Limpiar el mapeo de sesión
        if (sessionId != null) {
            sessionToUser.remove(sessionId);
        }

        // Decrementar contador de sesiones
        AtomicInteger count = sessionCount.get(username);
        int remaining = (count != null) ? count.decrementAndGet() : 0;

        logger.debug("Sesión cerrada: {} (sesiones restantes: {})", username, remaining);

        // Solo marcar offline si no quedan sesiones activas
        if (remaining <= 0) {
            sessionCount.remove(username);
            Long agenciaId = userToAgencia.remove(username);

            if (agenciaId != null) {
                Set<String> users = onlineUsersByAgencia.get(agenciaId);
                if (users != null) {
                    users.remove(username);
                }
                lastActivity.remove(username);

                logger.info("Usuario Desconectado: {} (Agencia: {})", username, agenciaId);
                broadcastOnlineUsers(agenciaId);
            }
        }
    }

    @Scheduled(fixedRate = 5000)
    public void cleanupInactiveUsers() {
        Instant now = Instant.now();

        lastActivity.entrySet().removeIf(entry -> {
            String username = entry.getKey();
            Instant lastSeen = entry.getValue();

            if (now.toEpochMilli() - lastSeen.toEpochMilli() > INACTIVITY_THRESHOLD_MS) {
                Long agenciaId = userToAgencia.remove(username);
                sessionCount.remove(username);

                if (agenciaId != null) {
                    Set<String> users = onlineUsersByAgencia.get(agenciaId);
                    if (users != null && users.remove(username)) {
                        logger.info("Usuario offline por inactividad: {}", username);
                        broadcastOnlineUsers(agenciaId);
                    }
                }
                return true;
            }
            return false;
        });
    }

    public void updateActivity(String username) {
        if (username != null) {
            lastActivity.put(username, Instant.now());

            Long agenciaId = userToAgencia.get(username);
            if (agenciaId != null) {
                Set<String> users = onlineUsersByAgencia.computeIfAbsent(agenciaId, k -> ConcurrentHashMap.newKeySet());
                if (!users.contains(username)) {
                    users.add(username);
                    broadcastOnlineUsers(agenciaId);
                }
            }
        }
    }

    @SuppressWarnings("null")
    private void broadcastOnlineUsers(Long agenciaId) {
        Set<String> onlineUsers = onlineUsersByAgencia.getOrDefault(agenciaId, ConcurrentHashMap.newKeySet());
        String topic = "/topic/presence/" + agenciaId;
        messagingTemplate.convertAndSend(topic, onlineUsers);
    }

    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    private Long extractAgenciaId(StompHeaderAccessor accessor) {
        Map<String, Object> attrs = accessor.getSessionAttributes();

        if (attrs != null && attrs.containsKey("agenciaId")) {
            Object idObj = attrs.get("agenciaId");
            if (idObj instanceof Long aLong) {
                return aLong;
            }
            if (idObj instanceof String string) {
                return Long.parseLong(string);
            }
        }

        String agenciaIdStr = accessor.getFirstNativeHeader("agenciaId");
        if (agenciaIdStr != null) {
            try {
                return Long.parseLong(agenciaIdStr);
            } catch (NumberFormatException e) {
            }
        }

        return null;
    }

    public Set<String> getOnlineUsers(Long agenciaId) {
        return onlineUsersByAgencia.getOrDefault(agenciaId, ConcurrentHashMap.newKeySet());
    }

    public void forceUserAgencia(String username, Long agenciaId) {
        if (username != null && agenciaId != null) {
            userToAgencia.put(username, agenciaId);
        }
    }
}
