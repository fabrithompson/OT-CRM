package security;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Genera un correlation ID único por request y lo agrega al MDC de SLF4J.
 * Esto permite rastrear un request a través de todos los logs del backend.
 * Si el cliente envía el header X-Correlation-ID, se reutiliza (útil para
 * rastrear requests entre el bot Node.js y el backend Java).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter implements Filter {

    private static final String CORRELATION_HEADER = "X-Correlation-ID";
    private static final String MDC_KEY = "correlationId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        try {
            HttpServletRequest httpReq = (HttpServletRequest) request;
            String correlationId = httpReq.getHeader(CORRELATION_HEADER);
            if (correlationId == null || correlationId.isBlank()) {
                correlationId = UUID.randomUUID().toString().substring(0, 8);
            }

            MDC.put(MDC_KEY, correlationId);

            // Devolver el correlation ID en la respuesta para debugging
            if (response instanceof HttpServletResponse httpRes) {
                httpRes.setHeader(CORRELATION_HEADER, correlationId);
            }

            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
