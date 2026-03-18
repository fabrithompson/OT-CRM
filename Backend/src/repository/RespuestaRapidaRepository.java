package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.Agencia;
import model.RespuestaRapida;

@Repository
public interface RespuestaRapidaRepository extends JpaRepository<RespuestaRapida, Long> {

    List<RespuestaRapida> findByAgencia(Agencia agencia);

    boolean existsByAgenciaAndAtajo(Agencia agencia, String atajo);

    Optional<RespuestaRapida> findByAgenciaAndAtajo(Agencia agencia, String atajo);
}
