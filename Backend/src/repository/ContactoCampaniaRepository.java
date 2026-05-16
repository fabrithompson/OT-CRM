package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.ContactoCampania;

@Repository
public interface ContactoCampaniaRepository extends JpaRepository<ContactoCampania, Long> {

    List<ContactoCampania> findByDispositivoIdOrderByFechaImportadoDesc(Long dispositivoId);

    List<ContactoCampania> findByAgenciaIdOrderByFechaImportadoDesc(Long agenciaId);

    Optional<ContactoCampania> findByDispositivoIdAndTelefono(Long dispositivoId, String telefono);

    long countByDispositivoId(Long dispositivoId);

    long countByAgenciaId(Long agenciaId);
}
