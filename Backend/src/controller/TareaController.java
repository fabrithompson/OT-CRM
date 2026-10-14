package controller;

import java.time.LocalDateTime;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import model.Tarea;
import model.Usuario;
import service.TareaService;
import service.UsuarioService;

/**
 * Tareas y recordatorios del equipo. Todas las operaciones se resuelven dentro de
 * la agencia del usuario autenticado.
 */
@RestController
@RequestMapping("/api/v1/tareas")
public class TareaController {

    public record TareaRequest(String titulo, String descripcion, LocalDateTime vencimiento,
                               Long clienteId, Long usuarioId) {}

    private final TareaService tareaService;
    private final UsuarioService usuarioService;
    private final SimpMessagingTemplate messagingTemplate;

    public TareaController(TareaService tareaService, UsuarioService usuarioService,
                           SimpMessagingTemplate messagingTemplate) {
        this.tareaService = tareaService;
        this.usuarioService = usuarioService;
        this.messagingTemplate = messagingTemplate;
    }

    private Usuario usuarioConAgencia(Authentication auth) {
        Usuario u = usuarioService.buscarPorUsername(auth.getName());
        if (u.getAgencia() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El usuario no pertenece a una agencia");
        }
        return u;
    }

    private void avisarCambio(Usuario u, Tarea t) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "TAREAS_ACTUALIZADAS");
        evento.put("clienteId", t != null ? t.getClienteId() : null);
        messagingTemplate.convertAndSend("/topic/agencia/" + u.getAgencia().getId(), evento);
    }

    /**
     * @param alcance      "mias" (default) o "equipo"
     * @param clienteId    si viene, devuelve todas las tareas de ese contacto
     * @param completadas  incluir las ya completadas (default false)
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listar(
            @RequestParam(defaultValue = "mias") String alcance,
            @RequestParam(required = false) Long clienteId,
            @RequestParam(defaultValue = "false") boolean completadas,
            Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        List<Tarea> tareas = tareaService.listar(u, alcance, clienteId, completadas);
        return ResponseEntity.ok(tareaService.aDto(tareas));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> crear(@RequestBody TareaRequest req, Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        Tarea t = tareaService.crear(u, req.titulo(), req.descripcion(), req.vencimiento(),
                req.clienteId(), req.usuarioId());
        avisarCambio(u, t);
        return ResponseEntity.status(HttpStatus.CREATED).body(tareaService.aDto(List.of(t)).get(0));
    }

    @PatchMapping("/{id}/completada")
    public ResponseEntity<Map<String, Object>> cambiarEstado(
            @PathVariable @NonNull Long id,
            @RequestParam(defaultValue = "true") boolean valor,
            Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        Tarea t = tareaService.cambiarEstado(u, id, valor);
        avisarCambio(u, t);
        return ResponseEntity.ok(tareaService.aDto(List.of(t)).get(0));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable @NonNull Long id, Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        tareaService.eliminar(u, id);
        avisarCambio(u, null);
        return ResponseEntity.noContent().build();
    }
}
