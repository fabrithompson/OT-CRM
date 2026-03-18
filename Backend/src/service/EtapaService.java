package service;

import java.util.List;
import java.util.Map;
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
    public Etapa actualizarEtapa(@NonNull Long id, EtapaUpdateRequest etapaData) {
        Etapa etapa = etapaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada"));

        if (etapaData.nombre() != null) {
            etapa.setNombre(etapaData.nombre());
        }
        return etapaRepository.save(etapa);
    }

    @Transactional
    public void eliminarEtapa(@NonNull Long id) {
        if (!etapaRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada");
        }

        long clientesEnEtapa = clienteRepository.countByEtapaId(id);

        if (clientesEnEtapa > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes eliminar una casilla con clientes. Muévelos antes.");
        }

        etapaRepository.deleteById(id);
    }

    @Transactional
    public void reordenarEtapas(@NonNull List<Long> idsOrdenados) {
        List<Etapa> etapas = etapaRepository.findAllById(idsOrdenados);
        Map<Long, Etapa> mapaEtapas = etapas.stream()
                .collect(Collectors.toMap(Etapa::getId, Function.identity()));

        for (int i = 0; i < idsOrdenados.size(); i++) {
            Long id = idsOrdenados.get(i);
            Etapa etapa = mapaEtapas.get(id);
            if (etapa != null) {
                etapa.setOrden(i);
            }
        }
        etapaRepository.saveAll(etapas);
    }
}
