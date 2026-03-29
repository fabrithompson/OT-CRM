import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import model.Agencia;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;
import service.CloudStorageService;
import service.PlanService;
import service.TelegramBridgeService;
import service.WhatsAppService;

/**
 * Tests de integración para PlanService.
 * Verifica que activarPlanPorPago, cambiarPlan y cancelarPlanPorSuscripcion
 * actualicen correctamente la BD — sin depender de APIs externas de pago.
 */
class PlanServiceIntegrationTest extends BaseIntegrationTest {

    @Autowired PlanService planService;
    @Autowired PlanRepository planRepo;
    @Autowired UsuarioRepository usuarioRepo;
    @Autowired AgenciaRepository agenciaRepo;

    @MockitoBean CloudStorageService cloudStorageService;
    @MockitoBean TelegramBridgeService telegramBridgeService;
    @MockitoBean WhatsAppService whatsAppService;

    private Agencia agencia;
    private Usuario admin;
    private Plan planFree;
    private Plan planPro;

    @SuppressWarnings("null")
    @BeforeEach
    void setUp() {
        agencia = agenciaRepo.save(new Agencia("PlanTestAgency_" + System.nanoTime(), "PT_" + System.nanoTime()));

        planFree = planRepo.findByNombre("FREE").orElseThrow();
        planPro  = planRepo.findByNombre("PRO").orElseThrow();

        admin = new Usuario();
        admin.setUsername("admin_plan_" + System.nanoTime());
        admin.setPassword("$2a$10$dummyhashvalue1234567890123456");
        admin.setEmail("adminplan" + System.nanoTime() + "@test.com");
        admin.setRol("ADMIN");
        admin.setAgencia(agencia);
        admin.setPlan(planFree);
        admin.setVerificado(true);
        admin = usuarioRepo.save(admin);
    }

    // ── activarPlanPorPago ──────────────────────────────────────────────────────

    @Test
    @DisplayName("activarPlanPorPago actualiza plan, vencimiento y proveedorPago del usuario")
    @SuppressWarnings("null")
    void activarPlanPorPagoActualizaUsuario() {
        planService.activarPlanPorPago(admin.getId(), planPro.getId(), "Mercado Pago");

        Usuario actualizado = usuarioRepo.findById(admin.getId()).orElseThrow();
        assertThat(actualizado.getPlan().getNombre()).isEqualTo("PRO");
        assertThat(actualizado.getProveedorPago()).isEqualTo("Mercado Pago");
        assertThat(actualizado.getPlanVencimiento())
                .isAfterOrEqualTo(LocalDate.now().plusDays(29))
                .isBeforeOrEqualTo(LocalDate.now().plusMonths(1).plusDays(1));
    }

    @Test
    @DisplayName("activarPlanPorPago con usuarioId inexistente lanza excepcion")
    void activarPlanUsuarioInexistenteLanzaExcepcion() {
        assertThatThrownBy(() -> planService.activarPlanPorPago(99999L, planPro.getId(), "Mercado Pago"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("activarPlanPorPago con planId inexistente lanza excepcion")
    void activarPlanPlanInexistenteLanzaExcepcion() {
        assertThatThrownBy(() -> planService.activarPlanPorPago(admin.getId(), 99999L, "Mercado Pago"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("activarPlanPorPago propaga plan a todos los miembros del equipo")
    @SuppressWarnings("null")
    void activarPlanPropagaAEquipo() {
        // Agregar un agente al equipo
        Usuario agente = new Usuario();
        agente.setUsername("agente_" + System.nanoTime());
        agente.setPassword("$2a$10$dummyhashvalue1234567890123456");
        agente.setEmail("agente" + System.nanoTime() + "@test.com");
        agente.setRol("AGENTE");
        agente.setAgencia(agencia);
        agente.setPlan(planFree);
        agente.setVerificado(true);
        agente = usuarioRepo.save(agente);
        final Long agenteId = agente.getId();

        planService.activarPlanPorPago(admin.getId(), planPro.getId(), "Mercado Pago");

        Usuario agenteActualizado = usuarioRepo.findById(agenteId).orElseThrow();
        assertThat(agenteActualizado.getPlan().getNombre())
                .as("El agente debe recibir el mismo plan que el admin")
                .isEqualTo("PRO");
    }

    // ── cambiarPlan ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("cambiarPlan a FREE limpia vencimiento y proveedorPago")
    @SuppressWarnings("null")
    void cambiarPlanAFreeLimpiaVencimiento() {
        // Primero activar un plan de pago
        planService.activarPlanPorPago(admin.getId(), planPro.getId(), "Mercado Pago");

        // Luego degradar a FREE
        planService.cambiarPlan(admin.getId(), planFree.getId());

        Usuario actualizado = usuarioRepo.findById(admin.getId()).orElseThrow();
        assertThat(actualizado.getPlan().getNombre()).isEqualTo("FREE");
        assertThat(actualizado.getPlanVencimiento()).isNull();
        assertThat(actualizado.getProveedorPago()).isNull();
    }

    // ── cancelarPlanPorSuscripcion ───────────────────────────────────────────────

    @Test
    @DisplayName("cancelarPlanPorSuscripcion degrada a FREE y limpia metadatos de pago")
    @SuppressWarnings("null")
    void cancelarSuscripcionDegradaAFree() {
        // Partir de PRO
        planService.activarPlanPorPago(admin.getId(), planPro.getId(), "PayPal");

        planService.cancelarPlanPorSuscripcion(admin.getId());

        Usuario actualizado = usuarioRepo.findById(admin.getId()).orElseThrow();
        assertThat(actualizado.getPlan().getNombre()).isEqualTo("FREE");
        assertThat(actualizado.getPlanVencimiento()).isNull();
        assertThat(actualizado.getProveedorPago()).isNull();
    }
}
