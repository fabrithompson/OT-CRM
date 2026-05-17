package repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import model.EnvioCalentamiento;

public interface EnvioCalentamientoRepository extends JpaRepository<EnvioCalentamiento, Long> {

    @Query("""
        SELECT e FROM EnvioCalentamiento e
        JOIN FETCH e.dispositivoOrigen
        JOIN FETCH e.dispositivoDestino
        JOIN FETCH e.plan
        JOIN FETCH e.agencia
        WHERE e.estado = 'PENDING'
        ORDER BY e.fechaCreado ASC
        """)
    List<EnvioCalentamiento> findPendingBatch(Pageable pageable);

    @Query("""
        SELECT COUNT(e) FROM EnvioCalentamiento e
        WHERE e.dispositivoOrigen.id = :origenId
          AND e.dispositivoDestino.id = :destinoId
          AND e.estado = 'SENT'
          AND e.fechaEnviado >= :desde
        """)
    long countSentBetweenPairSince(@Param("origenId") Long origenId,
                                   @Param("destinoId") Long destinoId,
                                   @Param("desde") LocalDateTime desde);

    @Query("""
        SELECT CASE WHEN COUNT(e) > 0 THEN true ELSE false END
        FROM EnvioCalentamiento e
        WHERE e.dispositivoOrigen.id = :origenId
          AND e.dispositivoDestino.id = :destinoId
          AND e.estado = 'PENDING'
        """)
    boolean existsPendingForPair(@Param("origenId") Long origenId,
                                 @Param("destinoId") Long destinoId);

    @Query("""
        SELECT e FROM EnvioCalentamiento e
        WHERE e.dispositivoDestino.id = :destinoId
          AND e.dispositivoOrigen.numeroTelefono = :telefonoOrigen
          AND e.estado = 'SENT'
          AND e.respondido = false
          AND e.fechaEnviado >= :desde
        ORDER BY e.fechaEnviado DESC
        """)
    Optional<EnvioCalentamiento> findEnvioNoRespondido(@Param("destinoId") Long destinoId,
                                                        @Param("telefonoOrigen") String telefonoOrigen,
                                                        @Param("desde") LocalDateTime desde);

    @Query("""
        SELECT e FROM EnvioCalentamiento e
        JOIN FETCH e.dispositivoOrigen
        JOIN FETCH e.dispositivoDestino
        WHERE e.plan.id = :planId
        ORDER BY e.fechaCreado DESC
        """)
    List<EnvioCalentamiento> findByPlanIdOrderByFechaCreadoDesc(@Param("planId") Long planId,
                                                                 Pageable pageable);
}
