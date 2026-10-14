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

/** Automatización: cuando un contacto entra a {@code etapaId}, se ejecuta {@code accion}. */
@Entity
@Table(name = "reglas")
@Getter
@Setter
public class Regla {

    public static final String CREAR_TAREA = "CREAR_TAREA";
    public static final String ASIGNAR_RESPONSABLE = "ASIGNAR_RESPONSABLE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agencia_id", nullable = false)
    private Long agenciaId;

    @Column(name = "etapa_id", nullable = false)
    private Long etapaId;

    @Column(nullable = false, length = 120)
    private String nombre;

    @Column(nullable = false, length = 30)
    private String accion;

    @Column(name = "titulo_tarea", length = 200)
    private String tituloTarea;

    @Column(name = "dias_vencimiento")
    private Integer diasVencimiento;

    /** Usuario a asignar (acción ASIGNAR_RESPONSABLE) */
    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(nullable = false)
    private boolean activa = true;

    @Column(name = "fecha_creacion", nullable = false)
    private LocalDateTime fechaCreacion = LocalDateTime.now();
}
