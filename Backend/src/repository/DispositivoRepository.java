package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import model.Agencia;
import model.Dispositivo;
import model.Dispositivo.Plataforma;
import model.Dispositivo.Proposito;

@Repository
public interface DispositivoRepository extends JpaRepository<Dispositivo, Long> {

    /**
     * Lock pesimista para serializar mutaciones concurrentes sobre el mismo
     * Dispositivo (desvincular vs. webhook de estado vs. eliminar). Sin esto,
     * dos transacciones pueden cargar la misma fila, hacer UPDATEs encimados
     * y disparar StaleObjectStateException o estados inconsistentes en el
     * sessionId / numeroTelefono / estado.
     *
     * Uso típico: dentro de @Transactional, en operaciones que escriben.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Dispositivo d WHERE d.id = :id")
    Optional<Dispositivo> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Dispositivo d WHERE d.sessionId = :sessionId")
    Optional<Dispositivo> findBySessionIdForUpdate(@Param("sessionId") String sessionId);

    // ── Filtros por propósito (aislamiento del sector /spam) ──────────────────
    // Los devices con propósito CAMPANIAS no aparecen en /whatsapp-vincular ni
    // en los chequeos de conexión del Dashboard: viven solo en /spam.
    List<Dispositivo> findByAgenciaIdAndPlataformaAndVisibleTrueAndProposito(
            Long agenciaId, Plataforma plataforma, Proposito proposito);

    boolean existsByAgenciaIdAndPlataformaAndActivoTrueAndProposito(
            Long agenciaId, Plataforma plataforma, Proposito proposito);

    List<Dispositivo> findByAgenciaId(Long agenciaId);

    List<Dispositivo> findByAgenciaIdAndPlataforma(Long agenciaId, Dispositivo.Plataforma plataforma);

    Optional<Dispositivo> findBySessionId(String sessionId);

    Optional<Dispositivo> findFirstByAgenciaIdAndEstado(Long agenciaId, String estado);

    boolean existsByAgenciaAndPlataforma(Agencia agencia, Dispositivo.Plataforma plataforma);

    long countByAgenciaIdAndPlataformaAndActivoTrue(Long agenciaId, Plataforma plataforma);

    long countByAgenciaIdAndPlataforma(Long agenciaId, Plataforma plataforma);


    List<Dispositivo> findByAgenciaIdAndPlataformaAndActivoTrueOrderByIdAsc(Long agenciaId, Plataforma plataforma);

    long countByAgenciaId(Long agenciaId);

    List<Dispositivo> findByAgenciaIdAndVisibleTrue(Long agenciaId);
    List<Dispositivo> findByAgenciaIdAndPlataformaAndVisibleTrue(Long agenciaId, Plataforma plataforma);

    long countByAgenciaIdAndPlataformaAndVisibleTrue(Long agenciaId, Dispositivo.Plataforma plataforma);
}