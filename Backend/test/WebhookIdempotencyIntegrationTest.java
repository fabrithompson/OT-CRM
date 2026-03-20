import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.ProcessedWebhook;
import repository.ProcessedWebhookRepository;
import service.CloudStorageService;
import service.TelegramBridgeService;

class WebhookIdempotencyIntegrationTest extends BaseIntegrationTest {

    @Autowired ProcessedWebhookRepository processedWebhookRepo;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;

    @Test
    @DisplayName("ProcessedWebhook previene procesamiento duplicado")
    void webhookDuplicadoSeIgnora() {
        String eventKey = "MP_payment_12345";

        // Primera vez: no existe
        assertThat(processedWebhookRepo.existsById(eventKey)).isFalse();

        // Guardar como procesado
        processedWebhookRepo.save(new ProcessedWebhook(eventKey, "MERCADOPAGO"));

        // Segunda vez: ya existe — se debe ignorar
        assertThat(processedWebhookRepo.existsById(eventKey)).isTrue();

        // Verificar datos
        ProcessedWebhook saved = processedWebhookRepo.findById(eventKey).orElseThrow();
        assertThat(saved.getSource()).isEqualTo("MERCADOPAGO");
        assertThat(saved.getProcessedAt()).isNotNull();
    }

    @Test
    @DisplayName("Eventos de distintas fuentes coexisten")
    void eventosDistintasFuentesCoexisten() {
        processedWebhookRepo.save(new ProcessedWebhook("MP_payment_100", "MERCADOPAGO"));
        processedWebhookRepo.save(new ProcessedWebhook("PP_webhook_200", "PAYPAL"));

        assertThat(processedWebhookRepo.existsById("MP_payment_100")).isTrue();
        assertThat(processedWebhookRepo.existsById("PP_webhook_200")).isTrue();
        assertThat(processedWebhookRepo.existsById("MP_payment_999")).isFalse();
    }
}
