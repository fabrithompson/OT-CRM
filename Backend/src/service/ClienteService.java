package service;

import java.util.List;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dto.ClienteUpdateRequest;
import model.Cliente;
import model.Etapa;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;
import repository.TransaccionRepository;

@Service
public class ClienteService {

    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final MensajeRepository mensajeRepository;
    private final TransaccionRepository transaccionRepository;

    public ClienteService(ClienteRepository clienteRepository,
            EtapaRepository etapaRepository,
            MensajeRepository mensajeRepository,
            TransaccionRepository transaccionRepository) {
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.mensajeRepository = mensajeRepository;
        this.transaccionRepository = transaccionRepository;
    }

    public List<Cliente> listarClientes() {
        return clienteRepository.findAll();
    }

    @Transactional
    public Cliente guardarCliente(Cliente cliente) {
        if (cliente.getEtapa() == null) {
            Long agenciaId = (cliente.getAgencia() != null) ? cliente.getAgencia().getId() : null;

            Etapa etapaInicial = (agenciaId != null)
                    ? etapaRepository.findFirstByAgenciaIdAndEsInicialTrue(agenciaId).orElse(null)
                    : etapaRepository.findFirstByOrderByOrdenAsc();

            if (etapaInicial != null) {
                cliente.setEtapa(etapaInicial);
            }
        }
        return Objects.requireNonNull(clienteRepository.save(cliente));
    }

    @Transactional
    public Cliente moverCliente(@NonNull Long clienteId, @NonNull Long nuevaEtapaId) {
        Cliente cliente = clienteRepository.findById(clienteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));
        Etapa nuevaEtapa = etapaRepository.findById(nuevaEtapaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa de destino no encontrada"));
        cliente.setEtapa(nuevaEtapa);
        return Objects.requireNonNull(clienteRepository.save(cliente));
    }

    @SuppressWarnings("null")
    @Transactional
    public Cliente actualizarCliente(@NonNull Long id, ClienteUpdateRequest clienteActualizado) {
        Cliente cliente = clienteRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado"));

        if (clienteActualizado.nombre() != null) {
            cliente.setNombre(clienteActualizado.nombre());
        }

        if (clienteActualizado.notas() != null) {
            cliente.setNotas(clienteActualizado.notas());
        }

        return Objects.requireNonNull(clienteRepository.save(cliente));
    }

    @SuppressWarnings("null")
    @Transactional
    public void eliminarClienteTotal(Long id) {
        if (!clienteRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente no encontrado");
        }

        transaccionRepository.deleteByClienteId(id);

        mensajeRepository.deleteByClienteId(id);

        clienteRepository.deleteById(id);
    }
}