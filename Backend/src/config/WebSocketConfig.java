package config;

import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
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

import security.JwtUtil;
import service.CustomUserDetailsService;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // 1. Añadimos el Logger para reemplazar el System.err
    private static final Logger logger = LoggerFactory.getLogger(WebSocketConfig.class);

    private final PresenceHandshakeInterceptor presenceInterceptor;
    private final WebSocketProperties props;
    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;

    public WebSocketConfig(PresenceHandshakeInterceptor presenceInterceptor,
            WebSocketProperties props,
            JwtUtil jwtUtil,
            CustomUserDetailsService userDetailsService) {
        this.presenceInterceptor = presenceInterceptor;
        this.props = props;
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
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
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    authenticateConnection(accessor); 
                }
                return message;
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
}