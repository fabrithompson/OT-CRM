package model;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Un intercambio de mensaje entre dos dispositivos CAMPANIAS de un plan de
 * calentamiento. El campo {@code respondido} evita loops: cuando el dispositivo
 * destino recibe el mensaje y auto-responde, se marca true para que no vuelva
 * a responder al ACK de esa respuesta.
 */
@Entity
@Table(name = "envios_calentamiento",
    indexes = {
        @Index(name = "idx_envio_calentamiento_estado", columnList = "estado, fecha_creado"),
        @Index(name = "idx_envio_calentamiento_plan", columnList = "plan_id, fecha_creado"),
        @Index(name = "idx_envio_calentamiento_par_dia", columnList = "dispositivo_origen_id, dispositivo_destino_id, fecha_enviado"),
        @Index(name = "idx_envio_calentamiento_destino_respondido", columnList = "dispositivo_destino_id, respondido, fecha_enviado")
    }
)
@Getter
@Setter
public class EnvioCalentamiento {

    public enum Estado {
        PENDING,
        SENT,
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String texto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Estado estado = Estado.PENDING;

    @Column(nullable = false)
    private boolean respondido = false;

    @Column(name = "fecha_creado", nullable = false)
    private LocalDateTime fechaCreado;

    @Column(name = "fecha_enviado")
    private LocalDateTime fechaEnviado;

    @Column(name = "error_msg", length = 500)
    private String errorMsg;

    @ManyToOne
    @JoinColumn(name = "dispositivo_origen_id", nullable = false)
    @JsonIgnore
    private Dispositivo dispositivoOrigen;

    @ManyToOne
    @JoinColumn(name = "dispositivo_destino_id", nullable = false)
    @JsonIgnore
    private Dispositivo dispositivoDestino;

    @ManyToOne
    @JoinColumn(name = "plan_id", nullable = false)
    @JsonIgnore
    private PlanCalentamiento plan;

    @ManyToOne
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnore
    private Agencia agencia;

    @PrePersist
    protected void onCreate() {
        if (this.fechaCreado == null) {
            this.fechaCreado = LocalDateTime.now();
        }
    }
}
