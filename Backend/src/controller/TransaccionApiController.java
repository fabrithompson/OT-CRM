package controller;

import java.security.Principal;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import dto.TransaccionRequest;
import model.Cliente;
import model.Transaccion;
import model.Usuario;
import repository.ClienteRepository;
import repository.TransaccionRepository;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1/transacciones")
public class TransaccionApiController {

    private final TransaccionRepository transaccionRepository;
    private final ClienteRepository clienteRepository;
    private final UsuarioService usuarioService;

    public TransaccionApiController(TransaccionRepository transaccionRepository,
                                    ClienteRepository clienteRepository,
                                    UsuarioService usuarioService) {
        this.transaccionRepository = transaccionRepository;
        this.clienteRepository = clienteRepository;
        this.usuarioService = usuarioService;
    }

    @PostMapping("/guardar")
    @Transactional
    public ResponseEntity<String> guardarTransaccion(@RequestBody TransaccionRequest request, Principal principal) {
        Double monto = request.getMonto();
        Long clienteId = request.getClienteId();
        if (monto == null) {
            return ResponseEntity.badRequest().body("El monto es obligatorio");
        }

        if (monto <= 0) {
            return ResponseEntity.badRequest().body("El monto debe ser mayor a 0");
        }

        if (clienteId == null) {
            return ResponseEntity.badRequest().body("El ID del cliente es obligatorio");
        }
        Cliente cliente = clienteRepository.findById(clienteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));

        Usuario cajero = usuarioService.buscarPorUsername(principal.getName());
        Transaccion transaccion = new Transaccion();
        transaccion.setCliente(cliente);
        transaccion.setUsuario(cajero);
        transaccion.setMonto(monto);
        transaccion.setTipo(request.getTipo());
        transaccionRepository.save(transaccion);
        Double saldoCliente = cliente.getSaldo();
        double saldoActual = (saldoCliente != null) ? saldoCliente : 0.0;
        if ("CARGA".equalsIgnoreCase(request.getTipo())) {
            cliente.setSaldo(saldoActual + monto);
        } else {
            cliente.setSaldo(saldoActual - monto);
        }
        clienteRepository.save(cliente);
        return ResponseEntity.ok("Transacción exitosa");
    }
}