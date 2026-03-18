package repository;

import org.springframework.data.jpa.repository.JpaRepository;

import model.ProcessedWebhook;

public interface ProcessedWebhookRepository extends JpaRepository<ProcessedWebhook, String> {
}
