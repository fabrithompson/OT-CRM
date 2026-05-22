package repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.AgentConfig;

@Repository
public interface AgentConfigRepository extends JpaRepository<AgentConfig, Long> {

    Optional<AgentConfig> findByAgenciaId(Long agenciaId);

    List<AgentConfig> findByAuditEnabledTrue();
}
