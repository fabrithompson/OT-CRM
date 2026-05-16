package model;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/**
 * Contacto del sector de campañas. Totalmente separado de {@link Cliente}:
 * un mismo número de teléfono puede vivir acá y en `clientes` sin conflicto,
 * son universos aislados (el sector de spam vs el embudo real).
 */
@Entity
@Table(name = "contactos_campania",
    uniqueConstraints = {
        @UniqueConstraint(
                name = "uk_contacto_campania_disp_tel",
                columnNames = {"dispositivo_id", "telefono"}
        )
    },
    indexes = {
        @Index(name = "idx_contacto_campania_agencia", columnList = "agencia_id"),
        @Index(name = "idx_contacto_campania_dispositivo", columnList = "dispositivo_id")
    }
)
@Getter
@Setter
public class ContactoCampania {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nombre;

    @Column(nullable = false)
    private String telefono;

    @Column(length = 500)
    private String notas;

    @Column(name = "fecha_importado", nullable = false)
    private LocalDateTime fechaImportado;

    @ManyToOne
    @JoinColumn(name = "dispositivo_id", nullable = false)
    @JsonIgnore
    private Dispositivo dispositivo;

    @ManyToOne
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnore
    private Agencia agencia;

    @PrePersist
    protected void onCreate() {
        if (this.fechaImportado == null) {
            this.fechaImportado = LocalDateTime.now();
        }
    }
}
