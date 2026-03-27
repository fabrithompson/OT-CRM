package config;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Valida que las variables de entorno críticas estén configuradas al arrancar.
 * Falla rápido en producción para evitar descubrir errores en runtime.
 */
@Component
public class StartupValidator {

    private static final Logger log = LoggerFactory.getLogger(StartupValidator.class);

    @Value("${spring.datasource.url:}")
    private String datasourceUrl;

    @Value("${jwt.secret:}")
    private String jwtSecret;

    @Value("${bot.secret.key:}")
    private String botSecretKey;

    @Value("${mercadopago.access.token:}")
    private String mpAccessToken;

    @Value("${mercadopago.webhook.secret:}")
    private String mpWebhookSecret;

    @Value("${paypal.client.id:}")
    private String paypalClientId;

    @Value("${paypal.client.secret:}")
    private String paypalClientSecret;

    @Value("${paypal.webhook.id:}")
    private String paypalWebhookId;

    @Value("${app.base.url:}")
    private String appBaseUrl;

    @Value("${app.cors.origins:}")
    private String corsOrigins;

    @Value("${resend.api.key:}")
    private String resendApiKey;

    @EventListener(ApplicationReadyEvent.class)
    public void validateOnStartup() {
        List<String> missing = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // Críticas — sin estas la app no funciona correctamente
        checkRequired(datasourceUrl, "SPRING_DATASOURCE_URL", missing);
        checkRequired(jwtSecret, "JWT_SECRET", missing);
        checkRequired(botSecretKey, "BOT_SECRET_KEY", missing);
        checkRequired(appBaseUrl, "APP_BASE_URL", missing);
        checkRequired(corsOrigins, "APP_CORS_ORIGINS", missing);

        // Pagos — sin estas los webhooks rechazan todo (fail-closed)
        checkWarning(mpAccessToken, "MERCADOPAGO_ACCESS_TOKEN", warnings);
        checkWarning(mpWebhookSecret, "MERCADOPAGO_WEBHOOK_SECRET", warnings);
        checkWarning(paypalClientId, "PAYPAL_CLIENT_ID", warnings);
        checkWarning(paypalClientSecret, "PAYPAL_CLIENT_SECRET", warnings);
        checkWarning(paypalWebhookId, "PAYPAL_WEBHOOK_ID", warnings);

        // Email
        checkWarning(resendApiKey, "RESEND_API_KEY", warnings);

        if (!missing.isEmpty()) {
            String msg = "Variables de entorno OBLIGATORIAS no configuradas: " + String.join(", ", missing);
            log.error(msg);
            throw new IllegalStateException(msg);
        }

        if (!warnings.isEmpty()) {
            log.warn("Variables de entorno opcionales sin configurar (funcionalidad limitada): {}",
                     String.join(", ", warnings));
        }

        log.info("Validación de configuración completada correctamente");
    }

    private void checkRequired(String value, String name, List<String> missing) {
        if (value == null || value.isBlank()) {
            missing.add(name);
        }
    }

    private void checkWarning(String value, String name, List<String> warnings) {
        if (value == null || value.isBlank()) {
            warnings.add(name);
        }
    }
}
