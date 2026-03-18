package model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Registro de webhooks ya procesados — previene duplicación de pagos.
 * MercadoPago y PayPal pueden reenviar el mismo evento múltiples veces.
 * Si el eventId ya existe en esta tabla, se ignora sin reprocesar.
 */
@Entity
@Table(name = "processed_webhooks")
public class ProcessedWebhook {

    @Id
    @Column(length = 255)
    private String eventId;

    @Column(nullable = false, length = 50)
    private String source; // "MERCADOPAGO" o "PAYPAL"

    @Column(nullable = false)
    private LocalDateTime processedAt;

    public ProcessedWebhook() {}

    public ProcessedWebhook(String eventId, String source) {
        this.eventId = eventId;
        this.source = source;
        this.processedAt = LocalDateTime.now();
    }

    public String getEventId() { return eventId; }
    public String getSource() { return source; }
    public LocalDateTime getProcessedAt() { return processedAt; }
}
