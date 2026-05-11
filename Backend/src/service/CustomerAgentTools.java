package service;

import java.util.List;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import model.Cliente;
import model.Etapa;
import model.Etiqueta;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;

public class CustomerAgentTools {

    private final Long clienteId;
    private final Long agenciaId;
    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final EtiquetaRepository etiquetaRepository;

    public CustomerAgentTools(Long clienteId, Long agenciaId,
                               ClienteRepository clienteRepository,
                               EtapaRepository etapaRepository,
                               EtiquetaRepository etiquetaRepository) {
        this.clienteId = clienteId;
        this.agenciaId = agenciaId;
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.etiquetaRepository = etiquetaRepository;
    }

    @Tool(description = "Mueve al cliente actual a una etapa del embudo de ventas. Usá el nombre exacto de la etapa.")
    public String moverClienteEtapa(
            @ToolParam(description = "Nombre de la etapa destino tal como aparece en la lista de etapas disponibles (ej: 'DERIVADOS', 'CLIENTES')") String nombreEtapa) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(clienteId, agenciaId).orElse(null);
        if (cliente == null) return "Error: cliente no encontrado.";
        List<Etapa> all = etapaRepository.findByAgenciaIdOrderByOrdenAsc(agenciaId);
        Etapa etapa = all.stream()
                .filter(e -> e.getNombre().equalsIgnoreCase(nombreEtapa))
                .findFirst().orElse(null);
        if (etapa == null) return "Error: etapa '" + nombreEtapa + "' no encontrada. Etapas disponibles: "
                + all.stream().map(Etapa::getNombre).reduce("", (a, b) -> a.isEmpty() ? b : a + ", " + b);
        String anterior = cliente.getEtapa() != null ? cliente.getEtapa().getNombre() : "Sin etapa";
        cliente.setEtapa(etapa);
        clienteRepository.save(cliente);
        return String.format("OK: cliente movido de '%s' a '%s'.", anterior, etapa.getNombre());
    }

    @Tool(description = "Agrega una etiqueta al cliente actual. Usá el nombre exacto de la etiqueta.")
    public String agregarEtiquetaCliente(
            @ToolParam(description = "Nombre de la etiqueta tal como aparece en la lista de etiquetas disponibles") String nombreEtiqueta) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(clienteId, agenciaId).orElse(null);
        if (cliente == null) return "Error: cliente no encontrado.";
        List<Etiqueta> all = etiquetaRepository.findByAgenciaId(agenciaId);
        Etiqueta etiqueta = all.stream()
                .filter(e -> e.getNombre().equalsIgnoreCase(nombreEtiqueta))
                .findFirst().orElse(null);
        if (etiqueta == null) return "Error: etiqueta '" + nombreEtiqueta + "' no encontrada.";
        boolean yaTiene = cliente.getEtiquetas().stream().anyMatch(e -> e.getId().equals(etiqueta.getId()));
        if (yaTiene) return "El cliente ya tiene la etiqueta '" + etiqueta.getNombre() + "'.";
        cliente.getEtiquetas().add(etiqueta);
        clienteRepository.save(cliente);
        return String.format("OK: etiqueta '%s' agregada.", etiqueta.getNombre());
    }

    @Tool(description = "Quita una etiqueta del cliente actual.")
    public String quitarEtiquetaCliente(
            @ToolParam(description = "Nombre de la etiqueta a quitar") String nombreEtiqueta) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(clienteId, agenciaId).orElse(null);
        if (cliente == null) return "Error: cliente no encontrado.";
        boolean removed = cliente.getEtiquetas().removeIf(e -> e.getNombre().equalsIgnoreCase(nombreEtiqueta));
        if (!removed) return "El cliente no tiene la etiqueta '" + nombreEtiqueta + "'.";
        clienteRepository.save(cliente);
        return String.format("OK: etiqueta '%s' removida.", nombreEtiqueta);
    }
}
