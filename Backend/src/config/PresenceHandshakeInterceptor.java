package config;

import java.security.Principal;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;

@SuppressWarnings("unused")
@Component
public class PresenceHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(PresenceHandshakeInterceptor.class);
    private static final String ATTR_USERNAME = "username";
    private static final String ATTR_AGENCIA_ID = "agenciaId";

    @Autowired
    private security.JwtUtil jwtUtil;

    @Autowired
    private service.CustomUserDetailsService userDetailsService;

    @Override
    public boolean beforeHandshake(
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response,
            @NonNull WebSocketHandler wsHandler,
            @NonNull Map<String, Object> attributes) throws Exception {

        Principal principal = request.getPrincipal();

        String resolvedUsername = null;

        if (principal != null && !"anonymousUser".equals(principal.getName())) {
            resolvedUsername = principal.getName();
            log.debug("WS Handshake: usuario via SecurityContext: {}", resolvedUsername);
        } else {
            // El JWT no llegó via SecurityContext (típico en WS con SockJS).
            // Leerlo del query param "token" que el frontend incluye en la URL.
            if (request instanceof ServletServerHttpRequest servletRequest) {
                String token = servletRequest.getServletRequest().getParameter("token");
                if (token != null && !token.isEmpty()) {
                    try {
                        String username = jwtUtil.extractUsername(token);
                        if (username != null) {
                            org.springframework.security.core.userdetails.UserDetails userDetails =
                                    userDetailsService.loadUserByUsername(username);
                            if (jwtUtil.validateToken(token, userDetails)) {
                                resolvedUsername = username;
                                log.debug("WS Handshake: usuario via token query param: {}", resolvedUsername);
                            }
                        }
                    } catch (Exception e) {
                        log.warn("WS Handshake: token inválido en query param: {}", e.getMessage());
                    }
                }
            }
        }

        if (resolvedUsername != null) {
            attributes.put("username", resolvedUsername);
            log.info("DEBUG PRESENCIA: Usuario identificado correctamente: {}", resolvedUsername);
        } else {
            log.error("**********************************************************");
            log.error("ERROR CRÍTICO: El usuario llega como NULL al Handshake.");
            log.error("Verificá que quitaste el .permitAll() de /ws-crm/**");
            log.error("**********************************************************");
        }

        if (request instanceof ServletServerHttpRequest servletRequest) {
            HttpServletRequest httpReq = servletRequest.getServletRequest();

            var session = httpReq.getSession(false);
            if (session != null && session.getAttribute("agenciaId") != null) {
                attributes.put("agenciaId", session.getAttribute("agenciaId"));
                log.debug("🟢 DEBUG: agenciaId recuperado de HttpSession: {}", session.getAttribute("agenciaId"));
            }

            String agenciaIdParam = httpReq.getParameter("agenciaId");
            if (agenciaIdParam != null) {
                try {
                    attributes.put("agenciaId", Long.valueOf(agenciaIdParam));
                } catch (NumberFormatException e) {
                    log.warn("Formato de agenciaId inválido: {}", agenciaIdParam);
                }
            }
        }

        return true;
    }

    @SuppressWarnings("null")
    @Override
    public void afterHandshake(@NonNull ServerHttpRequest request, @NonNull ServerHttpResponse response,
                               @NonNull WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("Error durante el handshake WebSocket", exception);
        }
    }

    private Long resolveAgenciaId(ServerHttpRequest request) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return null;
        }

        HttpServletRequest httpReq = servletRequest.getServletRequest();

        HttpSession session = httpReq.getSession(false);
        if (session != null) {
            Object sessionAgenciaId = session.getAttribute(ATTR_AGENCIA_ID);
            if (sessionAgenciaId != null) {
                return safeParseLong(sessionAgenciaId);
            }
        }

        String paramId = httpReq.getParameter(ATTR_AGENCIA_ID);
        if (paramId != null) {
            return safeParseLong(paramId);
        }

        String headerId = httpReq.getHeader(ATTR_AGENCIA_ID);
        if (headerId != null) {
            return safeParseLong(headerId);
        }

        return null;
    }


    private Long safeParseLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Long l) {
            return l;
        }
        if (value instanceof Integer i) {
            return i.longValue();
        }

        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            log.warn("Formato de agenciaId inválido: {}", value);
            return null;
        }
    }
}