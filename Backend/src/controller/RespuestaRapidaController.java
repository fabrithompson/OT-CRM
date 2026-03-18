package controller;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import model.RespuestaRapida;
import model.Usuario;
import service.RespuestaRapidaService;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1/respuestas-rapidas")
public class RespuestaRapidaController {

    private static final Logger logger = LoggerFactory.getLogger(RespuestaRapidaController.class);

    private final RespuestaRapidaService respuestaRapidaService;
    private final UsuarioService usuarioService;
    private final SimpMessagingTemplate messagingTemplate;

    public RespuestaRapidaController(RespuestaRapidaService respuestaRapidaService, 
                                     UsuarioService usuarioService, 
                                     SimpMessagingTemplate messagingTemplate) {
        this.respuestaRapidaService = respuestaRapidaService;
        this.usuarioService = usuarioService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping
    public ResponseEntity<List<RespuestaRapida>> obtenerRespuestas(Authentication auth) {
        try {
            Usuario u = usuarioService.buscarPorUsername(auth.getName());
            return ResponseEntity.ok(respuestaRapidaService.listarPorAgencia(u.getAgencia()));
        } catch (Exception e) {
            logger.error("Error al obtener respuestas rápidas: ", e);
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping
    public ResponseEntity<?> guardar(@RequestBody RespuestaRapida respuesta, Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
            RespuestaRapida guardada = respuestaRapidaService.guardar(respuesta, usuario);

            if (usuario.getAgencia() != null) {
                Map<String, Object> event = new HashMap<>();
                event.put("tipo", "UPDATE_RESPUESTAS");
                messagingTemplate.convertAndSend("/topic/agencia/" + usuario.getAgencia().getId(), event);
            }

            return ResponseEntity.ok(guardada);
        } catch (MessagingException e) {
            logger.error("Error al guardar respuesta rápida: ", e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> actualizar(@PathVariable @NonNull Long id, @RequestBody RespuestaRapida respuesta, Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
            respuesta.setId(id);
            RespuestaRapida guardada = respuestaRapidaService.guardar(respuesta, usuario);

            if (usuario.getAgencia() != null) {
                Map<String, Object> event = new HashMap<>();
                event.put("tipo", "UPDATE_RESPUESTAS");
                messagingTemplate.convertAndSend("/topic/agencia/" + usuario.getAgencia().getId(), event);
            }

            return ResponseEntity.ok(guardada);
        } catch (MessagingException e) {
            logger.error("Error al actualizar respuesta rápida: ", e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> eliminar(@PathVariable @NonNull Long id, Authentication auth) {
        try {
            Usuario usuario = usuarioService.buscarPorUsername(auth.getName());
            respuestaRapidaService.eliminar(id, usuario);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            logger.error("Error al eliminar respuesta rápida: ", e);
            return ResponseEntity.badRequest().build();
        }
    }
}