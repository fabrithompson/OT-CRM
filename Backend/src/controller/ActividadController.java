package controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import model.Actividad;
import model.Usuario;
import repository.ActividadRepository;
import repository.ClienteRepository;
import service.ActividadService;
import service.UsuarioService;

/** Línea de tiempo de un contacto: lectura y notas manuales. */
@RestController
@RequestMapping("/api/v1/clientes/{clienteId}/actividades")
public class ActividadController {

    public record NotaRequest(String texto) {}

    private final ActividadService actividadService;
    private final ActividadRepository actividadRepository;
    private final ClienteRepository clienteRepository;
    private final UsuarioService usuarioService;
    private final SimpMessagingTemplate messagingTemplate;

    public ActividadController(ActividadService actividadService, ActividadRepository actividadRepository,
                               ClienteRepository clienteRepository, UsuarioService usuarioService,
                               SimpMessagingTemplate messagingTemplate) {
        this.actividadService = actividadService;
        this.actividadRepository = actividadRepository;
        this.clienteRepository = clienteRepository;
        this.usuarioService = usuarioService;
        this.messagingTemplate = messagingTemplate;
    }

    /** Usuario autenticado, verificando además que el contacto sea de su agencia. */
    private Usuario validar(Authentication auth, Long clienteId) {
        Usuario u = usuarioService.buscarPorUsername(auth.getName());
        if (u.getAgencia() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El usuario no pertenece a una agencia");
        }
        if (clienteRepository.findByIdAndAgenciaId(clienteId, u.getAgencia().getId()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Contacto no encontrado");
        }
        return u;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listar(
            @PathVariable @NonNull Long clienteId,
            @RequestParam(defaultValue = "100") int limite,
            Authentication auth) {
        Usuario u = validar(auth, clienteId);
        return ResponseEntity.ok(actividadService.listar(u.getAgencia().getId(), clienteId, limite));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> agregarNota(
            @PathVariable @NonNull Long clienteId,
            @RequestBody NotaRequest req,
            Authentication auth) {
        Usuario u = validar(auth, clienteId);
        String texto = req.texto() == null ? "" : req.texto().trim();
        if (texto.isEmpty()) {
            throw new IllegalArgumentException("La nota no puede estar vacía");
        }
        if (texto.length() > ActividadService.TEXTO_MAXIMO) {
            throw new IllegalArgumentException("La nota no puede superar los " + ActividadService.TEXTO_MAXIMO + " caracteres");
        }
        Actividad a = actividadService.registrar(u.getAgencia().getId(), clienteId, u, Actividad.NOTA, texto);

        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ACTIVIDAD_NUEVA");
        evento.put("clienteId", clienteId);
        messagingTemplate.convertAndSend("/topic/agencia/" + u.getAgencia().getId(), evento);

        Map<String, Object> resp = new HashMap<>();
        resp.put("id", a.getId());
        resp.put("tipo", a.getTipo());
        resp.put("texto", a.getTexto());
        resp.put("fecha", a.getFecha().toString());
        resp.put("usuarioId", a.getUsuarioId());
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    /** Solo se pueden borrar notas manuales: el resto es el registro del sistema. */
    @DeleteMapping("/{actividadId}")
    public ResponseEntity<Void> borrarNota(
            @PathVariable @NonNull Long clienteId,
            @PathVariable @NonNull Long actividadId,
            Authentication auth) {
        Usuario u = validar(auth, clienteId);
        Actividad a = actividadRepository
                .findByIdAndAgenciaIdAndClienteId(actividadId, u.getAgencia().getId(), clienteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Actividad no encontrada"));
        if (!Actividad.NOTA.equals(a.getTipo())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solo se pueden borrar las notas");
        }
        actividadRepository.delete(a);
        return ResponseEntity.noContent().build();
    }
}
