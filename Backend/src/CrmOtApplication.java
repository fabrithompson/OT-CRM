import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

import jakarta.annotation.PostConstruct;

@SpringBootApplication(scanBasePackages = {
    "config", "controller", "security", "service",
    "model", "repository", "listener", "exception", "dto", "initializer"
})
@EnableJpaRepositories(basePackages = "repository")
@EntityScan(basePackages = "model")
@EnableScheduling
public class CrmOtApplication {

    public static void main(String[] args) {
        SpringApplication.run(CrmOtApplication.class, args);
    }

    @PostConstruct
    public void init() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/Argentina/Buenos_Aires"));
    }
}