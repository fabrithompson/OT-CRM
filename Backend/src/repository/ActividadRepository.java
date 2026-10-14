package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.Actividad;

@Repository
public interface ActividadRepository extends JpaRepository<Actividad, Long> {

    List<Actividad> findByAgenciaIdAndClienteIdOrderByFechaDescIdDesc(Long agenciaId, Long clienteId, Pageable pageable);

    Optional<Actividad> findByIdAndAgenciaIdAndClienteId(Long id, Long agenciaId, Long clienteId);
}
