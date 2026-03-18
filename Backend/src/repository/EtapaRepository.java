package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import model.Etapa;

public interface EtapaRepository extends JpaRepository<Etapa, Long> {

    List<Etapa> findAllByOrderByOrdenAsc();

    Optional<Etapa> findByNombre(String nombre);

    Etapa findFirstByOrderByOrdenAsc();

    Optional<Etapa> findByEsInicialTrue();

    Optional<Etapa> findFirstByAgenciaIdAndEsInicialTrue(Long agenciaId);

    Etapa findFirstByAgenciaIdOrderByOrdenAsc(Long id);

    long countByAgenciaId(Long id);

    List<Etapa> findByAgenciaIdOrderByOrdenAsc(Long id);

    List<Etapa> findByAgenciaId(Long agenciaId);
}
