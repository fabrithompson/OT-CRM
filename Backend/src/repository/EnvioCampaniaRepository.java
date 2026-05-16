package repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import model.EnvioCampania;

@Repository
public interface EnvioCampaniaRepository extends JpaRepository<EnvioCampania, Long> {

    /**
     * Lote FIFO de envíos pendientes. El worker procesa este lote por tick,
     * respetando el throttling por dispositivo. Eager-fetch de las relaciones
     * para evitar N+1 al renderizar y enviar.
     */
    @Query("SELECT e FROM EnvioCampania e " +
           "JOIN FETCH e.contacto " +
           "JOIN FETCH e.dispositivo " +
           "WHERE e.estado = model.EnvioCampania.Estado.PENDING " +
           "ORDER BY e.fechaCreado ASC")
    List<EnvioCampania> findPendingBatch(Pageable pageable);

    /**
     * Cantidad de mensajes ya enviados con éxito por este dispositivo desde
     * {@code desde}. Usado para el rate-limit diario.
     */
    @Query("SELECT COUNT(e) FROM EnvioCampania e " +
           "WHERE e.dispositivo.id = :dispositivoId " +
           "AND e.estado = model.EnvioCampania.Estado.SENT " +
           "AND e.fechaEnviado >= :desde")
    long countSentByDispositivoSince(@Param("dispositivoId") Long dispositivoId,
                                     @Param("desde") LocalDateTime desde);

    /**
     * ¿Ya se le envió un mensaje a este contacto desde {@code desde}?
     * Usado para skip de duplicados (default: últimos 30 días).
     */
    @Query("SELECT COUNT(e) > 0 FROM EnvioCampania e " +
           "WHERE e.contacto.id = :contactoId " +
           "AND e.estado = model.EnvioCampania.Estado.SENT " +
           "AND e.fechaCreado >= :desde")
    boolean existsRecentByContactoSince(@Param("contactoId") Long contactoId,
                                        @Param("desde") LocalDateTime desde);
}
