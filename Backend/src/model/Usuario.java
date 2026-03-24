package model;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "usuarios")
@Getter
@Setter
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    private String nombreCompleto;

    @Column(nullable = false)
    private String password;

    private String rol;

    @Column(unique = true)
    private String email;

    private String codigoVerificacion;

    @Column(nullable = false)
    private boolean verificado = false;

    private String fotoUrl;

    private String proveedorPago;

    @Column(name = "agencia_original_id")
    private Long agenciaOriginalId;

    @Transient
    private String codigoInvitacion;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "dispositivos", "usuarios", "clientes"})
    private Agencia agencia;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Plan plan;

    @Column(name = "plan_vencimiento")
    private LocalDate planVencimiento;

    public Usuario() {}

    public Usuario(String username, String password, String rol) {
        this.username = username;
        this.password = password;
        this.rol = rol;
    }

    public Boolean getVerificado() {
        return verificado;
    }

    public String getNombreCompleto() {
        return nombreCompleto != null ? nombreCompleto : username;
    }

}