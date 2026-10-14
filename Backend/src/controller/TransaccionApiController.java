package controller;

import java.math.BigDecimal;
import java.security.Principal;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dto.TransaccionRequest;
import model.Usuario;
import service.TransaccionService;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1/transacciones")
public class TransaccionApiController {

    private final TransaccionService transaccionService;
    private final UsuarioService usuarioService;

    public TransaccionApiController(TransaccionService transaccionService, UsuarioService usuarioService) {
        this.transaccionService = transaccionService;
        this.usuarioService = usuarioService;
    }

    @PostMapping("/guardar")
    public ResponseEntity<String> guardarTransaccion(@RequestBody TransaccionRequest request, Principal principal) {
        BigDecimal monto = request.getMonto();
        Long clienteId = request.getClienteId();
        if (monto == null) {
            return ResponseEntity.badRequest().body("El monto es obligatorio");
        }

        if (monto.signum() <= 0) {
            return ResponseEntity.badRequest().body("El monto debe ser mayor a 0");
        }

        if (clienteId == null) {
            return ResponseEntity.badRequest().body("El ID del cliente es obligatorio");
        }

        // Solo CARGA o RETIRO; reportes y Dashboard filtran por 'CARGA' exacto
        if (TransaccionService.normalizarTipo(request.getTipo()) == null) {
            return ResponseEntity.badRequest().body("El tipo debe ser CARGA o RETIRO");
        }

        Usuario cajero = usuarioService.buscarPorUsername(principal.getName());

        // El servicio valida que el contacto sea de la agencia del cajero y registra
        // movimiento + saldo juntos (404 si el contacto no existe o es de otra agencia)
        transaccionService.registrar(clienteId, cajero, monto, request.getTipo());
        return ResponseEntity.ok("Transacción exitosa");
    }
}
