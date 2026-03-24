package service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Etapa;
import model.Mensaje;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.MensajeRepository;

@Service
public class ChatService {

    private final ClienteRepository clienteRepository;
    private final MensajeRepository mensajeRepository;
    private final EtapaRepository etapaRepository;

    public ChatService(ClienteRepository clienteRepository,
            MensajeRepository mensajeRepository,
            EtapaRepository etapaRepository) {
        this.clienteRepository = clienteRepository;
        this.mensajeRepository = mensajeRepository;
        this.etapaRepository = etapaRepository;
    }

    @Transactional(readOnly = true)
    public List<Mensaje> historialPaginado(Long clienteId, Long beforeId, int size) {
        int pageSize = Math.max(1, Math.min(size, 100));
        List<Mensaje> result;
        if (beforeId != null) {
            result = mensajeRepository.findByClienteIdBeforeCursor(
                    clienteId, beforeId, PageRequest.of(0, pageSize));
        } else {
            result = mensajeRepository.findLatestByClienteId(clienteId, PageRequest.of(0, pageSize));
        }
        // Both queries return DESC order; reverse to chronological ASC
        List<Mensaje> ordered = new ArrayList<>(result);
        Collections.reverse(ordered);
        return ordered;
    }

    @Transactional(readOnly = true)
    public long contarNuevosDesde(LocalDateTime desde, Long agenciaId) {
        return clienteRepository.countByAgenciaIdAndFechaRegistroAfter(agenciaId, desde);
    }

    @Transactional(readOnly = true)
    public long contarPorEtapa(Long etapaId, Long agenciaId) {
        return clienteRepository.countByEtapaIdAndAgenciaId(etapaId, agenciaId);
    }

    @Transactional(readOnly = true)
    public List<Etapa> etapasOrdenadas() {
        return etapaRepository.findAllByOrderByOrdenAsc();
    }
}