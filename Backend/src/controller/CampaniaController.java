package controller;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import model.Agencia;
import model.ContactoCampania;
import model.Dispositivo;
import model.MensajeCampania;
import model.PlantillaCampania;
import model.Usuario;
import repository.DispositivoRepository;
import repository.PlantillaCampaniaRepository;
import repository.UsuarioRepository;
import service.CampaniaService;
import service.PlanService;
import service.SubscriptionValidationService;
import service.WhatsAppService;
import util.DispositivoMapper;

/**
 * Endpoints del módulo /spam. Todos los endpoints exigen autenticación JWT
 * y validan que el dispositivo/contacto/plantilla pertenezca a la agencia
 * del usuario logueado (multi-tenant).
 */
@RestController
@RequestMapping("/api/v1/campania")
public class CampaniaController {

    private static final Logger log = LoggerFactory.getLogger(CampaniaController.class);

    private final UsuarioRepository usuarioRepo;
    private final DispositivoRepository dispositivoRepo;
    private final PlantillaCampaniaRepository plantillaRepo;
    private final CampaniaService campaniaService;
    private final WhatsAppService whatsAppService;
    private final PlanService planService;
    private final SubscriptionValidationService subscriptionValidationService;

    public CampaniaController(UsuarioRepository usuarioRepo,
                              DispositivoRepository dispositivoRepo,
                              PlantillaCampaniaRepository plantillaRepo,
                              CampaniaService campaniaService,
                              WhatsAppService whatsAppService,
                              PlanService planService,
                              SubscriptionValidationService subscriptionValidationService) {
        this.usuarioRepo = usuarioRepo;
        this.dispositivoRepo = dispositivoRepo;
        this.plantillaRepo = plantillaRepo;
        this.campaniaService = campaniaService;
        this.whatsAppService = whatsAppService;
        this.planService = planService;
        this.subscriptionValidationService = subscriptionValidationService;
    }

    // ════════════════════════════════════════════════════════════════════════
    // DISPOSITIVOS CAMPAÑA
    // ════════════════════════════════════════════════════════════════════════

    public record CreateDeviceRequest(String alias) {}

