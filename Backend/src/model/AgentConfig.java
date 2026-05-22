package model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "agent_config")
public class AgentConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agencia_id", nullable = false, unique = true)
    private Agencia agencia;

    @Column(columnDefinition = "TEXT")
    private String instructions;

    @Column(name = "business_context", columnDefinition = "TEXT")
    private String businessContext;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "human_sector_id")
    private Etapa humanSector;

    @Column(nullable = false)
    private boolean enabled = false;

    @Column(name = "audit_enabled", nullable = false)
    private boolean auditEnabled = false;

    @Column(name = "audit_procedures", columnDefinition = "TEXT")
    private String auditProcedures;

    @Column(name = "audit_email", length = 255)
    private String auditEmail;

    @Column(name = "audit_whatsapp_phone", length = 50)
    private String auditWhatsappPhone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_dispositivo_id")
    private Dispositivo auditDispositivo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public AgentConfig() {}

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
    public void setId(Long id) { this.id = id; }

    public Agencia getAgencia() { return agencia; }
    public void setAgencia(Agencia agencia) { this.agencia = agencia; }

    public String getInstructions() { return instructions; }
    public void setInstructions(String instructions) { this.instructions = instructions; }

    public String getBusinessContext() { return businessContext; }
    public void setBusinessContext(String businessContext) { this.businessContext = businessContext; }

    public Etapa getHumanSector() { return humanSector; }
    public void setHumanSector(Etapa humanSector) { this.humanSector = humanSector; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isAuditEnabled() { return auditEnabled; }
    public void setAuditEnabled(boolean auditEnabled) { this.auditEnabled = auditEnabled; }

    public String getAuditProcedures() { return auditProcedures; }
    public void setAuditProcedures(String auditProcedures) { this.auditProcedures = auditProcedures; }

    public String getAuditEmail() { return auditEmail; }
    public void setAuditEmail(String auditEmail) { this.auditEmail = auditEmail; }

    public String getAuditWhatsappPhone() { return auditWhatsappPhone; }
    public void setAuditWhatsappPhone(String auditWhatsappPhone) { this.auditWhatsappPhone = auditWhatsappPhone; }

    public Dispositivo getAuditDispositivo() { return auditDispositivo; }
    public void setAuditDispositivo(Dispositivo auditDispositivo) { this.auditDispositivo = auditDispositivo; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
