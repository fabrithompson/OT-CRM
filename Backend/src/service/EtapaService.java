package service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dto.EtapaUpdateRequest;
import model.Etapa;
import repository.ClienteRepository;
import repository.EtapaRepository;

@Service
public class EtapaService {

    private final EtapaRepository etapaRepository;
    private final ClienteRepository clienteRepository;

    public EtapaService(EtapaRepository etapaRepository, ClienteRepository clienteRepository) {
        this.etapaRepository = etapaRepository;
        this.clienteRepository = clienteRepository;
    }

    public List<Etapa> listarEtapas() {
        return etapaRepository.findAllByOrderByOrdenAsc();
    }

    @SuppressWarnings("null")
    @Transactional
    public Etapa crearEtapa(Etapa etapa) {
    return etapaRepository.save(etapa);
}

    @SuppressWarnings("null")
    @Transactional
    public Etapa actualizarEtapa(@NonNull Long id, Long agenciaId, EtapaUpdateRequest etapaData) {
        // Una etapa de otra agencia responde igual que una inexistente
        Etapa etapa = etapaRepository.findById(id)
                .filter(e -> e.getAgencia() != null && Objects.equals(e.getAgencia().getId(), agenciaId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada"));

        if (etapaData.nombre() != null) {
            etapa.setNombre(etapaData.nombre());
        }
        return etapaRepository.save(etapa);
    }

    @Transactional
    public void eliminarEtapa(@NonNull Long id, Long agenciaId) {
        // Una etapa de otra agencia responde igual que una inexistente
        Etapa etapa = etapaRepository.findByIdAndAgenciaId(id, agenciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada"));

        long clientesEnEtapa = clienteRepository.countByEtapaIdAndAgenciaId(id, agenciaId);

        if (clientesEnEtapa > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes eliminar una casilla con clientes. Muévelos antes.");
        }

        etapaRepository.delete(etapa);
    }

    @Transactional
    public void reordenarEtapas(@NonNull List<Long> idsOrdenados, Long agenciaId) {
        if (idsOrdenados.isEmpty()
                || idsOrdenados.contains(null)
                || new HashSet<>(idsOrdenados).size() != idsOrdenados.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lista de etapas inválida");
        }

        // Todo o nada: si algún ID no es de esta agencia (o no existe) no se modifica ninguna etapa
        List<Etapa> etapas = etapaRepository.findAllById(idsOrdenados).stream()
                .filter(e -> e.getAgencia() != null && Objects.equals(e.getAgencia().getId(), agenciaId))
                .toList();
        if (etapas.size() != idsOrdenados.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada");
        }

        Map<Long, Etapa> mapaEtapas = etapas.stream()
                .collect(Collectors.toMap(Etapa::getId, Function.identity()));

        for (int i = 0; i < idsOrdenados.size(); i++) {
            mapaEtapas.get(idsOrdenados.get(i)).setOrden(i);
        }
        etapaRepository.saveAll(etapas);
    }
}
