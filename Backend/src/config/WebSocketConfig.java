package config;

import java.security.Principal;
import java.util.Objects;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

import repository.ClienteRepository;
import security.CrmUserDetails;
import security.JwtUtil;
import service.CustomUserDetailsService;
import service.RequestUsuarioCache;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // 1. Añadimos el Logger para reemplazar el System.err
    private static final Logger logger = LoggerFactory.getLogger(WebSocketConfig.class);

    // Destinos "/topic/{prefijo}/{agenciaId}": mismo patron de parseo que ya
    // usa WebSocketPresenceEventListener.handleSessionSubscribeEvent para
    // /topic/presence/{agenciaId}.
    private static final Set<String> TOPICS_POR_AGENCIA = Set.of("agencia", "embudo", "bot", "campania", "presence");

    private final PresenceHandshakeInterceptor presenceInterceptor;
    private final WebSocketProperties props;
    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;
    private final ClienteRepository clienteRepository;

    public WebSocketConfig(PresenceHandshakeInterceptor presenceInterceptor,
            WebSocketProperties props,
            JwtUtil jwtUtil,
            CustomUserDetailsService userDetailsService,
            ClienteRepository clienteRepository) {
        this.presenceInterceptor = presenceInterceptor;
        this.props = props;
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
        this.clienteRepository = clienteRepository;
    }

    @Bean
    @NonNull
    public TaskScheduler heartbeatTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(props.getSchedulerPoolSize());
        scheduler.setThreadNamePrefix("wss-heartbeat-");
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.initialize();
        return scheduler;
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{props.getHeartbeatIncoming(), props.getHeartbeatOutgoing()})
                .setTaskScheduler(Objects.requireNonNull(heartbeatTaskScheduler(), "TaskScheduler cannot be null"));

        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        String[] allowedOrigins = props.getAllowedOrigins();
        Objects.requireNonNull(allowedOrigins, "Allowed origins cannot be null");
        
        registry.addEndpoint(props.getEndpoint())
                .setAllowedOriginPatterns(allowedOrigins)
                .addInterceptors(presenceInterceptor)
                .withSockJS()
                .setHeartbeatTime(props.getHeartbeatOutgoing());
    }

    @Override
    public void configureWebSocketTransport(@NonNull WebSocketTransportRegistration registration) {
        registration
                .setMessageSizeLimit(props.getMessageSizeLimit())
                .setSendBufferSizeLimit(props.getBufferSizeLimit())
                .setSendTimeLimit(props.getSendTimeLimit());
    }

    @Override
    public void configureClientInboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            
            @Override
            @Nullable
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                try {
                    StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                    if (accessor == null) {
                        return message;
                    }

                    StompCommand command = accessor.getCommand();
                    if (StompCommand.CONNECT.equals(command)) {
                        authenticateConnection(accessor);
                        if (accessor.getUser() == null) {
                            // Antes: si el token faltaba o era invalido, el CONNECT
                            // igual pasaba (accessor.getUser() quedaba null pero el
                            // mensaje seguia su curso). /ws-crm/** es permitAll en
                            // SecurityConfig, asi que nada mas frenaba la conexion.
                            // Al tirar la excepcion aca, StompSubProtocolHandler
                            // manda un frame ERROR y corta la sesion (el frontend ya
                            // maneja esto en onStompError con su reconexion normal).
                            throw new MessagingException("WS CONNECT rechazado: token ausente o invalido");
                        }
                    } else if (StompCommand.SUBSCRIBE.equals(command)) {
                        authorizeSubscription(accessor);
                    }
                    return message;
                } finally {
                    // Este hilo (pool del broker STOMP) no pasa por JwtRequestFilter,
                    // que es quien normalmente limpia el cache. Se limpia aca para
                    // que un Usuario cacheado en un CONNECT no quede pisando el hilo
                    // si el pool lo reutiliza para otro mensaje.
                    RequestUsuarioCache.limpiar();
                }
            }
        });
    }

    private void authenticateConnection(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                String username = jwtUtil.extractUsername(token);
                if (username != null) {
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                    if (jwtUtil.validateToken(token, userDetails)) {
                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                        accessor.setUser(authentication);
                    }
                }
            } catch (UsernameNotFoundException e) {
                logger.error("Error de autenticación WebSocket: {}", e.getMessage());
            }
        }
    }

    /**
     * Autoriza un SUBSCRIBE por agencia. Sin esto, cualquier cliente
     * autenticado podia suscribirse al id de OTRA agencia y recibir sus
     * leads/mensajes en tiempo real (el control que existe en REST via
     * validarAccesoCliente no aplica a STOMP).
     *
     * - /topic/{agencia|embudo|bot|campania|presence}/{agenciaId}: el id del
     *   destino tiene que ser el de la agencia del usuario conectado.
     * - /topic/chat/{clienteId}[/status]: el cliente tiene que pertenecer a
     *   la agencia del usuario conectado (se resuelve con una query liviana,
     *   sin hidratar la entidad).
     * - Cualquier otro destino (/topic/global-notifications, /user/**, etc.)
     *   queda fuera de este chequeo: son intencionalmente globales o ya los
     *   scopea Spring por sesion de usuario.
     */
    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) {
            return;
        }

        String[] partes = destination.split("/");
        if (partes.length < 4 || !"topic".equals(partes[1])) {
            return;
        }

        String prefijo = partes[2];
        boolean esPorAgencia = TOPICS_POR_AGENCIA.contains(prefijo);
        boolean esChat = "chat".equals(prefijo);
        if (!esPorAgencia && !esChat) {
            return;
        }

        CrmUserDetails usuario = extraerUsuario(accessor.getUser());
        if (usuario == null || usuario.getAgenciaId() == null) {
            throw new MessagingException("Suscripción rechazada: usuario no autenticado");
        }

        Long idDestino = parseIdOrNull(partes[3]);
        boolean autorizado = esPorAgencia
                ? idDestino != null && idDestino.equals(usuario.getAgenciaId())
                : idDestino != null && clienteRepository.existsByIdAndAgenciaId(idDestino, usuario.getAgenciaId());

        if (!autorizado) {
            logger.warn("Suscripción rechazada: usuario {} (agencia {}) intento suscribirse a {}",
                    usuario.getUsername(), usuario.getAgenciaId(), destination);
            throw new MessagingException("Suscripción rechazada: destino fuera de la agencia del usuario");
        }
    }

    @Nullable
    private CrmUserDetails extraerUsuario(@Nullable Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth
                && auth.getPrincipal() instanceof CrmUserDetails userDetails) {
            return userDetails;
        }
        return null;
    }

    @Nullable
    private Long parseIdOrNull(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}