package repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import model.AiConversationState;

@Repository
public interface AiConversationStateRepository extends JpaRepository<AiConversationState, Long> {

    Optional<AiConversationState> findByClienteId(Long clienteId);
}
