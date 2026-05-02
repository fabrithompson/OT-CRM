package model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "ai_conversation_state")
public class AiConversationState {

    public enum AiStatus {
        AI_HANDLING,
        HUMAN_REQUIRED
    }

    @Id
    private Long clienteId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "cliente_id")
    private Cliente cliente;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AiStatus status = AiStatus.AI_HANDLING;

    @Column(name = "sector_id")
    private Long sectorId;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public AiConversationState() {}

    public AiConversationState(Cliente cliente) {
        this.cliente = cliente;
        this.status = AiStatus.AI_HANDLING;
        this.updatedAt = LocalDateTime.now();
    }

    @PrePersist
    @PreUpdate
    protected void onSave() {
        updatedAt = LocalDateTime.now();
    }

    public Long getClienteId() { return clienteId; }

    public Cliente getCliente() { return cliente; }
    public void setCliente(Cliente cliente) { this.cliente = cliente; }

    public AiStatus getStatus() { return status; }
    public void setStatus(AiStatus status) { this.status = status; }

    public Long getSectorId() { return sectorId; }
    public void setSectorId(Long sectorId) { this.sectorId = sectorId; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
