package security;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

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
 * Usa Bucket4j en memoria con Caffeine (TTL 10 min, max 10k IPs) para evitar memory leak.
 * Si escalás a múltiples instancias, migrar a Redis.
 *
 * @Profile("!test"): es una preocupación de borde HTTP, no de negocio, y el
 * bucket es un singleton en memoria compartido por TODA la suite (todos los
 * tests de integración reusan el mismo Spring context). Con varias clases de
 * test pegándole a /api/v1/auth/ (login, refresh, forgot-password...), la
 * suite completa termina agotando el bucket de 10/min y algunos tests ven un
 * 429 en vez del status que en realidad quieren verificar. Producción nunca
 * corre con spring.profiles.active=test, así que esto no le resta protección.
 */
@Component
@Profile("!test")
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RateLimitFilter implements Filter {

    // Login/register: 10 requests por minuto por IP (protección contra brute force)
    private final Cache<String, Bucket> authBuckets = Caffeine.newBuilder()
            .expireAfterAccess(10, TimeUnit.MINUTES)
            .maximumSize(10_000)
            .build();

    // Webhooks: 60 requests por minuto por IP (MercadoPago/PayPal pueden hacer ráfagas)
    private final Cache<String, Bucket> webhookBuckets = Caffeine.newBuilder()
            .expireAfterAccess(10, TimeUnit.MINUTES)
            .maximumSize(10_000)
            .build();

    // API general: 120 requests por minuto por IP
    private final Cache<String, Bucket> generalBuckets = Caffeine.newBuilder()
            .expireAfterAccess(10, TimeUnit.MINUTES)
            .maximumSize(10_000)
            .build();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = req.getRequestURI();
        String ip = getClientIp(req);

        Bucket bucket;
        if (path.startsWith("/api/auth/") || path.startsWith("/api/v1/auth/")) {
            bucket = authBuckets.get(ip, k -> createBucket(10, Duration.ofMinutes(1)));
        } else if (path.startsWith("/api/webhook/") || path.startsWith("/api/mp/webhook")
                || path.startsWith("/api/paypal/webhook") || path.startsWith("/api/telegram/")) {
            bucket = webhookBuckets.get(ip, k -> createBucket(60, Duration.ofMinutes(1)));
        } else if (path.startsWith("/api/")) {
            bucket = generalBuckets.get(ip, k -> createBucket(120, Duration.ofMinutes(1)));
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

    // CF-Connecting-IP solo es confiable si Cloudflare es el UNICO camino para
    // llegar al backend: si el origin (hoy Railway) es alcanzable por otra vía,
    // cualquiera puede mandar ese header con el valor que quiera y saltear el
    // rate limit rotando IPs falsas. Por default apagado — activalo (
    // APP_TRUST_CLOUDFLARE_HEADER=true) recien cuando Cloudflare este
    // confirmado como el unico camino de entrada (por ejemplo, con el dominio
    // por defecto de Railway deshabilitado o inalcanzable).
    @Value("${app.security.trust-cloudflare-header:false}")
    private boolean trustCloudflareHeader;

    private String getClientIp(HttpServletRequest request) {
        if (trustCloudflareHeader) {
            String cfIp = request.getHeader("CF-Connecting-IP");
            if (cfIp != null && !cfIp.isBlank()) {
                return cfIp.trim();
            }
        }
        // X-Forwarded-For: confiamos en el primer hop porque Railway (el host
        // actual) enruta el trafico HTTP a traves de su propio edge — el
        // contenedor no queda expuesto por IP:puerto directo al público en su
        // modelo estandar de despliegue.
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
