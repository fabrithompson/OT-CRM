package controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpStatusCodeException;

import model.Plan;
import model.Usuario;
import repository.PlanRepository;
import repository.UsuarioRepository;
import service.CurrencyService;
import service.PayPalService;

@RestController
public class PayPalController {

    private static final Logger log = LoggerFactory.getLogger(PayPalController.class);

    private final CurrencyService currencyService;
    private final PayPalService payPalService;
    private final PlanRepository planRepository;
    private final UsuarioRepository usuarioRepository;

    public PayPalController(CurrencyService currencyService,
                            PayPalService payPalService,
                            PlanRepository planRepository,
                            UsuarioRepository usuarioRepository) {
        this.currencyService = currencyService;
        this.payPalService = payPalService;
        this.planRepository = planRepository;
        this.usuarioRepository = usuarioRepository;
    }

    @PostMapping("/api/paypal/crear-suscripcion")
    public ResponseEntity<?> crearSuscripcion(@RequestParam Long planId,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        try {
            Usuario usuario = usuarioRepository.findByUsername(userDetails.getUsername())
                    .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
            @SuppressWarnings("null")
            Plan plan = planRepository.findById(planId)
                    .orElseThrow(() -> new IllegalArgumentException("Plan no encontrado"));

            if (plan.getPaypalPlanId() == null || plan.getPaypalPlanId().isBlank()) {
                log.warn("Plan {} (ID: {}) no tiene paypalPlanId configurado", plan.getNombre(), plan.getId());
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "PayPal no está configurado para el plan " + plan.getNombre() + ". Usá Mercado Pago o contactá al administrador."
                ));
            }

            double precioArs = plan.getPrecioMensual();
            double precioUsd = currencyService.convertirArsToUsd(precioArs);

            String approvalUrl = payPalService.obtenerLinkSuscripcion(usuario, plan);

            if (approvalUrl != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("paypalUrl", approvalUrl);
                response.put("montoUsd", precioUsd);
                response.put("planNombre", plan.getNombre());
                response.put("customId", usuario.getId() + "|" + plan.getId());

                return ResponseEntity.ok(response);
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", "No se pudo generar el link de PayPal. Intentá de nuevo."));
            }

        } catch (HttpStatusCodeException e) {
            log.error("PayPal API Error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode()).body(Map.of(
                "error", "PayPal rechazó la solicitud. Verificá la configuración del plan."
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error inesperado al crear suscripción PayPal: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", "Error al conectar con PayPal: " + e.getMessage()
            ));
        }
    }
}