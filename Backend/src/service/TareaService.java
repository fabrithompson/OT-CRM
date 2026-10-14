package service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import model.Actividad;
import model.Cliente;
import model.Tarea;
import model.Usuario;
import repository.ClienteRepository;
import repository.TareaRepository;
import repository.UsuarioRepository;

/**
 * Tareas y recordatorios. Toda operación recibe la agencia del usuario: una tarea,
 * un contacto o un usuario asignado de otra agencia responde como inexistente.
 */
@Service
public class TareaService {

    /** Hora de referencia: los vencimientos se cargan en hora local de Argentina (igual que el resto de la app). */
    public static final ZoneId ZONA = ZoneId.of("America/Argentina/Buenos_Aires");

    private final TareaRepository tareaRepository;
    private final ClienteRepository clienteRepository;
    private final UsuarioRepository usuarioRepository;
    private final ActividadService actividadService;

    public TareaService(TareaRepository tareaRepository, ClienteRepository clienteRepository,
                        UsuarioRepository usuarioRepository, ActividadService actividadService) {
        this.tareaRepository = tareaRepository;
        this.clienteRepository = clienteRepository;
        this.usuarioRepository = usuarioRepository;
        this.actividadService = actividadService;
    }

    public static LocalDateTime ahora() {
        return LocalDateTime.now(ZONA);
    }

    /**
     * Crea una tarea. El contacto y el asignado, si vienen, deben ser de la agencia.
     *
     * @param asignadoId null = queda asignada al creador
     */
    @Transactional
    public Tarea crear(Usuario creador, String titulo, String descripcion, LocalDateTime vencimiento,
                       Long clienteId, Long asignadoId) {
        Long agenciaId = creador.getAgencia().getId();

        String t = titulo == null ? "" : titulo.trim();
        if (t.isEmpty()) {
            throw new IllegalArgumentException("El título es obligatorio");
        }
        if (t.length() > 200) {
            throw new IllegalArgumentException("El título no puede superar los 200 caracteres");
        }
        if (descripcion != null && descripcion.length() > 1000) {
            throw new IllegalArgumentException("La descripción no puede superar los 1000 caracteres");
        }

        Cliente cliente = null;
        if (clienteId != null) {
            cliente = clienteRepository.findByIdAndAgenciaId(clienteId, agenciaId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contacto no encontrado"));
        }

        Long asignado = asignadoId != null ? asignadoId : creador.getId();
        if (!asignado.equals(creador.getId()) && !esDelEquipo(agenciaId, asignado)) {
            throw new IllegalArgumentException("El usuario asignado no pertenece a tu equipo");
        }

        Tarea tarea = new Tarea();
        tarea.setAgenciaId(agenciaId);
        tarea.setClienteId(cliente != null ? cliente.getId() : null);
        tarea.setUsuarioId(asignado);
        tarea.setCreadorId(creador.getId());
        tarea.setTitulo(t);
        tarea.setDescripcion(descripcion != null && !descripcion.isBlank() ? descripcion.trim() : null);
        tarea.setVencimiento(vencimiento);
        tarea = tareaRepository.save(tarea);

        if (cliente != null) {
            actividadService.registrar(agenciaId, cliente.getId(), creador, Actividad.TAREA, "Tarea creada: " + t);
        }
        return tarea;
    }

    @Transactional
    public Tarea cambiarEstado(Usuario usuario, Long tareaId, boolean completada) {
        Long agenciaId = usuario.getAgencia().getId();
        Tarea tarea = tareaRepository.findByIdAndAgenciaId(tareaId, agenciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tarea no encontrada"));

        if (tarea.isCompletada() != completada) {
            tarea.setCompletada(completada);
            tarea.setFechaCompletada(completada ? ahora() : null);
            tarea = tareaRepository.save(tarea);
            if (tarea.getClienteId() != null) {
                actividadService.registrar(agenciaId, tarea.getClienteId(), usuario, Actividad.TAREA,
                        (completada ? "Tarea completada: " : "Tarea reabierta: ") + tarea.getTitulo());
            }
        }
        return tarea;
    }

    @Transactional
    public void eliminar(Usuario usuario, Long tareaId) {
        Tarea tarea = tareaRepository.findByIdAndAgenciaId(tareaId, usuario.getAgencia().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tarea no encontrada"));
        tareaRepository.delete(tarea);
    }

    @Transactional(readOnly = true)
    public List<Tarea> listar(Usuario usuario, String alcance, Long clienteId, boolean incluirCompletadas) {
        Long agenciaId = usuario.getAgencia().getId();
        if (clienteId != null) {
            return tareaRepository.findByCliente(agenciaId, clienteId);
        }
        if ("equipo".equalsIgnoreCase(alcance)) {
            return tareaRepository.findDeAgencia(agenciaId, incluirCompletadas);
        }
        return tareaRepository.findDeUsuario(agenciaId, usuario.getId(), incluirCompletadas);
    }

    /** Arma la respuesta con nombres de contacto y de usuario (una sola consulta por tipo). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> aDto(List<Tarea> tareas) {
        Set<Long> clienteIds = tareas.stream().map(Tarea::getClienteId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Set<Long> usuarioIds = tareas.stream().map(Tarea::getUsuarioId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());

        Map<Long, String> clientes = new HashMap<>();
        clienteRepository.findAllById(clienteIds).forEach(c -> clientes.put(c.getId(), c.getNombre()));
        Map<Long, String> usuarios = new HashMap<>();
        usuarioRepository.findAllById(usuarioIds).forEach(u -> usuarios.put(u.getId(),
                u.getNombreCompleto() != null && !u.getNombreCompleto().isBlank()
                        ? u.getNombreCompleto() : u.getUsername()));

        LocalDateTime ahora = ahora();
        return tareas.stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.getId());
            m.put("titulo", t.getTitulo());
            m.put("descripcion", t.getDescripcion());
            m.put("vencimiento", t.getVencimiento() != null ? t.getVencimiento().toString() : null);
            m.put("completada", t.isCompletada());
            m.put("vencida", !t.isCompletada() && t.getVencimiento() != null && t.getVencimiento().isBefore(ahora));
            m.put("clienteId", t.getClienteId());
            m.put("clienteNombre", t.getClienteId() != null ? clientes.get(t.getClienteId()) : null);
            m.put("usuarioId", t.getUsuarioId());
            m.put("usuarioNombre", t.getUsuarioId() != null ? usuarios.get(t.getUsuarioId()) : null);
            return m;
        }).toList();
    }

    private boolean esDelEquipo(Long agenciaId, Long usuarioId) {
        return usuarioRepository.findAllByAgenciaId(agenciaId).stream()
                .anyMatch(u -> usuarioId.equals(u.getId()));
    }
}
