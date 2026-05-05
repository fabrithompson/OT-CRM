package service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.data.domain.PageRequest;

import model.Cliente;
import model.Etapa;
import model.Etiqueta;
import model.RespuestaRapida;
import repository.ClienteRepository;
import repository.EtapaRepository;
import repository.EtiquetaRepository;
import repository.RespuestaRapidaRepository;

public class CrmAgentTools {

    private final Long agenciaId;
    private final ClienteRepository clienteRepository;
    private final EtapaRepository etapaRepository;
    private final EtiquetaRepository etiquetaRepository;
    private final RespuestaRapidaRepository respuestaRapidaRepository;

    public CrmAgentTools(Long agenciaId,
                         ClienteRepository clienteRepository,
                         EtapaRepository etapaRepository,
                         EtiquetaRepository etiquetaRepository,
                         RespuestaRapidaRepository respuestaRapidaRepository) {
        this.agenciaId = agenciaId;
        this.clienteRepository = clienteRepository;
        this.etapaRepository = etapaRepository;
        this.etiquetaRepository = etiquetaRepository;
        this.respuestaRapidaRepository = respuestaRapidaRepository;
    }

    @Tool(description = "Lista contactos del embudo de ventas con su id, nombre, teléfono, etapa actual y saldo. Filtro vacío devuelve los 20 más recientes.")
    public String listarContactos(
            @ToolParam(description = "Texto para filtrar por nombre o teléfono. Dejá vacío para obtener los 20 más recientes.") String filtro) {
        List<Cliente> clientes;
        if (filtro == null || filtro.isBlank()) {
            clientes = clienteRepository.findByAgenciaIdPaginatedByLastMessage(agenciaId, PageRequest.of(0, 20));
        } else {
            clientes = clienteRepository.buscarGlobal(agenciaId, filtro, PageRequest.of(0, 20));
        }
        if (clientes.isEmpty()) return "No se encontraron contactos.";
        return clientes.stream()
                .map(c -> String.format("ID=%d | %s | Tel: %s | Etapa: %s | Saldo: $%.2f",
                        c.getId(),
                        c.getNombre() != null ? c.getNombre() : "(sin nombre)",
                        c.getTelefono() != null ? c.getTelefono() : "-",
                        c.getEtapa() != null ? c.getEtapa().getNombre() : "Sin etapa",
                        c.getSaldo() != null ? c.getSaldo() : 0.0))
                .collect(Collectors.joining("\n"));
    }

    @Tool(description = "Lista todas las etapas del embudo de ventas disponibles, con su id y nombre.")
    public String listarEtapas() {
        List<Etapa> etapas = etapaRepository.findByAgenciaIdOrderByOrdenAsc(agenciaId);
        if (etapas.isEmpty()) return "No hay etapas configuradas.";
        return etapas.stream()
                .map(e -> String.format("ID=%d | %s", e.getId(), e.getNombre()))
                .collect(Collectors.joining("\n"));
    }

    @Tool(description = "Lista todas las etiquetas disponibles para asignar a contactos, con su id y nombre.")
    public String listarEtiquetas() {
        List<Etiqueta> etiquetas = etiquetaRepository.findByAgenciaId(agenciaId);
        if (etiquetas.isEmpty()) return "No hay etiquetas configuradas.";
        return etiquetas.stream()
                .map(e -> String.format("ID=%d | %s", e.getId(), e.getNombre()))
                .collect(Collectors.joining("\n"));
    }

    @Tool(description = "Mueve un contacto a una etapa del embudo de ventas.")
    public String moverContactoEtapa(
            @ToolParam(description = "ID del contacto a mover") Long contactoId,
            @ToolParam(description = "ID de la etapa destino") Long etapaId) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(contactoId, agenciaId).orElse(null);
        if (cliente == null) return "Error: contacto no encontrado en esta agencia.";
        Etapa etapa = etapaRepository.findByIdAndAgenciaId(etapaId, agenciaId).orElse(null);
        if (etapa == null) return "Error: etapa no encontrada en esta agencia.";
        String anterior = cliente.getEtapa() != null ? cliente.getEtapa().getNombre() : "Sin etapa";
        cliente.setEtapa(etapa);
        clienteRepository.save(cliente);
        return String.format("✓ %s movido de \"%s\" a \"%s\".", cliente.getNombre(), anterior, etapa.getNombre());
    }

    @Tool(description = "Agrega una etiqueta a un contacto.")
    public String agregarEtiqueta(
            @ToolParam(description = "ID del contacto") Long contactoId,
            @ToolParam(description = "ID de la etiqueta a agregar") Long etiquetaId) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(contactoId, agenciaId).orElse(null);
        if (cliente == null) return "Error: contacto no encontrado.";
        Etiqueta etiqueta = etiquetaRepository.findByIdAndAgenciaId(etiquetaId, agenciaId).orElse(null);
        if (etiqueta == null) return "Error: etiqueta no encontrada.";
        cliente.getEtiquetas().add(etiqueta);
        clienteRepository.save(cliente);
        return String.format("✓ Etiqueta \"%s\" agregada a %s.", etiqueta.getNombre(), cliente.getNombre());
    }

    @Tool(description = "Quita una etiqueta de un contacto.")
    public String quitarEtiqueta(
            @ToolParam(description = "ID del contacto") Long contactoId,
            @ToolParam(description = "ID de la etiqueta a quitar") Long etiquetaId) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(contactoId, agenciaId).orElse(null);
        if (cliente == null) return "Error: contacto no encontrado.";
        boolean removed = cliente.getEtiquetas().removeIf(e -> e.getId().equals(etiquetaId));
        if (!removed) return "La etiqueta no estaba asignada a este contacto.";
        clienteRepository.save(cliente);
        return String.format("✓ Etiqueta removida de %s.", cliente.getNombre());
    }

    @Tool(description = "Ajusta el saldo de un contacto. Monto positivo para sumar, negativo para restar.")
    public String ajustarSaldo(
            @ToolParam(description = "ID del contacto") Long contactoId,
            @ToolParam(description = "Monto a ajustar (positivo para sumar, negativo para restar)") Double monto) {
        Cliente cliente = clienteRepository.findByIdAndAgenciaId(contactoId, agenciaId).orElse(null);
        if (cliente == null) return "Error: contacto no encontrado.";
        double anterior = cliente.getSaldo() != null ? cliente.getSaldo() : 0.0;
        double nuevo = anterior + monto;
        cliente.setSaldo(nuevo);
        if (monto > 0) {
            double cargaTotal = cliente.getCargaTotal() != null ? cliente.getCargaTotal() : 0.0;
            cliente.setCargaTotal(cargaTotal + monto);
        }
        clienteRepository.save(cliente);
        return String.format("✓ Saldo de %s: $%.2f → $%.2f.", cliente.getNombre(), anterior, nuevo);
    }

    @Tool(description = "Obtiene las respuestas rápidas del CRM para consultar información del negocio o respuestas predefinidas.")
    public String listarRespuestasRapidas() {
        List<RespuestaRapida> respuestas = respuestaRapidaRepository.findByAgenciaId(agenciaId);
        if (respuestas.isEmpty()) return "No hay respuestas rápidas configuradas.";
        return respuestas.stream()
                .map(r -> String.format("/%s → %s", r.getAtajo(), r.getRespuesta()))
                .collect(Collectors.joining("\n"));
    }
}
