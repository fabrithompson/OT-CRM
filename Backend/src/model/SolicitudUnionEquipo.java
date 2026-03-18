package model;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "solicitudes_union_equipo")
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class SolicitudUnionEquipo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "usuario_solicitante_id")
    @JsonIgnoreProperties({"agencia", "codigoVerificacion", "password", "etiquetas"})
    private Usuario usuarioSolicitante;

    @ManyToOne(optional = false)
    @JoinColumn(name = "agencia_id")
    @JsonIgnoreProperties({"usuarios", "clientes", "dispositivos", "hibernateLazyInitializer", "handler"})
    private Agencia agenciaDestino;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EstadoSolicitud estado;

    @Column(nullable = false)
    private LocalDateTime fechaCreacion;

    public enum EstadoSolicitud {
        PENDIENTE,
        APROBADA,
        RECHAZADA
    }

    public SolicitudUnionEquipo() {
        this.fechaCreacion = LocalDateTime.now();
    }

    public SolicitudUnionEquipo(Usuario usuario, Agencia agencia) {
        this.usuarioSolicitante = usuario;
        this.agenciaDestino = agencia;
        this.estado = EstadoSolicitud.PENDIENTE;
        this.fechaCreacion = LocalDateTime.now();
    }


    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Usuario getUsuarioSolicitante() {
        return usuarioSolicitante;
    }

    public void setUsuarioSolicitante(Usuario usuarioSolicitante) {
        this.usuarioSolicitante = usuarioSolicitante;
    }

    public Agencia getAgenciaDestino() {
        return agenciaDestino;
    }

    public void setAgenciaDestino(Agencia agenciaDestino) {
        this.agenciaDestino = agenciaDestino;
    }

    public EstadoSolicitud getEstado() {
        return estado;
    }

    public void setEstado(EstadoSolicitud estado) {
        this.estado = estado;
    }

    public LocalDateTime getFechaCreacion() {
        return fechaCreacion;
    }

    public void setFechaCreacion(LocalDateTime fechaCreacion) {
        this.fechaCreacion = fechaCreacion;
    }
}
