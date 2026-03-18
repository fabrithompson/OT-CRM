package controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import model.Usuario;
import repository.UsuarioRepository;

@RestController
@RequestMapping("/api/v1/agencia")
public class AgenciaController {

    private final UsuarioRepository usuarioRepository;

    public AgenciaController(UsuarioRepository usuarioRepository) {
        this.usuarioRepository = usuarioRepository;
    }

    @GetMapping
    public ResponseEntity<?> obtenerAgencia(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        
        if (usuario.getAgencia() == null) {
            return ResponseEntity.ok(Map.of("nombre", "Sin Agencia", "id", null));
        }

        return ResponseEntity.ok(Map.of(
                "id", usuario.getAgencia().getId(),
                "nombre", usuario.getAgencia().getNombre(),
                "codigoInvitacion", usuario.getAgencia().getCodigoInvitacion()
        ));
    }
}