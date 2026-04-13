package repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import model.Transaccion;

@Repository
public interface TransaccionRepository extends JpaRepository<Transaccion, Long> {

    List<Transaccion> findAllByOrderByFechaDesc();
    void deleteByClienteId(Long clienteId);

    @Query("SELECT COALESCE(SUM(t.monto), 0.0) FROM Transaccion t WHERE t.usuario.agencia.id = :agenciaId AND t.tipo = :tipo")
    Double sumMontoByAgenciaIdAndTipo(@Param("agenciaId") Long agenciaId, @Param("tipo") String tipo);

    @Query("SELECT t FROM Transaccion t WHERE t.usuario.agencia.id = :agenciaId ORDER BY t.fecha DESC")
    List<Transaccion> findTop5ByAgenciaId(@Param("agenciaId") Long agenciaId, org.springframework.data.domain.Pageable pageable);
}
