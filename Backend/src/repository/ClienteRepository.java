package repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import model.Cliente;
import model.Dispositivo;

import jakarta.persistence.LockModeType;

@Repository
public interface ClienteRepository extends JpaRepository<Cliente, Long> {

    Optional<Cliente> findByAgenciaIdAndTelefono(Long agenciaId, String telefono);

    Optional<Cliente> findFirstByAgenciaIdAndTelefono(Long agenciaId, String telefono);

    Optional<Cliente> findByTelefono(String telefono);

    List<Cliente> findByAgenciaIdOrderByFechaRegistroDesc(Long agenciaId);

    Page<Cliente> findByAgenciaIdOrderByFechaRegistroDesc(Long agenciaId, Pageable pageable);

    List<Cliente> findByAgenciaIdOrderByUltimoMensajeFechaDesc(Long agenciaId);

    long countByEtapaIdAndAgenciaId(Long etapaId, Long agenciaId);

    long countByAgenciaIdAndFechaRegistroAfter(Long agenciaId, LocalDateTime fecha);

    long countByAgenciaIdAndMensajesSinLeerGreaterThan(Long agenciaId, int count);

    long countByAgenciaId(Long agenciaId);

    Optional<Cliente> findFirstByTelefono(String telefono);

    long countByEtapaId(Long etapaId);

    Optional<Cliente> findByTelefonoAndAgenciaId(String telefono, Long agenciaId);

    List<Cliente> findByAgenciaIdAndEtiquetas_IdOrderByUltimoMensajeFechaDesc(Long agenciaId, Long etiquetaId);

    Page<Cliente> findByAgenciaIdAndNombreContainingIgnoreCase(Long agenciaId, String nombre, Pageable pageable);

    Optional<Cliente> findByAgenciaIdAndTelefonoAndDispositivo(Long agenciaId, String telefono, Dispositivo dispositivo);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.telefono = :telefono AND c.dispositivo = :dispositivo")
    Optional<Cliente> findByAgenciaIdAndTelefonoAndDispositivoWithLock(Long agenciaId, String telefono, Dispositivo dispositivo);


    Optional<Cliente> findByAgenciaIdAndTelefonoAndDispositivoIsNull(Long agenciaId, String telefono);

    List<Cliente> findByAgenciaIdAndEtiquetasIdOrderByFechaRegistroDesc(Long agenciaId, Long etiquetaId);

    List<Cliente> findByAgenciaIdAndEtiquetasIdOrderByUltimoMensajeFechaDesc(Long agenciaId, Long etiquetaId);

    @Modifying
    @Transactional
    @Query(value = "UPDATE clientes SET dispositivo_id = NULL WHERE dispositivo_id = :dispositivoId", nativeQuery = true)
    void desvincularClientesDeDispositivo(@Param("dispositivoId") Long dispositivoId);

    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId AND (LOWER(c.nombre) LIKE LOWER(CONCAT('%', :query, '%')) OR c.telefono LIKE %:query% OR (c.dispositivo IS NOT NULL AND LOWER(c.dispositivo.alias) LIKE LOWER(CONCAT('%', :query, '%'))))")
    List<Cliente> buscarGlobal(@Param("agenciaId") Long agenciaId, @Param("query") String query, Pageable pageable);

    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId ORDER BY c.ultimoMensajeFecha DESC NULLS LAST")
    List<Cliente> findByAgenciaIdPaginatedByLastMessage(
            @Param("agenciaId") Long agenciaId, Pageable pageable);

    @Query("SELECT c FROM Cliente c JOIN c.etiquetas e WHERE c.agencia.id = :agenciaId AND e.id = :etiquetaId ORDER BY c.ultimoMensajeFecha DESC NULLS LAST")
    List<Cliente> findByAgenciaIdAndEtiquetaIdPaginated(
            @Param("agenciaId") Long agenciaId,
            @Param("etiquetaId") Long etiquetaId,
            Pageable pageable);

    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.etapa.id = :etapaId ORDER BY c.id DESC")
    List<Cliente> findByAgenciaIdAndEtapaId(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            Pageable pageable);

    @Query("""
        SELECT c FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND c.etapa.id   = :etapaId
          AND e.id         = :etiquetaId
        ORDER BY c.id DESC
        """)
    List<Cliente> findByAgenciaIdAndEtapaIdAndEtiquetaId(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("etiquetaId") Long etiquetaId,
            Pageable pageable);

    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.id < :afterId ORDER BY c.id DESC")
    List<Cliente> findByAgenciaIdAndIdLessThan(
            @Param("agenciaId") Long agenciaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    @Query("SELECT c FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.etapa.id = :etapaId AND c.id < :afterId ORDER BY c.id DESC")
    List<Cliente> findByAgenciaIdAndEtapaIdAndIdLessThan(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    @Query("""
        SELECT c FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND e.id         = :etiquetaId
          AND c.id         < :afterId
        ORDER BY c.id DESC
        """)
    List<Cliente> findByAgenciaIdAndEtiquetaIdAndIdLessThan(
            @Param("agenciaId") Long agenciaId,
            @Param("etiquetaId") Long etiquetaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    @Query("""
        SELECT c FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND c.etapa.id   = :etapaId
          AND e.id         = :etiquetaId
          AND c.id         < :afterId
        ORDER BY c.id DESC
        """)
    List<Cliente> findByAgenciaIdAndEtapaIdAndEtiquetaIdAndIdLessThan(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("etiquetaId") Long etiquetaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

}