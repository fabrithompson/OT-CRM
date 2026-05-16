package repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.PlantillaCampania;

@Repository
public interface PlantillaCampaniaRepository extends JpaRepository<PlantillaCampania, Long> {

    List<PlantillaCampania> findByAgenciaIdOrderByFechaCreacionDesc(Long agenciaId);
}
