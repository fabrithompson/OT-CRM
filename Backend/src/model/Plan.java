package model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "plan")
@Getter
@Setter
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Plan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String nombre;

    @Column(name = "max_dispositivos", nullable = false)
    private int maxDispositivos = 1;

    @Column(name = "max_dispositivos_campanias", nullable = false)
    private int maxDispositivosCampanias = 0;

    @Column(name = "max_contactos", nullable = false)
    private int maxContactos = 25;

    @Column(name = "max_miembros_equipo", nullable = false)
    private int maxMiembrosEquipo = 1;

    @Column(name = "agente_ia_habilitado", nullable = false)
    private boolean agenteIaHabilitado = false;

    @Column(name = "campanias_habilitadas", nullable = false)
    private boolean campaniasHabilitadas = false;

    private double precioMensual;

    private String descripcion;

    @Column(name = "mp_plan_id")
    private String mpPlanId;

    @Column(name = "paypal_plan_id")
    private String paypalPlanId;

    @Column(name = "stripe_price_id")
    private String stripePriceId;

    public Plan() {}

    public Plan(String nombre,
                int maxDispositivos,
                int maxDispositivosCampanias,
                int maxContactos,
                int maxMiembrosEquipo,
                boolean agenteIaHabilitado,
                boolean campaniasHabilitadas,
                double precioMensual,
                String descripcion) {
        this.nombre = nombre;
        this.maxDispositivos = maxDispositivos;
        this.maxDispositivosCampanias = maxDispositivosCampanias;
        this.maxContactos = maxContactos;
        this.maxMiembrosEquipo = maxMiembrosEquipo;
        this.agenteIaHabilitado = agenteIaHabilitado;
        this.campaniasHabilitadas = campaniasHabilitadas;
        this.precioMensual = precioMensual;
        this.descripcion = descripcion;
    }
}
