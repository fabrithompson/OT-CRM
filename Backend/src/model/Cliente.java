package model;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.ForeignKey;
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

@Entity
@Table(name = "clientes",
    uniqueConstraints = {
        @UniqueConstraint(
                name = "uk_cliente_dispositivo_agencia_v3",
                columnNames = {"telefono", "dispositivo_id", "agencia_id"}
        )
    },
    indexes = {
        // Búsqueda por teléfono entrante de WhatsApp/Telegram
        @Index(name = "idx_cliente_telefono", columnList = "telefono"),
        // Filtrado por agencia en Kanban, dashboard, listados
        @Index(name = "idx_cliente_agencia", columnList = "agencia_id"),
        // Lookup compuesto más frecuente: buscar contacto por agencia + teléfono
        @Index(name = "idx_cliente_agencia_telefono", columnList = "agencia_id, telefono"),
        // Kanban: filtrado por agencia + etapa
        @Index(name = "idx_cliente_agencia_etapa", columnList = "agencia_id, etapa_id"),
        // Ordenamiento por último mensaje en listados
        @Index(name = "idx_cliente_agencia_ultimo_msg", columnList = "agencia_id, ultimoMensajeFecha DESC")
    }
)
@Getter
@Setter
public class Cliente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nombre;

    @Column(nullable = false)
    private String telefono;

    @Column(length = 500)
    private String notas;

    private Double carga = 0.0;
    private Double cargaTotal = 0.0;

    private String ultimoMensajeResumen;
    private LocalDateTime ultimoMensajeFecha;

    private int mensajesSinLeer = 0;

    @Column(length = 500)
    private String descripcionPerfil;

    private LocalDateTime fechaRegistro;

    @Column(length = 1000)
    private String fotoUrl;

    @Column(name = "origen", length = 20)
    private String origen = "WHATSAPP";

    @ManyToOne
    @JoinColumn(name = "etapa_id")
    private Etapa etapa;

    @ManyToOne
    @JoinColumn(name = "dispositivo_id")
    private Dispositivo dispositivo;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(
            name = "agencia_id",
            foreignKey = @ForeignKey(name = "FK_CLIENTE_AGENCIA_V2")
    )
    private Agencia agencia;

    @Column(name = "saldo")
    private Double saldo = 0.0;

    public Double getPresupuesto() {
        return this.saldo;
    }

    public void setPresupuesto(Double presupuesto) {
        this.saldo = presupuesto;
    }

    public String getNombreInstancia() {
        return dispositivo != null ? dispositivo.getAlias() : null;
    }

    public Cliente() {
    }

    public Cliente(String nombre, String telefono, String notas, Etapa etapa) {
        this.nombre = nombre;
        this.telefono = telefono;
        this.notas = notas;
        this.etapa = etapa;
        this.fechaRegistro = LocalDateTime.now();
        this.origen = "WHATSAPP";
    }

    @jakarta.persistence.ManyToMany(fetch = jakarta.persistence.FetchType.EAGER)
    @jakarta.persistence.JoinTable(
            name = "cliente_etiquetas",
            joinColumns = @jakarta.persistence.JoinColumn(name = "cliente_id"),
            inverseJoinColumns = @jakarta.persistence.JoinColumn(name = "etiqueta_id")
    )
    private java.util.Set<Etiqueta> etiquetas = new java.util.HashSet<>();

    @JsonProperty("nombreInstancia")
    public String getNombreInstanciaJson() {
        if (this.dispositivo != null) {
            return this.dispositivo.getAlias();
        }

        return "TELEGRAM".equals(this.origen) ? "TELEGRAM" : "";
    }


    @PrePersist
    protected void onCreate() {
        if (this.fechaRegistro == null) {
            this.fechaRegistro = LocalDateTime.now();
        }
        if (this.origen == null || this.origen.isEmpty()) {
            this.origen = "MANUAL";
        }
        if (this.carga == null) {
            this.carga = 0.0;
        }
        if (this.cargaTotal == null) {
            this.cargaTotal = 0.0;
        }
        if (this.saldo == null) {
            this.saldo = 0.0;
        }
        if (this.mensajesSinLeer == 0) {
            this.mensajesSinLeer = 0;
        }
    }
}
