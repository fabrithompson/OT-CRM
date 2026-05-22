package repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import model.AiAuditReport;

public interface AiAuditReportRepository extends JpaRepository<AiAuditReport, Long> {

    List<AiAuditReport> findByAgenciaIdOrderByCreatedAtDesc(Long agenciaId);
}
