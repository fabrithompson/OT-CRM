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

    @Column(name = "max_contactos", nullable = false)
    private int maxContactos = 25;

    private double precioMensual;

    private String descripcion;

    @Column(name = "mp_plan_id")
    private String mpPlanId;

    public Plan() {}

    public Plan(String nombre, int maxDispositivos, int maxContactos, double precioMensual, String descripcion) {
        this.nombre = nombre;
        this.maxDispositivos = maxDispositivos;
        this.maxContactos = maxContactos;
        this.precioMensual = precioMensual;
        this.descripcion = descripcion;
    }

    @Column(name = "paypal_plan_id")
    private String paypalPlanId;

    @Column(name = "stripe_price_id")
    private String stripePriceId;
}