    @GetMapping("/devices")
    public ResponseEntity<List<Map<String, Object>>> listarDevices(@AuthenticationPrincipal UserDetails ud) {
        Agencia agencia = requireAgencia(ud);
        List<Map<String, Object>> dtos = dispositivoRepo
                .findByAgenciaIdAndPlataformaAndVisibleTrue(agencia.getId(), Dispositivo.Plataforma.WHATSAPP)
                .stream()
                .filter(d -> d.getProposito() == Dispositivo.Proposito.CAMPANIAS)
                .map(DispositivoMapper::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/devices")
    public ResponseEntity<?> crearDevice(@AuthenticationPrincipal UserDetails ud,
                                         @RequestBody CreateDeviceRequest body) {
        Usuario usuario = requireUsuario(ud);
        Agencia agencia = requireAgencia(ud);
        if (!subscriptionValidationService.puedeUsarCampanias(agencia)) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of("error", "Tu plan no incluye Campañas. Actualizá a PRO o superior."));
        }
        if (!planService.puedeConectarDispositivo(
                usuario.getId(), Dispositivo.Plataforma.WHATSAPP, Dispositivo.Proposito.CAMPANIAS)) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of("error", "Límite de dispositivos de campañas alcanzado para tu plan."));
        }
        String alias = (body.alias() == null || body.alias().isBlank()) ? "Spam" : body.alias();
        Dispositivo d = whatsAppService.crearDispositivoConProposito(
                agencia, alias, Dispositivo.Proposito.CAMPANIAS);
        return ResponseEntity.ok(DispositivoMapper.toDto(d));
    }

    @DeleteMapping("/devices/{deviceId}")
    public ResponseEntity<?> eliminarDevice(@AuthenticationPrincipal UserDetails ud,
                                            @PathVariable @NonNull Long deviceId) {
        Dispositivo d = requireDeviceCampania(ud, deviceId);
        whatsAppService.eliminarDispositivoCompleto(d.getId());
        return ResponseEntity.ok(Map.of("message", "Eliminado"));
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONTACTOS
    // ════════════════════════════════════════════════════════════════════════

    @PostMapping("/devices/{deviceId}/contactos/import")
    public ResponseEntity<?> importarContactos(@AuthenticationPrincipal UserDetails ud,
                                               @PathVariable @NonNull Long deviceId,
                                               @RequestParam("file") MultipartFile file) {
        try {
            Dispositivo d = requireDeviceCampania(ud, deviceId);
            Map<String, Object> resumen = campaniaService.importarContactosDesdeExcel(
                    d, d.getAgencia(), file);
            return ResponseEntity.ok(resumen);
        } catch (Exception e) {
            log.error("Error importando contactos campaña: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/devices/{deviceId}/contactos")
    public ResponseEntity<List<Map<String, Object>>> listarContactos(@AuthenticationPrincipal UserDetails ud,
                                                                      @PathVariable @NonNull Long deviceId) {
        Dispositivo d = requireDeviceCampania(ud, deviceId);
        List<Map<String, Object>> contactos = campaniaService.listarContactos(d.getId()).stream()
                .map(this::contactoToDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(contactos);
    }

    @DeleteMapping("/contactos/{contactoId}")
    public ResponseEntity<?> eliminarContacto(@AuthenticationPrincipal UserDetails ud,
                                              @PathVariable @NonNull Long contactoId) {
        Agencia agencia = requireAgencia(ud);
        campaniaService.eliminarContacto(contactoId, agencia.getId());
        return ResponseEntity.ok(Map.of("message", "Eliminado"));
    }

    // ════════════════════════════════════════════════════════════════════════
    // PLANTILLAS
    // ════════════════════════════════════════════════════════════════════════

    public record CreatePlantillaRequest(String nombre, String cuerpo) {}

    @GetMapping("/plantillas")
    public ResponseEntity<List<Map<String, Object>>> listarPlantillas(@AuthenticationPrincipal UserDetails ud) {
        Agencia agencia = requireAgencia(ud);
        List<Map<String, Object>> plantillas = campaniaService.listarPlantillas(agencia.getId()).stream()
                .map(this::plantillaToDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(plantillas);
    }

    @PostMapping("/plantillas")
    public ResponseEntity<?> crearPlantilla(@AuthenticationPrincipal UserDetails ud,
                                            @RequestBody CreatePlantillaRequest body) {
        if (body.nombre() == null || body.nombre().isBlank() ||
            body.cuerpo() == null || body.cuerpo().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Nombre y cuerpo son obligatorios"));
        }
        Agencia agencia = requireAgencia(ud);
        PlantillaCampania p = campaniaService.crearPlantilla(agencia, body.nombre(), body.cuerpo());
        return ResponseEntity.ok(plantillaToDto(p));
    }

    @DeleteMapping("/plantillas/{plantillaId}")
    public ResponseEntity<?> eliminarPlantilla(@AuthenticationPrincipal UserDetails ud,
                                               @PathVariable @NonNull Long plantillaId) {
        Agencia agencia = requireAgencia(ud);
        campaniaService.eliminarPlantilla(plantillaId, agencia.getId());
        return ResponseEntity.ok(Map.of("message", "Eliminada"));
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENVÍO MASIVO
    // ════════════════════════════════════════════════════════════════════════

    public record EnviarCampaniaRequest(
            Long dispositivoId,
            Long plantillaId,   // opcional: si null usa el cuerpo crudo
            String cuerpo,      // se renderiza con {nombre}
            List<Long> contactoIds
    ) {}

    @SuppressWarnings("null")
    @PostMapping("/enviar")
    public ResponseEntity<?> enviar(@AuthenticationPrincipal UserDetails ud,
                                    @RequestBody EnviarCampaniaRequest req) {
        if (req.dispositivoId() == null || req.cuerpo() == null || req.cuerpo().isBlank() ||
            req.contactoIds() == null || req.contactoIds().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Faltan campos obligatorios"));
        }
        Dispositivo d = requireDeviceCampania(ud, req.dispositivoId());
        Agencia agencia = d.getAgencia();
        if (!subscriptionValidationService.puedeUsarCampanias(agencia)) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of("error", "Tu plan no incluye Campañas. Actualizá a PRO o superior."));
        }

        PlantillaCampania plantilla = null;
        if (req.plantillaId() != null) {
            plantilla = plantillaRepo.findById(req.plantillaId())
                    .filter(p -> p.getAgencia().getId().equals(agencia.getId()))
                    .orElse(null);
        }

        Map<String, Object> resumen = campaniaService.encolarCampania(
                d, agencia, req.contactoIds(), req.cuerpo(), plantilla);
        return ResponseEntity.ok(resumen);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHATS
    // ════════════════════════════════════════════════════════════════════════

    @GetMapping("/devices/{deviceId}/bandeja")
    public ResponseEntity<List<Map<String, Object>>> bandeja(@AuthenticationPrincipal UserDetails ud,
                                                              @PathVariable @NonNull Long deviceId) {
        Dispositivo d = requireDeviceCampania(ud, deviceId);
        return ResponseEntity.ok(campaniaService.listarBandeja(d.getId()));
    }

    @GetMapping("/contactos/{contactoId}/mensajes")
    public ResponseEntity<List<Map<String, Object>>> mensajes(@AuthenticationPrincipal UserDetails ud,
                                                               @PathVariable @NonNull Long contactoId) {
        Agencia agencia = requireAgencia(ud);
        List<Map<String, Object>> mensajes = campaniaService.listarMensajes(contactoId, agencia.getId()).stream()
                .map(this::mensajeToDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(mensajes);
    }

    public record ResponderRequest(String texto) {}

    @PostMapping("/contactos/{contactoId}/responder")
    public ResponseEntity<?> responder(@AuthenticationPrincipal UserDetails ud,
                                       @PathVariable @NonNull Long contactoId,
                                       @RequestBody ResponderRequest body) {
        if (body.texto() == null || body.texto().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El mensaje no puede estar vacío"));
        }
        try {
            Agencia agencia = requireAgencia(ud);
            MensajeCampania m = campaniaService.responderManual(contactoId, agencia.getId(), body.texto());
            return ResponseEntity.ok(mensajeToDto(m));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS
    // ════════════════════════════════════════════════════════════════════════

    private Usuario requireUsuario(UserDetails ud) {
        if (ud == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida");
        return usuarioRepo.findByUsername(ud.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private Agencia requireAgencia(UserDetails ud) {
        Agencia agencia = requireUsuario(ud).getAgencia();
        if (agencia == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sin agencia");
        return agencia;
    }

    private Dispositivo requireDeviceCampania(UserDetails ud, @NonNull Long deviceId) {
        Agencia agencia = requireAgencia(ud);
        Optional<Dispositivo> opt = dispositivoRepo.findById(deviceId);
        return opt.filter(d -> d.getAgencia() != null && Objects.equals(d.getAgencia().getId(), agencia.getId()))
                  .filter(d -> d.getProposito() == Dispositivo.Proposito.CAMPANIAS)
                  .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Dispositivo no autorizado"));
    }

    private Map<String, Object> contactoToDto(ContactoCampania c) {
        return Map.of(
                "id", c.getId(),
                "nombre", c.getNombre(),
                "telefono", c.getTelefono(),
                "notas", c.getNotas() != null ? c.getNotas() : "",
                "fechaImportado", c.getFechaImportado().toString()
        );
    }

    private Map<String, Object> plantillaToDto(PlantillaCampania p) {
        return Map.of(
                "id", p.getId(),
                "nombre", p.getNombre(),
                "cuerpo", p.getCuerpo(),
                "fechaCreacion", p.getFechaCreacion().toString()
        );
    }

    private Map<String, Object> mensajeToDto(MensajeCampania m) {
        return Map.of(
                "id", m.getId(),
                "texto", m.getTexto(),
                "direccion", m.getDireccion().name(),
                "leido", m.isLeido(),
                "fecha", m.getFecha().toString()
        );
    }
}
