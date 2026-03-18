package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import model.Agencia;
import model.SolicitudUnionEquipo;
import model.Usuario;

public interface SolicitudUnionEquipoRepository extends JpaRepository<SolicitudUnionEquipo, Long> {

    Optional<SolicitudUnionEquipo> findByUsuarioSolicitanteAndAgenciaDestinoAndEstado(
            Usuario usuario,
            Agencia agenciaDestino,
            SolicitudUnionEquipo.EstadoSolicitud estado
    );

    List<SolicitudUnionEquipo> findByAgenciaDestinoAndEstado(
            Agencia agenciaDestino,
            SolicitudUnionEquipo.EstadoSolicitud estado
    );

    default List<SolicitudUnionEquipo> findByAgenciaAndEstado(Agencia agencia, SolicitudUnionEquipo.EstadoSolicitud estado) {
        return findByAgenciaDestinoAndEstado(agencia, estado);
    }
}
