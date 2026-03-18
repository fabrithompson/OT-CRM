package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.Agencia;
import model.Dispositivo;
import model.Dispositivo.Plataforma;

@Repository
public interface DispositivoRepository extends JpaRepository<Dispositivo, Long> {

    List<Dispositivo> findByAgenciaId(Long agenciaId);

    List<Dispositivo> findByAgenciaIdAndPlataforma(Long agenciaId, Dispositivo.Plataforma plataforma);

    Optional<Dispositivo> findBySessionId(String sessionId);

    Optional<Dispositivo> findFirstByAgenciaIdAndEstado(Long agenciaId, String estado);

    boolean existsByAgenciaAndPlataforma(Agencia agencia, Dispositivo.Plataforma plataforma);

    long countByAgenciaIdAndPlataformaAndActivoTrue(Long agenciaId, Plataforma plataforma);

    long countByAgenciaIdAndPlataforma(Long agenciaId, Plataforma plataforma);


    List<Dispositivo> findByAgenciaIdAndPlataformaAndActivoTrueOrderByIdAsc(Long agenciaId, Plataforma plataforma);

    long countByAgenciaId(Long agenciaId);

    List<Dispositivo> findByAgenciaIdAndVisibleTrue(Long agenciaId);
    List<Dispositivo> findByAgenciaIdAndPlataformaAndVisibleTrue(Long agenciaId, Plataforma plataforma);

    long countByAgenciaIdAndPlataformaAndVisibleTrue(Long agenciaId, Dispositivo.Plataforma plataforma);
}