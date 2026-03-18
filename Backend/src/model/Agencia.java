package model;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Entity
@Table(name = "agencias")
@Getter
@Setter
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Agencia {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String nombre;

    @Column(unique = true)
    private String codigoInvitacion;

    @OneToMany(mappedBy = "agencia", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnoreProperties("agencia")
    @ToString.Exclude
    private List<Dispositivo> dispositivos = new ArrayList<>();


    @OneToMany(mappedBy = "agencia", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnoreProperties("agencia")
    @ToString.Exclude 
    private List<Usuario> usuarios = new ArrayList<>();

    @OneToMany(mappedBy = "agencia", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnoreProperties("agencia")
    @ToString.Exclude
    private List<Cliente> clientes = new ArrayList<>();
    private String whatsappToken;
    private String whatsappPhoneId;
    private String whatsappWabaId;
    private String whatsappBusinessId;
    private String whatsappSessionId;
    private String numeroConectado;
    private String estadoConexion;

    public Agencia() {
    }

    public Agencia(String nombre, String codigoInvitacion) {
        this.nombre = nombre;
        this.codigoInvitacion = codigoInvitacion;
    }

    public void addDispositivo(Dispositivo dispositivo) {
        dispositivos.add(dispositivo);
        dispositivo.setAgencia(this);
    }

    public void removeDispositivo(Dispositivo dispositivo) {
        dispositivos.remove(dispositivo);
        dispositivo.setAgencia(null);
    }
}
