package repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import model.AuditStage;

public interface AuditStageRepository extends JpaRepository<AuditStage, Long> {

    @Query("SELECT s FROM AuditStage s WHERE s.agentConfig.id = :configId AND s.activa = true ORDER BY s.orden ASC, s.id ASC")
    List<AuditStage> findActiveByAgentConfigId(Long configId);

    @Query("SELECT s FROM AuditStage s WHERE s.agentConfig.id = :configId ORDER BY s.orden ASC, s.id ASC")
    List<AuditStage> findAllByAgentConfigId(Long configId);

    long countByAgentConfigId(Long configId);
}
