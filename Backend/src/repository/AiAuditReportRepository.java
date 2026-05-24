package repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import model.AiAuditReport;

public interface AiAuditReportRepository extends JpaRepository<AiAuditReport, Long> {

    List<AiAuditReport> findByAgenciaIdOrderByCreatedAtDesc(Long agenciaId);

    // Orden manual cuando el usuario reordenó (orden NOT NULL ascendente);
    // los reportes sin orden manual caen al final ordenados por fecha desc.
    @Query("SELECT r FROM AiAuditReport r WHERE r.agencia.id = :agenciaId "
            + "ORDER BY CASE WHEN r.orden IS NULL THEN 1 ELSE 0 END, r.orden ASC, r.createdAt DESC")
    List<AiAuditReport> findAllForAgenciaSorted(@Param("agenciaId") Long agenciaId);
}
