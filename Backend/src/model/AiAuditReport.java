package model;

import java.time.LocalDateTime;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "ai_audit_report", indexes = {
    @Index(name = "idx_audit_report_agencia_fecha", columnList = "agencia_id, created_at DESC")
})
public class AiAuditReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agencia_id", nullable = false)
    private Agencia agencia;

    @Column(name = "periodo_inicio", nullable = false)
    private LocalDateTime periodoInicio;

    @Column(name = "periodo_fin", nullable = false)
    private LocalDateTime periodoFin;

    @Column(columnDefinition = "TEXT")
    private String resumen;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hallazgos_json", columnDefinition = "jsonb")
    private String hallazgosJson;

    @Column(nullable = false)
    private int incumplimientos = 0;

    @Column(name = "tokens_usados", nullable = false)
    private int tokensUsados = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }

    public Agencia getAgencia() { return agencia; }
    public void setAgencia(Agencia agencia) { this.agencia = agencia; }

    public LocalDateTime getPeriodoInicio() { return periodoInicio; }
    public void setPeriodoInicio(LocalDateTime periodoInicio) { this.periodoInicio = periodoInicio; }

    public LocalDateTime getPeriodoFin() { return periodoFin; }
    public void setPeriodoFin(LocalDateTime periodoFin) { this.periodoFin = periodoFin; }

    public String getResumen() { return resumen; }
    public void setResumen(String resumen) { this.resumen = resumen; }

    public String getHallazgosJson() { return hallazgosJson; }
    public void setHallazgosJson(String hallazgosJson) { this.hallazgosJson = hallazgosJson; }

    public int getIncumplimientos() { return incumplimientos; }
    public void setIncumplimientos(int incumplimientos) { this.incumplimientos = incumplimientos; }

    public int getTokensUsados() { return tokensUsados; }
    public void setTokensUsados(int tokensUsados) { this.tokensUsados = tokensUsados; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
