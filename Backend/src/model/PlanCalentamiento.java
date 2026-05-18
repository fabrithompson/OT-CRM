package model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "planes_calentamiento",
    indexes = {
        @Index(name = "idx_plan_calentamiento_agencia", columnList = "agencia_id"),
        @Index(name = "idx_plan_calentamiento_estado", columnList = "agencia_id, estado")
    }
)
@Getter
@Setter
public class PlanCalentamiento {

    public enum Estado {
        ACTIVO,
        PAUSADO
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String nombre;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Estado estado = Estado.ACTIVO;

    @Column(name = "mensajes_por_par_por_dia", nullable = false)
    private int mensajesPorParPorDia = 10;

    @Column(name = "fecha_creado", nullable = false)
    private LocalDateTime fechaCreado;

    // Pool de mensajes de calentamiento: se elige uno al azar en cada envío
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
        name = "textos_calentamiento",
        joinColumns = @JoinColumn(name = "plan_id")
    )
    @Column(name = "cuerpo", columnDefinition = "TEXT")
    private List<String> textos = new ArrayList<>();

    // Dispositivos CAMPANIAS que participan en este plan
    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "plan_calentamiento_dispositivos",
        joinColumns = @JoinColumn(name = "plan_id"),
        inverseJoinColumns = @JoinColumn(name = "dispositivo_id")
    )
    private Set<Dispositivo> dispositivos = new HashSet<>();

    @ManyToOne(fetch = FetchType.LAZY)
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
