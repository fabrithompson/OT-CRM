package model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "dispositivos")
@Getter
@Setter
public class Dispositivo {

    public enum Plataforma {
        WHATSAPP,
        TELEGRAM
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String alias;
    private String numeroTelefono;  

    @Column(unique = true, nullable = false)
    private String sessionId;

    private String estado = "DESCONECTADO";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Plataforma plataforma;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnore
    private Agencia agencia;

    public Dispositivo() {
    }

    public Dispositivo(String alias, String sessionId, Agencia agencia, Plataforma plataforma) {
        this.alias = alias;
        this.sessionId = sessionId;
        this.agencia = agencia;
        this.plataforma = plataforma;
        this.estado = (plataforma == Plataforma.WHATSAPP) ? "SCAN_QR" : "ESPERANDO_NUMERO";
    }

    @Column(name = "activo")
    private Boolean activo = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id")
    private Usuario usuario;

    @Column(nullable = false)
    private boolean visible = true;
}