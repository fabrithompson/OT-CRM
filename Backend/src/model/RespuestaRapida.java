package model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;

@Entity

@Table(name = "respuesta_rapida", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"agencia_id", "atajo"}) 
})
@Data
public class RespuestaRapida {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String atajo; 

    @Column(nullable = false, columnDefinition = "TEXT")
    private String respuesta; 

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "usuario_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "agencia", "plan"})
    private Usuario usuario;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "agencia_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "usuarios", "dispositivos", "clientes"})
    private Agencia agencia;

    @CreationTimestamp
    private LocalDateTime fechaCreacion;

    @UpdateTimestamp
    private LocalDateTime fechaActualizacion;

    @PrePersist
    @PreUpdate
    public void cleanAtajo() {
        if (this.atajo != null) {
            this.atajo = this.atajo.trim().toLowerCase().replace(" ", "");
        }
    }
}