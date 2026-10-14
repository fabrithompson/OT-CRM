package config;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    /**
     * RestTemplate compartido (bot de WhatsApp, pasarelas de pago, etc.).
     *
     * Se fuerza HTTP/1.1 a propósito. Sin eso, el HttpClient del JDK (que Spring Boot usa
     * por defecto) intenta subir a HTTP/2 con "Upgrade: h2c" en las conexiones http://.
     * El bot (Node/Express) no entiende ese upgrade y cierra la conexión sin responder,
     * así que el backend veía "header parser received no bytes" y la vinculación de
     * WhatsApp quedaba en "Cargando QR..." para siempre.
     */
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        HttpClient http11 = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(CONNECT_TIMEOUT)
                .build();

        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http11);
        factory.setReadTimeout(READ_TIMEOUT);

        return builder.requestFactory(() -> factory).build();
    }
}
