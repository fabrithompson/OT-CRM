package model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Tarea o recordatorio de la agencia, opcionalmente ligada a un contacto y
 * asignada a un usuario. Las claves foráneas son ids simples (no relaciones):
 * así nunca se serializa un Usuario completo ni se disparan cargas perezosas.
 */
@Entity
@Table(name = "tareas")
@Getter
@Setter
public class Tarea {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agencia_id", nullable = false)
    private Long agenciaId;

    @Column(name = "cliente_id")
    private Long clienteId;

    /** Usuario asignado */
    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "creador_id")
    private Long creadorId;

    @Column(nullable = false, length = 200)
    private String titulo;

    @Column(length = 1000)
    private String descripcion;

    private LocalDateTime vencimiento;

    @Column(nullable = false)
    private boolean completada = false;

    @Column(name = "fecha_completada")
    private LocalDateTime fechaCompletada;

    /** true cuando el scheduler ya avisó el vencimiento */
    @Column(nullable = false)
    private boolean notificada = false;

    @Column(name = "fecha_creacion", nullable = false)
    private LocalDateTime fechaCreacion = LocalDateTime.now();
}
