package repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import model.Tarea;

@Repository
public interface TareaRepository extends JpaRepository<Tarea, Long> {

    Optional<Tarea> findByIdAndAgenciaId(Long id, Long agenciaId);

    @Query("SELECT t FROM Tarea t WHERE t.agenciaId = :agenciaId AND t.clienteId = :clienteId "
            + "ORDER BY t.completada ASC, CASE WHEN t.vencimiento IS NULL THEN 1 ELSE 0 END, t.vencimiento ASC, t.id DESC")
    List<Tarea> findByCliente(@Param("agenciaId") Long agenciaId, @Param("clienteId") Long clienteId);

    @Query("SELECT t FROM Tarea t WHERE t.agenciaId = :agenciaId AND t.usuarioId = :usuarioId "
            + "AND (:incluirCompletadas = TRUE OR t.completada = FALSE) "
            + "ORDER BY t.completada ASC, CASE WHEN t.vencimiento IS NULL THEN 1 ELSE 0 END, t.vencimiento ASC, t.id DESC")
    List<Tarea> findDeUsuario(@Param("agenciaId") Long agenciaId, @Param("usuarioId") Long usuarioId,
                              @Param("incluirCompletadas") boolean incluirCompletadas);

    @Query("SELECT t FROM Tarea t WHERE t.agenciaId = :agenciaId "
            + "AND (:incluirCompletadas = TRUE OR t.completada = FALSE) "
            + "ORDER BY t.completada ASC, CASE WHEN t.vencimiento IS NULL THEN 1 ELSE 0 END, t.vencimiento ASC, t.id DESC")
    List<Tarea> findDeAgencia(@Param("agenciaId") Long agenciaId,
                              @Param("incluirCompletadas") boolean incluirCompletadas);

    /** Tareas vencidas que todavía no se avisaron (las recorre el scheduler). */
    List<Tarea> findByCompletadaFalseAndNotificadaFalseAndVencimientoLessThanEqual(LocalDateTime ahora);
}
