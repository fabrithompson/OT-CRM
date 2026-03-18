package model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "etiquetas")
@Getter
@Setter
public class Etiqueta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nombre;

    private String color = "#10b981";

    @ManyToOne
    @JoinColumn(name = "agencia_id")
    @JsonIgnore
    private Agencia agencia;

    public Etiqueta() {
    }

    public Etiqueta(String nombre, Agencia agencia) {
        this.nombre = nombre;
        this.agencia = agencia;
    }
}
