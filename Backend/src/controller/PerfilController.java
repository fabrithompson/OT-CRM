package controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import exception.RegistroException;
import model.Plan;
import model.Usuario;
import service.PerfilService;
import service.SubscriptionValidationService;

@RestController
@RequestMapping("/api/v1/perfil")
public class PerfilController {

    private static final Logger logger = LoggerFactory.getLogger(PerfilController.class);

    private final PerfilService perfilService;
    private final SimpMessagingTemplate messagingTemplate;
    private final SubscriptionValidationService subscriptionValidationService;

    public PerfilController(PerfilService perfilService, SimpMessagingTemplate messagingTemplate,
                            SubscriptionValidationService subscriptionValidationService) {
        this.perfilService = perfilService;
        this.messagingTemplate = messagingTemplate;
        this.subscriptionValidationService = subscriptionValidationService;
    }

    @GetMapping
    public ResponseEntity<?> verPerfil(@AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Usuario usuario = perfilService.findByUsername(userDetails.getUsername());
        
        Map<String, Object> response = new HashMap<>();
        response.put("id", usuario.getId());
        response.put("username", usuario.getUsername());
        response.put("email", usuario.getEmail());
        response.put("nombreCompleto", usuario.getNombreCompleto());
        response.put("fotoUrl", usuario.getFotoUrl());
        response.put("rol", usuario.getRol());
        response.put("proveedorPago", usuario.getProveedorPago());

        Plan planEfectivo = usuario.getAgencia() != null
                ? subscriptionValidationService.getPlanEfectivoAgencia(usuario.getAgencia())
                : usuario.getPlan();

        if (planEfectivo != null) {
            Map<String, Object> planMap = new HashMap<>();
            planMap.put("id", planEfectivo.getId());
            planMap.put("nombre", planEfectivo.getNombre());
            planMap.put("maxDispositivos", planEfectivo.getMaxDispositivos());
            planMap.put("maxContactos", planEfectivo.getMaxContactos());
            planMap.put("precioMensual", planEfectivo.getPrecioMensual());
            response.put("plan", planMap);
        }

        if (usuario.getPlanVencimiento() != null) {
            response.put("planVencimiento", usuario.getPlanVencimiento().toString());
        }

        if (usuario.getAgencia() != null) {
            Map<String, Object> agenciaMap = new HashMap<>();
            agenciaMap.put("id", usuario.getAgencia().getId());
            agenciaMap.put("nombre", usuario.getAgencia().getNombre());
            agenciaMap.put("codigoInvitacion", usuario.getAgencia().getCodigoInvitacion());
            response.put("agencia", agenciaMap);
        }

        return ResponseEntity.ok(response);
    }

    @PutMapping("/actualizar")
    public ResponseEntity<?> actualizarPerfil(@AuthenticationPrincipal UserDetails userDetails,
            @RequestParam String nombreCompleto,
            @RequestParam String email,
            @RequestParam(required = false) String newPassword,
            @RequestParam(value = "foto", required = false) MultipartFile foto) {
        try {
            perfilService.actualizarPerfil(userDetails.getUsername(), nombreCompleto, email, newPassword, foto);

            Usuario usuarioActualizado = perfilService.findByUsername(userDetails.getUsername());

            if (usuarioActualizado.getAgencia() != null) {
                Long agenciaId = usuarioActualizado.getAgencia().getId();

                Map<String, Object> updatePayload = new HashMap<>();
                updatePayload.put("tipo", "PERFIL_ACTUALIZADO");
                updatePayload.put("userId", usuarioActualizado.getId());
                updatePayload.put("fotoUrl", usuarioActualizado.getFotoUrl());
                updatePayload.put("nombreCompleto", usuarioActualizado.getNombreCompleto());
                messagingTemplate.convertAndSend("/topic/agencia/" + agenciaId, updatePayload);

                logger.info("Notificación WebSocket enviada a la agencia: {}", agenciaId);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("message", "Perfil actualizado correctamente.");
            result.put("fotoUrl", usuarioActualizado.getFotoUrl());
            return ResponseEntity.ok(result);
            
        } catch (RegistroException e) {
            logger.warn("Fallo al actualizar perfil (Negocio): {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (MessagingException e) {
            logger.error("Error crítico al actualizar el perfil de usuario: {}", userDetails.getUsername(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Ocurrió un error técnico al actualizar el perfil."));
        }
    }
}