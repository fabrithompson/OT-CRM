import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Clase base para tests de integracion.
 * Levanta un PostgreSQL real en Docker via Testcontainers.
 * La BD se crea al iniciar y se destruye al terminar — no toca produccion ni desarrollo.
 *
 * Para correr los tests necesitas Docker corriendo en tu maquina.
 *
 * Usa el patron singleton: un unico contenedor PostgreSQL compartido por todos los tests,
 * evitando que Spring reutilice un contexto con la URL del contenedor anterior ya destruido.
 */
@SuppressWarnings("resource")
@SpringBootTest(classes = CrmOtApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
public abstract class BaseIntegrationTest {

    static PostgreSQLContainer<?> postgres;

    static {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine")
                .withDatabaseName("crm_test")
                .withUsername("test")
                .withPassword("test");
        postgres.start();
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    /** Espera a que los hilos async del controller terminen de procesar. */
    protected void esperarAsync(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
