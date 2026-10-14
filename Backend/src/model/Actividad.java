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

/** Entrada de la línea de tiempo de un contacto (nota, cambio de etapa, movimiento, tarea...). */
@Entity
@Table(name = "actividades")
@Getter
@Setter
public class Actividad {

    public static final String NOTA = "NOTA";
    public static final String CAMBIO_ETAPA = "CAMBIO_ETAPA";
    public static final String TRANSACCION = "TRANSACCION";
    public static final String TAREA = "TAREA";
    public static final String RESPONSABLE = "RESPONSABLE";
    public static final String AUTOMATIZACION = "AUTOMATIZACION";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agencia_id", nullable = false)
    private Long agenciaId;

    @Column(name = "cliente_id", nullable = false)
    private Long clienteId;

    /** Quién lo hizo (null = sistema/automatización) */
    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(nullable = false, length = 30)
    private String tipo;

    @Column(nullable = false, length = 2000)
    private String texto;

    @Column(nullable = false)
    private LocalDateTime fecha = LocalDateTime.now();
}
