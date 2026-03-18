package security;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Rate limiting por IP para proteger endpoints críticos contra brute force y abuso.
 * Usa Bucket4j en memoria — suficiente para una instancia (Railway single-container).
 * Si escalás a múltiples instancias, migrar a Redis.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RateLimitFilter implements Filter {

    // Login/register: 10 requests por minuto por IP (protección contra brute force)
    private final Map<String, Bucket> authBuckets = new ConcurrentHashMap<>();

    // Webhooks: 60 requests por minuto por IP (MercadoPago/PayPal pueden hacer ráfagas)
    private final Map<String, Bucket> webhookBuckets = new ConcurrentHashMap<>();

    // API general: 120 requests por minuto por IP
    private final Map<String, Bucket> generalBuckets = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = req.getRequestURI();
        String ip = getClientIp(req);

        Bucket bucket;
        if (path.startsWith("/api/auth/") || path.startsWith("/api/v1/auth/")) {
            bucket = authBuckets.computeIfAbsent(ip, k -> createBucket(10, Duration.ofMinutes(1)));
        } else if (path.startsWith("/api/webhook/") || path.startsWith("/api/mp/webhook")
                || path.startsWith("/api/paypal/webhook") || path.startsWith("/api/telegram/")) {
            bucket = webhookBuckets.computeIfAbsent(ip, k -> createBucket(60, Duration.ofMinutes(1)));
        } else if (path.startsWith("/api/")) {
            bucket = generalBuckets.computeIfAbsent(ip, k -> createBucket(120, Duration.ofMinutes(1)));
        } else {
            // Assets estáticos, SPA — sin rate limit
            chain.doFilter(request, response);
            return;
        }

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            res.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Demasiadas solicitudes. Intentá de nuevo en un momento.\"}");
        }
    }

    private Bucket createBucket(long tokens, Duration period) {
        Bandwidth limit = Bandwidth.builder()
                .capacity(tokens)
                .refillGreedy(tokens, period)
                .build();
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }

    private String getClientIp(HttpServletRequest request) {
        // Railway/proxies pasan la IP real en X-Forwarded-For
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
