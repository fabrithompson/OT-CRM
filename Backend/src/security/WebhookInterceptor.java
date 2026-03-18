package security;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class WebhookInterceptor implements HandlerInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(WebhookInterceptor.class);

    @Value("${bot.secret.key}")
    private String botSecretKey;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull Object handler) throws Exception {
        String authHeader = request.getHeader("X-Bot-Token");

        if (authHeader == null || !authHeader.equals(botSecretKey)) {
            logger.warn("Intento de acceso no autorizado al webhook desde la IP: {}", request.getRemoteAddr());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\": \"Unauthorized: Invalid or missing Bot Token\"}");
            return false;
        }

        return true;
    }
}