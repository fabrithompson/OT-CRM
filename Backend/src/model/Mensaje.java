package model;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "mensaje", indexes = {
    // Historial de chat: todas las queries de mensajes por cliente ordenados por fecha
    @Index(name = "idx_mensaje_cliente_fecha", columnList = "cliente_id, fechaHora DESC"),
    // Búsqueda de mensaje por whatsappId para actualización de estados (DELIVERED, READ)
    @Index(name = "idx_mensaje_whatsapp_id", columnList = "whatsappId")
})
public class Mensaje {

    public enum EstadoMensaje {
        ENVIADO, SENT, DELIVERED, READ, LEIDO
    }

    public enum TipoMensaje {
        TEXTO, IMAGEN, DOCUMENTO, AUDIO, VIDEO, STICKER
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private Cliente cliente;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String contenido;

    @Column(nullable = false)
    private boolean esSalida;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss", timezone = "America/Argentina/Buenos_Aires")
    private LocalDateTime fechaHora;

    private String urlArchivo;

    @Column(length = 128)
    private String whatsappId;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false)
    private EstadoMensaje estado = EstadoMensaje.ENVIADO;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false)
    private TipoMensaje tipo = TipoMensaje.TEXTO;

    @Column(length = 100)
    private String autor;

    public Mensaje() {
    }

    public Mensaje(String body, boolean esSalida, Cliente cliente, String autor) {
        this.contenido = body;
        this.esSalida = esSalida;
        this.cliente = cliente;
        this.autor = autor;
        this.fechaHora = LocalDateTime.now();
        this.estado = EstadoMensaje.ENVIADO;
        this.tipo = TipoMensaje.TEXTO;
    }

    public Long getId() {
        return id;
    }

    public Cliente getCliente() {
        return cliente;
    }

    public void setCliente(Cliente cliente) {
        this.cliente = cliente;
    }

    public String getContenido() {
        return contenido;
    }

    public void setContenido(String contenido) {
        this.contenido = contenido;
    }

    public boolean isEsSalida() {
        return esSalida;
    }

    public void setEsSalida(boolean esSalida) {
        this.esSalida = esSalida;
    }

    public LocalDateTime getFechaHora() {
        return fechaHora;
    }

    public void setFechaHora(LocalDateTime fechaHora) {
        this.fechaHora = fechaHora;
    }

    public String getUrlArchivo() {
        return urlArchivo;
    }

    public void setUrlArchivo(String urlArchivo) {
        this.urlArchivo = urlArchivo;
    }

    public String getWhatsappId() {
        return whatsappId;
    }

    public void setWhatsappId(String whatsappId) {
        this.whatsappId = whatsappId;
    }

    public EstadoMensaje getEstado() {
        return estado;
    }

    public void setEstado(EstadoMensaje estado) {
        this.estado = estado;
    }

    public TipoMensaje getTipo() {
        return tipo;
    }

    public void setTipo(TipoMensaje tipo) {
        this.tipo = tipo;
    }

    public String getAutor() {return autor;}

    public void setAutor(String autor) {this.autor = autor;}
}
