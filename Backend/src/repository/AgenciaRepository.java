package repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.Agencia;

@Repository
public interface AgenciaRepository extends JpaRepository<Agencia, Long> {

    Optional<Agencia> findByCodigoInvitacion(String codigoInvitacion);

    Optional<Agencia> findByWhatsappPhoneId(String whatsappPhoneId);

    Optional<Agencia> findByNombre(String nombre);
}
