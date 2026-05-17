package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import model.PlanCalentamiento;

public interface PlanCalentamientoRepository extends JpaRepository<PlanCalentamiento, Long> {

    List<PlanCalentamiento> findByAgenciaIdOrderByFechaCreadoDesc(Long agenciaId);

    @Query("SELECT p FROM PlanCalentamiento p WHERE p.agencia.id = :agenciaId AND p.estado = 'ACTIVO'")
    List<PlanCalentamiento> findActivosByAgencia(@Param("agenciaId") Long agenciaId);

    @Query("SELECT p FROM PlanCalentamiento p WHERE p.estado = 'ACTIVO'")
    List<PlanCalentamiento> findAllActivos();

    Optional<PlanCalentamiento> findByIdAndAgenciaId(Long id, Long agenciaId);
}
