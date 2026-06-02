package model;

import java.time.LocalDateTime;
import jakarta.persistence.*;

@Entity
@Table(name = "audit_stage", indexes = {
    @Index(name = "idx_audit_stage_agent_config", columnList = "agent_config_id, orden")
})
public class AuditStage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_config_id", nullable = false)
    private AgentConfig agentConfig;

    @Column(nullable = false, length = 120)
    private String nombre;

    @Column(columnDefinition = "TEXT")
    private String descripcion;

    // Peso relativo. Los pesos NO tienen que sumar 100; el backend normaliza.
    @Column(nullable = false)
    private int peso = 10;

    @Column(nullable = false)
    private int orden = 0;

    @Column(nullable = false)
    private boolean activa = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public AgentConfig getAgentConfig() { return agentConfig; }
    public void setAgentConfig(AgentConfig agentConfig) { this.agentConfig = agentConfig; }
    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }
    public int getPeso() { return peso; }
    public void setPeso(int peso) { this.peso = peso; }
    public int getOrden() { return orden; }
    public void setOrden(int orden) { this.orden = orden; }
    public boolean isActiva() { return activa; }
    public void setActiva(boolean activa) { this.activa = activa; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
