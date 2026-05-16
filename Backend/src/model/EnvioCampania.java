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
 * Una fila por destinatario de una campaña. Permite:
 *   - Calcular el rate-limit diario por dispositivo
 *   - Skip de duplicados ("ya le mandé hace menos de 30 días")
 *   - Auditoría: qué se mandó, cuándo, con qué resultado
 *
 * El campo {@code textoRenderizado} guarda el mensaje con variables ya
 * reemplazadas, así el historial muestra lo que realmente se envió aunque
 * después se edite o borre la plantilla.
 */
@Entity
@Table(name = "envios_campania",
    indexes = {
        @Index(name = "idx_envio_campania_disp_enviado", columnList = "dispositivo_id, fecha_enviado"),
        @Index(name = "idx_envio_campania_contacto_creado", columnList = "contacto_id, fecha_creado DESC"),
        @Index(name = "idx_envio_campania_estado_creado", columnList = "estado, fecha_creado")
    }
)
@Getter
@Setter
public class EnvioCampania {

    public enum Estado {
        PENDING,
        SENT,
        FAILED,
        SKIPPED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "texto_renderizado", nullable = false, columnDefinition = "TEXT")
    private String textoRenderizado;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Estado estado = Estado.PENDING;

    @Column(name = "fecha_creado", nullable = false)
    private LocalDateTime fechaCreado;

    @Column(name = "fecha_enviado")
    private LocalDateTime fechaEnviado;

    @Column(name = "error_msg", length = 500)
    private String errorMsg;

    @ManyToOne
    @JoinColumn(name = "contacto_id", nullable = false)
    @JsonIgnore
    private ContactoCampania contacto;

    @ManyToOne
    @JoinColumn(name = "dispositivo_id", nullable = false)
    @JsonIgnore
    private Dispositivo dispositivo;

    @ManyToOne
    @JoinColumn(name = "plantilla_id")
    @JsonIgnore
    private PlantillaCampania plantilla;

    @ManyToOne
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnore
    private Agencia agencia;

    @PrePersist
    protected void onCreate() {
        if (this.fechaCreado == null) {
            this.fechaCreado = LocalDateTime.now();
        }
        if (this.estado == null) {
            this.estado = Estado.PENDING;
        }
    }
}
