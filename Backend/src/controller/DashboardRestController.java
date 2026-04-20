package controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import exception.RegistroException;
import model.SolicitudUnionEquipo;
import model.Usuario;
import org.springframework.data.domain.PageRequest;

import repository.SolicitudUnionEquipoRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;
import service.DashboardService;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardRestController {

    private static final Logger log = LoggerFactory.getLogger(DashboardRestController.class);

    private final DashboardService dashboardService;
    private final UsuarioRepository usuarioRepository;
    private final UsuarioService usuarioService;
    private final SimpMessagingTemplate messagingTemplate;
    private final SolicitudUnionEquipoRepository solicitudRepository;
    private final TransaccionRepository transaccionRepository;

    public DashboardRestController(
            DashboardService dashboardService,
            UsuarioRepository usuarioRepository,
            UsuarioService usuarioService,
            SimpMessagingTemplate messagingTemplate,
            SolicitudUnionEquipoRepository solicitudRepository,
            TransaccionRepository transaccionRepository
    ) {
        this.dashboardService = dashboardService;
        this.usuarioRepository = usuarioRepository;
        this.usuarioService = usuarioService;
        this.messagingTemplate = messagingTemplate;
        this.solicitudRepository = solicitudRepository;
        this.transaccionRepository = transaccionRepository;
    }

    @GetMapping("/top-stats")
    public ResponseEntity<Map<String, Object>> getTopStats(Principal principal) {
        Usuario usuario = getUsuarioAutenticado(principal.getName());
        if (usuario.getAgencia() == null) {
            return ResponseEntity.ok(Map.of("topClientes", List.of(), "topAgentes", List.of()));
        }
        Long agenciaId = usuario.getAgencia().getId();
        PageRequest top5 = PageRequest.of(0, 5);

        List<Map<String, Object>> topClientes = transaccionRepository
                .topClientesByMonto(agenciaId, top5)
                .stream()
                .map(r -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id",     r[0]);
                    m.put("nombre", r[1] != null ? r[1] : "Sin nombre");
                    m.put("total",  r[2]);
                    return m;
                })
                .collect(Collectors.toList());

        List<Map<String, Object>> topAgentes = transaccionRepository
                .topAgentesByMonto(agenciaId, top5)
                .stream()
                .map(r -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id",       r[0]);
                    m.put("nombre",   r[1] != null ? r[1] : (r[2] != null ? r[2] : "Agente"));
                    m.put("username", r[2]);
                    m.put("total",    r[3]);
                    return m;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("topClientes", topClientes, "topAgentes", topAgentes));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getRealTimeStats(Principal principal) {
        Usuario usuario = getUsuarioAutenticado(principal.getName());
        Map<String, Object> data = dashboardService.getDashboardData(usuario);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/equipo")
    public ResponseEntity<List<Map<String, String>>> obtenerEquipo(Principal principal) {
        Usuario usuario = getUsuarioAutenticado(principal.getName());

        if (usuario.getAgencia() == null) {
            return ResponseEntity.ok(List.of());
        }

        List<Usuario> miembros = usuarioRepository.findAllByAgenciaId(usuario.getAgencia().getId());

        List<Map<String, String>> respuesta = miembros.stream()
                .map(this::mapUsuarioToDto)
                .toList();

        return ResponseEntity.ok(respuesta);
    }

    @GetMapping("/equipo/solicitudes-pendientes")
    public List<SolicitudUnionEquipo> listarSolicitudes(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario admin = getUsuarioAutenticado(userDetails.getUsername());
        if (admin.getAgencia() == null) {
            return List.of();
        }

        return solicitudRepository.findByAgenciaDestinoAndEstado(admin.getAgencia(), SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE);
    }

    @PostMapping("/equipo/solicitar-union")
    @Transactional
    public ResponseEntity<?> solicitarUnion(@RequestBody Map<String, String> payload, Authentication authentication) {
        String codigoInvitacion = payload.get("codigo");
        if (codigoInvitacion == null || codigoInvitacion.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El código es obligatorio."));
        }

        try {
            Usuario solicitante = getUsuarioAutenticado(authentication.getName());

            SolicitudUnionEquipo solicitud = usuarioService.crearSolicitudUnion(solicitante, codigoInvitacion);

            Map<String, Object> notificacion = new HashMap<>();
            notificacion.put("tipo", "NUEVA_SOLICITUD");
            notificacion.put("id", solicitud.getId());
            notificacion.put("nombreUsuario", solicitante.getNombreCompleto() != null ? solicitante.getNombreCompleto() : solicitante.getUsername());
            notificacion.put("fotoUrl", solicitante.getFotoUrl());

            messagingTemplate.convertAndSend("/topic/agencia/" + solicitud.getAgenciaDestino().getId(), notificacion);

            return ResponseEntity.ok(Map.of("message", "Solicitud enviada."));

        } catch (RegistroException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (MessagingException e) {
            log.error("Error union equipo", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Error interno."));
        }
    }

    @PostMapping("/equipo/gestionar-solicitud")
    @Transactional
    public ResponseEntity<?> gestionarSolicitud(@RequestBody Map<String, Object> payload, Authentication auth) {
        try {
            Long solicitudId = ((Number) payload.get("solicitudId")).longValue();
            boolean aprobar = (boolean) payload.get("aprobar");
            Usuario admin = getUsuarioAutenticado(auth.getName());

            usuarioService.gestionarSolicitud(solicitudId, aprobar, admin);

            return ResponseEntity.ok(Map.of("message", aprobar ? "Aprobado" : "Rechazado"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/equipo/abandonar")
    @Transactional
    public ResponseEntity<?> abandonarEquipo(Authentication authentication) {
        try {
            Usuario usuario = usuarioRepository.findByUsername(authentication.getName())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

            usuarioService.abandonarEquipo(usuario);

            return ResponseEntity.ok(Map.of("message", "Has dejado el equipo. Ahora estás en tu espacio personal con plan FREE."));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private Usuario getUsuarioAutenticado(String username) {
        if (username == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }


    private Map<String, String> mapUsuarioToDto(Usuario u) {
        Map<String, String> map = new HashMap<>();
        map.put("username", u.getUsername()); 
        map.put("nombre", u.getNombreCompleto() != null ? u.getNombreCompleto() : u.getUsername());
        map.put("email", u.getEmail() != null ? u.getEmail() : "Sin email");
        map.put("rol", u.getRol() != null ? u.getRol() : "USER");
        map.put("inicial", u.getUsername().substring(0, 1).toUpperCase());
        if (u.getFotoUrl() != null) map.put("fotoUrl", u.getFotoUrl());
        return map;
    }
}
