package service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import model.Actividad;
import model.Cliente;
import model.Transaccion;
import model.Usuario;
import repository.ClienteRepository;
import repository.TransaccionRepository;

/**
 * Único punto por el que cambia el saldo de un contacto.
 *
 * Antes el saldo se modificaba por tres caminos (chat, /clientes/{id}/saldo y el
 * agente de IA) y solo uno dejaba una Transaccion: los otros dos cambiaban el
 * número sin movimiento, así que saldo, reporte Excel y Dashboard no coincidían.
 * Acá el movimiento y el saldo se actualizan juntos, en la misma transacción.
 */
@Service
public class TransaccionService {

    public static final String TIPO_CARGA = "CARGA";
    public static final String TIPO_RETIRO = "RETIRO";
    public static final BigDecimal MONTO_MAXIMO = new BigDecimal("999999999");

    private final TransaccionRepository transaccionRepository;
    private final ClienteRepository clienteRepository;
    private final ActividadService actividadService;

    public TransaccionService(TransaccionRepository transaccionRepository, ClienteRepository clienteRepository,
                              ActividadService actividadService) {
        this.transaccionRepository = transaccionRepository;
        this.clienteRepository = clienteRepository;
        this.actividadService = actividadService;
    }

    /** Normaliza a CARGA / RETIRO (mayúsculas) o devuelve null si no es un tipo válido. */
    public static String normalizarTipo(String tipo) {
        if (tipo == null) return null;
        String t = tipo.trim().toUpperCase();
        return (TIPO_CARGA.equals(t) || TIPO_RETIRO.equals(t)) ? t : null;
    }

    /**
     * Registra una carga o un retiro sobre un contacto de la agencia del usuario.
     *
     * @throws IllegalArgumentException si el monto o el tipo no son válidos
     * @throws ResponseStatusException  404 si el contacto no existe o es de otra agencia
     * @return el contacto con el saldo ya actualizado
     */
    @Transactional
    public Cliente registrar(Long clienteId, Usuario usuario, BigDecimal montoIngresado, String tipo) {
        String tipoNormalizado = normalizarTipo(tipo);
        if (tipoNormalizado == null) {
            throw new IllegalArgumentException("El tipo debe ser CARGA o RETIRO");
        }
        // Se redondea a centavos (la columna es NUMERIC(14,2)); "0.004" queda en 0 y se rechaza
        BigDecimal monto = montoIngresado == null ? null : montoIngresado.setScale(2, RoundingMode.HALF_UP);
        if (monto == null || monto.signum() <= 0 || monto.compareTo(MONTO_MAXIMO) > 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a 0 y razonable");
        }
        if (usuario == null || usuario.getAgencia() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El usuario no pertenece a una agencia");
        }
        if (clienteId == null) {
            throw new IllegalArgumentException("El ID del cliente es obligatorio");
        }

        // Solo contactos de la agencia del usuario; uno ajeno responde igual que uno inexistente
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(clienteId, usuario.getAgencia().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));

        transaccionRepository.save(new Transaccion(cliente, usuario, monto, tipoNormalizado));

        BigDecimal saldo = cliente.getSaldo() != null ? cliente.getSaldo() : BigDecimal.ZERO;
        if (TIPO_CARGA.equals(tipoNormalizado)) {
            cliente.setSaldo(saldo.add(monto));
            BigDecimal cargaTotal = cliente.getCargaTotal() != null ? cliente.getCargaTotal() : BigDecimal.ZERO;
            cliente.setCargaTotal(cargaTotal.add(monto));
        } else {
            cliente.setSaldo(saldo.subtract(monto));
        }
        Cliente guardado = clienteRepository.save(cliente);

        actividadService.registrar(usuario.getAgencia().getId(), guardado.getId(), usuario, Actividad.TRANSACCION,
                String.format("%s de $%s (saldo: $%s)",
                        TIPO_CARGA.equals(tipoNormalizado) ? "Carga" : "Retiro",
                        monto.toPlainString(), guardado.getSaldo().toPlainString()));
        return guardado;
    }
}
