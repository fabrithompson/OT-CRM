package repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import model.Etiqueta;

public interface EtiquetaRepository extends JpaRepository<Etiqueta, Long> {

    Optional<Etiqueta> findByNombreAndAgenciaId(String nombre, Long agenciaId);
}
