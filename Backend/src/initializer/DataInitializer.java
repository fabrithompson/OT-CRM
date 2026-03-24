package initializer;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import model.Agencia;
import model.Plan;
import model.Usuario;
import repository.AgenciaRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;

@Component
@Order(1)
public class DataInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);
    private static final String CODIGO_PRINCIPAL = "PRINCIPAL";
    private static final String NOMBRE_AGENCIA_PRINCIPAL = "Agencia Principal";

    private final UsuarioRepository usuarioRepository;
    private final AgenciaRepository agenciaRepository;
    private final PasswordEncoder passwordEncoder;
    private final String defaultAdminPassword;
    private final String defaultAdminEmail;

    @Value("${mercadopago.access.token:}")
    private String mpAccessToken;

    @Value("${plan.price.pro:15000.0}")
    private double planPricePro;

    @Value("${plan.price.business:30000.0}")
    private double planPriceBusiness;

    @Value("${plan.price.enterprise:60000.0}")
    private double planPriceEnterprise;

    @Value("${app.base.url}")
    private String baseUrl;

    @Autowired
    private PlanRepository planRepository;

    public DataInitializer(UsuarioRepository usuarioRepository,
            AgenciaRepository agenciaRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.default-admin.password}") String defaultAdminPassword,
            @Value("${app.default-admin.email:admin@example.com}") String defaultAdminEmail) {
        this.usuarioRepository = usuarioRepository;
        this.agenciaRepository = agenciaRepository;
        this.passwordEncoder = passwordEncoder;
        this.defaultAdminPassword = defaultAdminPassword;
        this.defaultAdminEmail = defaultAdminEmail;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        inicializarPlanes();
        sincronizarPlanesConMP();

        if (hayDatosExistentes()) {
            logger.info("Datos de usuario encontrados. Saltando inicializacion.");
            asignarPlanFreeAUsuariosSinPlan();
            return;
        }

        logger.info("DB vacia detectada. Iniciando carga de datos iniciales...");
        crearDatosIniciales();
    }

    @SuppressWarnings("null")
    private void inicializarPlanes() {
        if (planRepository.count() == 0) {
            logger.info("Creando planes de suscripcion en DB...");
            planRepository.saveAll(List.of(
                new Plan("FREE",       1,  25,            0.0, "Plan gratuito"),
                new Plan("PRO",        5,  75,   planPricePro, "Plan profesional"),
                new Plan("BUSINESS",  10, 250, planPriceBusiness, "Plan empresarial"),
                new Plan("ENTERPRISE", -1, -1, planPriceEnterprise, "Plan Ilimitado")
            ));
            logger.info("Planes creados exitosamente.");
        }
    }

    @SuppressWarnings({ "unchecked", "null" })
    private void sincronizarPlanesConMP() {
        if (mpAccessToken == null || mpAccessToken.isBlank() || mpAccessToken.startsWith("APP_USR-TU")) {
            logger.warn("MP Access Token no configurado. Saltando sincronizacion con MercadoPago.");
            return;
        }

        List<Plan> planesPagos = planRepository.findAll().stream()
                .filter(p -> p.getPrecioMensual() > 0)
                .filter(p -> p.getMpPlanId() == null || p.getMpPlanId().isBlank())
                .toList();

        if (planesPagos.isEmpty()) {
            logger.info("Todos los planes ya estan sincronizados con MercadoPago.");
            return;
        }

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(mpAccessToken);

        for (Plan plan : planesPagos) {
            try {
                Map<String, Object> autoRecurring = Map.of(
                    "frequency",          1,
                    "frequency_type",     "months",
                    "transaction_amount", plan.getPrecioMensual(),
                    "currency_id",        "ARS"
                );
                Map<String, Object> body = Map.of(
                    "reason",         "CRM OT - Plan " + plan.getNombre(),
                    "auto_recurring", autoRecurring,
                    "back_url",       baseUrl + "/planes?pago=exitoso"
                );

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

                ResponseEntity<Map<String, Object>> response = (ResponseEntity<Map<String, Object>>)
                        (ResponseEntity<?>) restTemplate.exchange(
                                "https://api.mercadopago.com/preapproval_plan",
                                HttpMethod.POST, request, Map.class
                        );

                Map<String, Object> respBody = response.getBody();
                if (respBody == null) {
                    logger.error("Respuesta vacia de MP para plan '{}'", plan.getNombre());
                    continue;
                }

                String mpPlanId = (String) respBody.get("id");
                plan.setMpPlanId(mpPlanId);
                planRepository.save(plan);

                logger.info("Plan '{}' creado en MP con ID: {}", plan.getNombre(), mpPlanId);

            } catch (RestClientException | IllegalArgumentException e) {
                logger.error("Error creando plan '{}' en MP: {}", plan.getNombre(), e.getMessage());
            }
        }
    }

    private void asignarPlanFreeAUsuariosSinPlan() {
        Plan planFree = planRepository.findByNombre("FREE").orElse(null);
        if (planFree == null) return;

        List<Usuario> sinPlan = usuarioRepository.findAll().stream()
                .filter(u -> u.getPlan() == null)
                .toList();

        if (!sinPlan.isEmpty()) {
            sinPlan.forEach(u -> u.setPlan(planFree));
            usuarioRepository.saveAll(sinPlan);
            logger.info("Plan FREE asignado a {} usuarios sin plan.", sinPlan.size());
        }
    }

    private boolean hayDatosExistentes() {
        return agenciaRepository.findByCodigoInvitacion(CODIGO_PRINCIPAL).isPresent()
                || usuarioRepository.findByUsername("admin").isPresent();
    }

    private void crearDatosIniciales() {
        logger.info("Creando Agencia Principal...");
        Agencia nuevaAgencia = new Agencia(NOMBRE_AGENCIA_PRINCIPAL, CODIGO_PRINCIPAL);
        nuevaAgencia = agenciaRepository.save(nuevaAgencia);

        Plan planFree = planRepository.findByNombre("FREE")
                .orElseThrow(() -> new IllegalStateException("Plan FREE no encontrado"));

        logger.info("Creando usuario Admin...");
        Usuario admin = new Usuario("admin", passwordEncoder.encode(defaultAdminPassword), "OWNER");
        admin.setEmail(defaultAdminEmail);
        admin.setVerificado(true);
        admin.setAgencia(nuevaAgencia);
        admin.setPlan(planFree);

        usuarioRepository.save(admin);
        logger.info("Inicializacion completada!");
    }
}