package repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

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
import org.springframework.data.jpa.repository.EntityGraph;

@Repository
public interface ClienteRepository extends JpaRepository<Cliente, Long> {

    Optional<Cliente> findByAgenciaIdAndTelefono(Long agenciaId, String telefono);

    @Query("SELECT c.telefono FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.telefono IN :telefonos")
    List<String> findTelefonosExistentes(@Param("agenciaId") Long agenciaId, @Param("telefonos") Collection<String> telefonos);

    Optional<Cliente> findFirstByAgenciaIdAndTelefono(Long agenciaId, String telefono);

    Optional<Cliente> findByTelefono(String telefono);

    List<Cliente> findByAgenciaIdOrderByFechaRegistroDesc(Long agenciaId);

    Page<Cliente> findByAgenciaIdOrderByFechaRegistroDesc(Long agenciaId, Pageable pageable);

    List<Cliente> findByAgenciaIdOrderByUltimoMensajeFechaDesc(Long agenciaId);

    long countByEtapaIdAndAgenciaId(Long etapaId, Long agenciaId);

    @Query("SELECT c.etapa.id, COUNT(c) FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.etapa IS NOT NULL GROUP BY c.etapa.id")
    List<Object[]> countClientesByEtapaAndAgencia(@Param("agenciaId") Long agenciaId);

    long countByAgenciaIdAndFechaRegistroAfter(Long agenciaId, LocalDateTime fecha);

    long countByAgenciaIdAndFechaRegistroBetween(Long agenciaId, LocalDateTime desde, LocalDateTime hasta);

    @Query("SELECT c.dispositivo.plataforma, COUNT(c) FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.fechaRegistro BETWEEN :desde AND :hasta AND c.dispositivo IS NOT NULL GROUP BY c.dispositivo.plataforma")
    List<Object[]> countByPlataformaAndFechaRegistroBetween(@Param("agenciaId") Long agenciaId, @Param("desde") LocalDateTime desde, @Param("hasta") LocalDateTime hasta);

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

    // ─────────────────────────────────────────────────────────────────────
    // Paginacion en dos pasos (listados del Kanban, Contactos y busqueda).
    //
    // Un @EntityGraph que incluye una COLECCION ("etiquetas") combinado con
    // Pageable obliga a Hibernate a traer TODAS las filas que matchean y
    // recortar la pagina en memoria: no puede aplicar LIMIT en SQL sin cortar
    // la coleccion de alguna fila por la mitad. Medido sobre esta misma query:
    // con 300 clientes en la agencia, pedir 40 cargaba 301 entidades + 300
    // colecciones. Escala lineal con el tamano de la agencia, no con la pagina.
    //
    // Solucion: paso 1 trae solo los IDs de la pagina (sin colecciones, con
    // LIMIT real en SQL); paso 2 hidrata esos IDs con el grafo completo y sin
    // Pageable. Da 2 queries de costo fijo en vez de 1 que crece sin techo.
    //
    // Los metodos publicos mantienen nombre y firma: los callers no cambian.
    // ─────────────────────────────────────────────────────────────────────

    /** Paso 2 comun: hidrata una pagina ya resuelta, sin Pageable. */
    @EntityGraph(attributePaths = {"etapa", "dispositivo", "etiquetas"})
    @Query("SELECT c FROM Cliente c WHERE c.id IN :ids")
    List<Cliente> hidratarPorIds(@Param("ids") List<Long> ids);

    /**
     * El IN de hidratarPorIds no conserva el orden del paso 1, asi que se
     * reordena en memoria siguiendo la lista de IDs (a lo sumo `size` items).
     */
    private List<Cliente> enOrdenDeIds(List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Cliente> porId = hidratarPorIds(ids).stream()
                .collect(Collectors.toMap(Cliente::getId, c -> c));
        return ids.stream().map(porId::get).filter(Objects::nonNull).toList();
    }

    @Query("SELECT c.id FROM Cliente c WHERE c.agencia.id = :agenciaId AND (LOWER(c.nombre) LIKE LOWER(CONCAT('%', :query, '%')) OR c.telefono LIKE %:query% OR (c.dispositivo IS NOT NULL AND LOWER(c.dispositivo.alias) LIKE LOWER(CONCAT('%', :query, '%'))))")
    List<Long> idsBuscarGlobal(@Param("agenciaId") Long agenciaId, @Param("query") String query, Pageable pageable);

    default List<Cliente> buscarGlobal(Long agenciaId, String query, Pageable pageable) {
        return enOrdenDeIds(idsBuscarGlobal(agenciaId, query, pageable));
    }

    @Query("SELECT c.id FROM Cliente c WHERE c.agencia.id = :agenciaId ORDER BY c.ultimoMensajeFecha DESC NULLS LAST")
    List<Long> idsByAgenciaOrderByUltimoMensaje(
            @Param("agenciaId") Long agenciaId, Pageable pageable);

