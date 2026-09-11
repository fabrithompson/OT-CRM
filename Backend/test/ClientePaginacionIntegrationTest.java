import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import model.Agencia;
import model.Cliente;
import model.Etiqueta;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.EtiquetaRepository;

/**
 * Guarda de regresion de performance para los listados de clientes.
 *
 * Un @EntityGraph que incluye la coleccion "etiquetas" junto con un Pageable
 * hace que Hibernate traiga TODAS las filas que matchean y recorte la pagina en
 * memoria (no puede poner LIMIT en SQL sin cortar la coleccion de una fila).
 * Antes del fix, pedir 40 clientes en una agencia de 300 cargaba 301 entidades
 * y 300 colecciones; el costo crecia con el tamano de la agencia, no con el de
 * la pagina, y era la causa principal de lentitud del Kanban.
 *
 * Estos tests fallan si alguien vuelve a meter una coleccion en el @EntityGraph
 * de una query paginada.
 */
@Transactional
class ClientePaginacionIntegrationTest extends BaseIntegrationTest {

    @Autowired AgenciaRepository agenciaRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired EtiquetaRepository etiquetaRepo;
    @Autowired EntityManager em;

    private static final int TOTAL_CLIENTES = 300;
    private static final int PAGE_SIZE = 40;
    /** Margen sobre PAGE_SIZE: la pagina + la agencia + algun proxy suelto. */
    private static final int TECHO_ENTIDADES = PAGE_SIZE * 2;

    private Agencia agencia;
    private Etiqueta etiqueta;

    @BeforeEach
    void setUp() {
        agencia = agenciaRepo.save(new Agencia("PerfAgency_" + System.nanoTime(), "PA_" + System.nanoTime()));
        etiqueta = etiquetaRepo.save(new Etiqueta("VIP", agencia));

        LocalDateTime base = LocalDateTime.now();
        for (int i = 0; i < TOTAL_CLIENTES; i++) {
            Cliente c = new Cliente("Cliente " + i, "54911" + String.format("%08d", i), null, null);
            c.setAgencia(agencia);
            c.setFechaRegistro(base.minusMinutes(i));
            c.setUltimoMensajeFecha(base.minusMinutes(i));
            c.getEtiquetas().add(etiqueta);
            clienteRepo.save(c);
        }
        em.flush();
        em.clear();
    }

    private Statistics statsLimpias() {
        SessionFactory sf = em.getEntityManagerFactory().unwrap(SessionFactory.class);
        Statistics stats = sf.getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();
        return stats;
    }

    @Test
    @DisplayName("El listado del Kanban pagina en SQL: no carga toda la agencia para devolver una pagina")
    void listadoPorUltimoMensajeNoCargaTodaLaAgencia() {
        Statistics stats = statsLimpias();

        List<Cliente> page = clienteRepo.findByAgenciaIdPaginatedByLastMessage(
                agencia.getId(), PageRequest.of(0, PAGE_SIZE, Sort.by(Sort.Direction.DESC, "id")));

        assertThat(page).hasSize(PAGE_SIZE);
        assertThat(stats.getEntityLoadCount())
                .as("cargo %d entidades para devolver %d: la paginacion volvio a hacerse en memoria",
                        stats.getEntityLoadCount(), PAGE_SIZE)
                .isLessThanOrEqualTo(TECHO_ENTIDADES);
        assertThat(stats.getCollectionLoadCount())
                .as("cargo las etiquetas de toda la agencia en vez de las de la pagina")
                .isLessThanOrEqualTo(TECHO_ENTIDADES);
    }

    @Test
    @DisplayName("El listado filtrado por etiqueta tambien pagina en SQL")
    void listadoPorEtiquetaNoCargaTodaLaAgencia() {
        Statistics stats = statsLimpias();

        List<Cliente> page = clienteRepo.findByAgenciaIdAndEtiquetaIdPaginated(
                agencia.getId(), etiqueta.getId(),
                PageRequest.of(0, PAGE_SIZE, Sort.by(Sort.Direction.DESC, "id")));

        assertThat(page).hasSize(PAGE_SIZE);
        assertThat(stats.getEntityLoadCount()).isLessThanOrEqualTo(TECHO_ENTIDADES);
    }

    @Test
    @DisplayName("La pagina mantiene el orden por ultimo mensaje y trae las etiquetas resueltas")
    void paginaConservaOrdenYEtiquetas() {
        List<Cliente> page = clienteRepo.findByAgenciaIdPaginatedByLastMessage(
                agencia.getId(), PageRequest.of(0, PAGE_SIZE, Sort.by(Sort.Direction.DESC, "id")));

        assertThat(page).hasSize(PAGE_SIZE);
        // Los clientes se crearon con ultimoMensajeFecha decreciente, asi que la
        // primera pagina tiene que ser la de los mensajes mas recientes.
        assertThat(page.get(0).getNombre()).isEqualTo("Cliente 0");
        assertThat(page).isSortedAccordingTo(
                (a, b) -> b.getUltimoMensajeFecha().compareTo(a.getUltimoMensajeFecha()));
        // El paso 2 tiene que dejar las etiquetas ya hidratadas (sin esto, el
        // frontend las perderia o dispararia un N+1 al serializar).
        assertThat(page).allSatisfy(c -> assertThat(c.getEtiquetas()).hasSize(1));
    }

    @Test
    @DisplayName("El cursor afterId devuelve la pagina siguiente sin solaparse")
    void cursorAfterIdNoSeSolapa() {
        // El cursor se recorre siempre por id descendente, asi que la prueba
        // arranca del tope (Long.MAX_VALUE) en vez de encadenar desde la pagina
        // ordenada por ultimoMensajeFecha: ese listado devuelve justo los
        // clientes de id mas bajo, y pedir "los id menores a ese" dejaria menos
        // de una pagina por debajo.
        List<Cliente> primera = clienteRepo.findByAgenciaIdAndIdLessThan(
                agencia.getId(), Long.MAX_VALUE, PageRequest.of(0, PAGE_SIZE));
        assertThat(primera).hasSize(PAGE_SIZE);
        assertThat(primera).isSortedAccordingTo((a, b) -> b.getId().compareTo(a.getId()));

        Long cursor = primera.get(primera.size() - 1).getId();
        List<Cliente> segunda = clienteRepo.findByAgenciaIdAndIdLessThan(
                agencia.getId(), cursor, PageRequest.of(0, PAGE_SIZE));

        assertThat(segunda).hasSize(PAGE_SIZE);
        assertThat(segunda).allSatisfy(c -> assertThat(c.getId()).isLessThan(cursor));
        // Sin solapamiento entre paginas consecutivas.
        assertThat(segunda).noneMatch(c -> primera.stream().anyMatch(p -> p.getId().equals(c.getId())));
    }

    @Test
    @DisplayName("El cursor tampoco carga toda la agencia para devolver una pagina")
    void cursorNoCargaTodaLaAgencia() {
        Statistics stats = statsLimpias();

        List<Cliente> page = clienteRepo.findByAgenciaIdAndIdLessThan(
                agencia.getId(), Long.MAX_VALUE, PageRequest.of(0, PAGE_SIZE));

        assertThat(page).hasSize(PAGE_SIZE);
        assertThat(stats.getEntityLoadCount()).isLessThanOrEqualTo(TECHO_ENTIDADES);
    }
}
