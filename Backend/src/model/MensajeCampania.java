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
 * Mensaje del chat 1-a-1 con un contacto de campaña. Aparte de {@link Mensaje}
 * (que es para clientes del embudo principal) para mantener el aislamiento
 * total entre sector de spam y embudo real.
 */
@Entity
@Table(name = "mensajes_campania",
    indexes = {
        @Index(name = "idx_mensaje_campania_contacto_fecha", columnList = "contacto_id, fecha DESC"),
        @Index(name = "idx_mensaje_campania_disp_fecha", columnList = "dispositivo_id, fecha DESC")
    }
)
@Getter
@Setter
public class MensajeCampania {

    public enum Direccion {
        IN,
        OUT
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String texto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Direccion direccion;

    @Column(nullable = false)
    private boolean leido = false;

    @Column(nullable = false)
    private LocalDateTime fecha;

    @ManyToOne
    @JoinColumn(name = "contacto_id", nullable = false)
    @JsonIgnore
    private ContactoCampania contacto;

    @ManyToOne
    @JoinColumn(name = "dispositivo_id", nullable = false)
    @JsonIgnore
    private Dispositivo dispositivo;

    @PrePersist
    protected void onCreate() {
        if (this.fecha == null) {
            this.fecha = LocalDateTime.now();
        }
    }
}