    default List<Cliente> findByAgenciaIdPaginatedByLastMessage(Long agenciaId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaOrderByUltimoMensaje(agenciaId, pageable));
    }

    @Query("SELECT c.id FROM Cliente c JOIN c.etiquetas e WHERE c.agencia.id = :agenciaId AND e.id = :etiquetaId ORDER BY c.ultimoMensajeFecha DESC NULLS LAST")
    List<Long> idsByAgenciaAndEtiqueta(
            @Param("agenciaId") Long agenciaId,
            @Param("etiquetaId") Long etiquetaId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtiquetaIdPaginated(
            Long agenciaId, Long etiquetaId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtiqueta(agenciaId, etiquetaId, pageable));
    }

    @Query("SELECT c.id FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.etapa.id = :etapaId ORDER BY c.id DESC")
    List<Long> idsByAgenciaAndEtapa(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtapaId(
            Long agenciaId, Long etapaId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtapa(agenciaId, etapaId, pageable));
    }

    @Query("""
        SELECT c.id FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND c.etapa.id   = :etapaId
          AND e.id         = :etiquetaId
        ORDER BY c.id DESC
        """)
    List<Long> idsByAgenciaAndEtapaAndEtiqueta(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("etiquetaId") Long etiquetaId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtapaIdAndEtiquetaId(
            Long agenciaId, Long etapaId, Long etiquetaId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtapaAndEtiqueta(agenciaId, etapaId, etiquetaId, pageable));
    }

    Optional<Cliente> findByIdAndAgenciaId(Long id, Long agenciaId);

    // Chequeo liviano (sin hidratar la entidad ni la coleccion EAGER de
    // etiquetas) para WebSocketConfig: autorizar suscripcion a /topic/chat/{id}
    // solo si el cliente pertenece a la agencia del usuario conectado.
    boolean existsByIdAndAgenciaId(Long id, Long agenciaId);

    // Variantes con cursor (afterId) del scroll infinito: mismo patron de dos
    // pasos que arriba, por el mismo motivo (EntityGraph con coleccion).

    @Query("SELECT c.id FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.id < :afterId ORDER BY c.id DESC")
    List<Long> idsByAgenciaAfterCursor(
            @Param("agenciaId") Long agenciaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndIdLessThan(
            Long agenciaId, Long afterId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAfterCursor(agenciaId, afterId, pageable));
    }

    @Query("SELECT c.id FROM Cliente c WHERE c.agencia.id = :agenciaId AND c.etapa.id = :etapaId AND c.id < :afterId ORDER BY c.id DESC")
    List<Long> idsByAgenciaAndEtapaAfterCursor(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtapaIdAndIdLessThan(
            Long agenciaId, Long etapaId, Long afterId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtapaAfterCursor(agenciaId, etapaId, afterId, pageable));
    }

    @Query("""
        SELECT c.id FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND e.id         = :etiquetaId
          AND c.id         < :afterId
        ORDER BY c.id DESC
        """)
    List<Long> idsByAgenciaAndEtiquetaAfterCursor(
            @Param("agenciaId") Long agenciaId,
            @Param("etiquetaId") Long etiquetaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtiquetaIdAndIdLessThan(
            Long agenciaId, Long etiquetaId, Long afterId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtiquetaAfterCursor(agenciaId, etiquetaId, afterId, pageable));
    }

    @Query("""
        SELECT c.id FROM Cliente c JOIN c.etiquetas e
        WHERE c.agencia.id = :agenciaId
          AND c.etapa.id   = :etapaId
          AND e.id         = :etiquetaId
          AND c.id         < :afterId
        ORDER BY c.id DESC
        """)
    List<Long> idsByAgenciaAndEtapaAndEtiquetaAfterCursor(
            @Param("agenciaId") Long agenciaId,
            @Param("etapaId") Long etapaId,
            @Param("etiquetaId") Long etiquetaId,
            @Param("afterId") Long afterId,
            Pageable pageable);

    default List<Cliente> findByAgenciaIdAndEtapaIdAndEtiquetaIdAndIdLessThan(
            Long agenciaId, Long etapaId, Long etiquetaId, Long afterId, Pageable pageable) {
        return enOrdenDeIds(idsByAgenciaAndEtapaAndEtiquetaAfterCursor(
                agenciaId, etapaId, etiquetaId, afterId, pageable));
    }

    /**
     * Serie temporal de leads nuevos (por fecha_registro) agrupados por bucket
     * (hour|day|week|month). Devuelve filas [bucket_timestamp, count].
     */
    @Query(value = "SELECT date_trunc(CAST(:unit AS text), fecha_registro) AS bucket, COUNT(*) AS total "
        + "FROM clientes WHERE agencia_id = :agenciaId AND fecha_registro BETWEEN :desde AND :hasta "
        + "GROUP BY bucket ORDER BY bucket", nativeQuery = true)
    List<Object[]> serieLeadsPorBucket(
            @Param("agenciaId") Long agenciaId,
            @Param("unit") String unit,
            @Param("desde") LocalDateTime desde,
            @Param("hasta") LocalDateTime hasta);

}