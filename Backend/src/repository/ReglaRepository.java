package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.Regla;

@Repository
public interface ReglaRepository extends JpaRepository<Regla, Long> {

    List<Regla> findByAgenciaIdOrderByIdDesc(Long agenciaId);

    List<Regla> findByAgenciaIdAndEtapaIdAndActivaTrue(Long agenciaId, Long etapaId);

    Optional<Regla> findByIdAndAgenciaId(Long id, Long agenciaId);
}
