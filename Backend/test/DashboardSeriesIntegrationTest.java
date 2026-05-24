import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import model.Agencia;
import model.Cliente;
import model.Mensaje;
import model.Transaccion;
import model.Usuario;
import repository.AgenciaRepository;
import repository.ClienteRepository;
import repository.MensajeRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import service.DashboardService;

/**
 * Tests de integración para DashboardService.getSeries — el endpoint que alimenta
 * los sparklines y el gráfico de tendencia del dashboard con datos REALES
 * (reemplazó a los generadores sintéticos Math.sin del frontend).
 *
 * Verifica que las series reflejen exactamente los datos insertados en la BD.
 *
 * @Transactional: cada test corre en una transacción que se revierte al terminar,
 * dejando la BD limpia para los demás tests (evita que las transacciones creadas
 * bloqueen el deleteAll() de clientes en otros tests de la suite compartida).
 */
@Transactional
class DashboardSeriesIntegrationTest extends BaseIntegrationTest {

    @Autowired DashboardService dashboardService;
    @Autowired AgenciaRepository agenciaRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired ClienteRepository clienteRepo;
    @Autowired MensajeRepository mensajeRepo;
    @Autowired TransaccionRepository transaccionRepo;

    private Usuario admin;
    private Agencia agencia;

    @BeforeEach
    void setUp() {
        agencia = agenciaRepo.save(new Agencia("SeriesAgency_" + System.nanoTime(), "SA_" + System.nanoTime()));

        admin = new Usuario();
        admin.setUsername("admin_series_" + System.nanoTime());
        admin.setPassword("$2a$10$dummyhashvalue1234567890123456");
        admin.setEmail("series" + System.nanoTime() + "@test.com");
        admin.setRol("ADMIN");
        admin.setAgencia(agencia);
        admin.setVerificado(true);
        admin = usuarioRepo.save(admin);
    }

    @SuppressWarnings({ "unchecked", "null" })
    @Test
    @DisplayName("getSeries refleja leads, mensajes e ingresos reales en los buckets del período")
    void getSeriesReflejaDatosReales() {
        LocalDateTime ahora = LocalDateTime.now();

        // 2 leads creados hoy
        Cliente c1 = nuevoCliente("Lead 1", "5491100000001", ahora);
        nuevoCliente("Lead 2", "5491100000002", ahora);

        // 3 mensajes entrantes hoy para c1
        for (int i = 0; i < 3; i++) {
            Mensaje m = new Mensaje("hola " + i, false, c1, null);
            m.setFechaHora(ahora);
            mensajeRepo.save(m);
        }

        // 2 cargas hoy: 100 + 50 = 150. Seteamos fecha explícita: el constructor
        // de Transaccion usa now(), que sería posterior al 'hasta' del rango.
        transaccionRepo.save(nuevaTransaccion(c1, 100.0, "CARGA", ahora));
        transaccionRepo.save(nuevaTransaccion(c1, 50.0,  "CARGA", ahora));
        // 1 retiro que NO debe contar como ingreso
        transaccionRepo.save(nuevaTransaccion(c1, 30.0,  "RETIRO", ahora));

        LocalDateTime inicioSemana = ahora
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).with(LocalTime.MIN);

        Map<String, Object> res = dashboardService.getSeries(admin, "sem", inicioSemana, ahora);
        List<Map<String, Object>> buckets = (List<Map<String, Object>>) res.get("buckets");

        // "sem" => 7 buckets (Lun..Dom)
        assertThat(buckets).hasSize(7);
        assertThat(buckets.get(0).get("label")).isEqualTo("Lun");

        long totalLeads    = buckets.stream().mapToLong(b -> ((Number) b.get("leads")).longValue()).sum();
        long totalMensajes = buckets.stream().mapToLong(b -> ((Number) b.get("mensajes")).longValue()).sum();
        long totalIngresos = buckets.stream().mapToLong(b -> ((Number) b.get("ingresos")).longValue()).sum();

        assertThat(totalLeads).isEqualTo(2);
        assertThat(totalMensajes).isEqualTo(3);
        assertThat(totalIngresos).isEqualTo(150); // retiro excluido
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("getSeries devuelve buckets en cero cuando no hay datos")
    void getSeriesSinDatos() {
        LocalDateTime ahora = LocalDateTime.now();
        LocalDateTime inicioSemana = ahora
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).with(LocalTime.MIN);

        Map<String, Object> res = dashboardService.getSeries(admin, "sem", inicioSemana, ahora);
        List<Map<String, Object>> buckets = (List<Map<String, Object>>) res.get("buckets");

        assertThat(buckets).hasSize(7);
        assertThat(buckets).allSatisfy(b -> {
            assertThat(((Number) b.get("leads")).longValue()).isZero();
            assertThat(((Number) b.get("mensajes")).longValue()).isZero();
            assertThat(((Number) b.get("ingresos")).longValue()).isZero();
        });
    }

    private Cliente nuevoCliente(String nombre, String telefono, LocalDateTime fecha) {
        Cliente c = new Cliente(nombre, telefono, null, null);
        c.setAgencia(agencia);
        c.setFechaRegistro(fecha);
        return clienteRepo.save(c);
    }

    private Transaccion nuevaTransaccion(Cliente cliente, double monto, String tipo, LocalDateTime fecha) {
        Transaccion t = new Transaccion(cliente, admin, monto, tipo);
        t.setFecha(fecha);
        return t;
    }
}
