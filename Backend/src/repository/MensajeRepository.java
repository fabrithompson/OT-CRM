package repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import model.Mensaje;

@Repository
public interface MensajeRepository extends JpaRepository<Mensaje, Long> {

    @Modifying
    @Transactional
    @Query("DELETE FROM Mensaje m WHERE m.cliente.id = :clienteId")
    void deleteByClienteId(@Param("clienteId") Long clienteId);

    @Query("SELECT m FROM Mensaje m WHERE m.cliente.id = :clienteId AND m.esSalida = false ORDER BY m.fechaHora DESC")
    List<Mensaje> findUltimosEntrantesPorCliente(@Param("clienteId") Long clienteId);

    @Query("SELECT COUNT(m) FROM Mensaje m WHERE m.cliente.id = :clienteId "
            + "AND m.estado NOT IN (model.Mensaje.EstadoMensaje.READ)")
    long countUnreadByCliente(@Param("clienteId") Long clienteId);

    Optional<Mensaje> findByWhatsappId(String whatsappId);

    List<Mensaje> findByClienteId(Long clienteId);

    List<Mensaje> findByClienteIdOrderByFechaHoraDesc(Long clienteId);

    List<Mensaje> findByClienteIdAndTipo(Long clienteId, Mensaje.TipoMensaje tipo);

    @Query("SELECT m FROM Mensaje m WHERE m.cliente.id = :clienteId AND LOWER(m.contenido) LIKE LOWER(CONCAT('%', :texto, '%'))")
    List<Mensaje> buscarPorContenido(@Param("clienteId") Long clienteId, @Param("texto") String texto);

    List<Mensaje> findByClienteIdAndFechaHoraBetween(Long clienteId, LocalDateTime inicio, LocalDateTime fin);

    Page<Mensaje> findByClienteAgenciaId(Long agenciaId, Pageable pageable);

    Optional<Mensaje> findFirstByClienteIdOrderByFechaHoraDesc(Long clienteId);

    @Modifying
    @Transactional
    @Query(value = "DELETE FROM mensaje WHERE cliente_id IN (SELECT id FROM clientes WHERE dispositivo_id = :dispositivoId)", nativeQuery = true)
    void deleteByDispositivoId(@Param("dispositivoId") Long dispositivoId);

    @Query("SELECT m FROM Mensaje m WHERE m.cliente.id = :clienteId ORDER BY m.id DESC")
    List<Mensaje> findLatestByClienteId(
        @Param("clienteId") Long clienteId, Pageable pageable);

    @Query("SELECT m FROM Mensaje m WHERE m.cliente.id = :clienteId AND m.id < :beforeId ORDER BY m.id DESC")
    List<Mensaje> findByClienteIdBeforeCursor(
        @Param("clienteId") Long clienteId,
        @Param("beforeId") Long beforeId,
        Pageable pageable);

    @Query("SELECT COUNT(m) FROM Mensaje m WHERE m.cliente.agencia.id = :agenciaId")
    long countByClienteAgenciaId(@Param("agenciaId") Long agenciaId);

    @Query("SELECT COUNT(m) FROM Mensaje m WHERE m.cliente.agencia.id = :agenciaId AND m.fechaHora >= :desde")
    long countByClienteAgenciaIdAndFechaHoraAfter(@Param("agenciaId") Long agenciaId, @Param("desde") LocalDateTime desde);

    @Query("SELECT m.cliente.etapa.id, COUNT(m) FROM Mensaje m WHERE m.cliente.agencia.id = :agenciaId AND m.cliente.etapa IS NOT NULL GROUP BY m.cliente.etapa.id")
    List<Object[]> countMensajesByEtapaAndAgencia(@Param("agenciaId") Long agenciaId);
}
