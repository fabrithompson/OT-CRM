package service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Actividad;
import model.Usuario;
import repository.ActividadRepository;
import repository.UsuarioRepository;

/** Línea de tiempo de cada contacto. Todo registro queda acotado a la agencia. */
@Service
public class ActividadService {

    public static final int LIMITE_MAXIMO = 200;
    public static final int TEXTO_MAXIMO = 2000;

    private final ActividadRepository actividadRepository;
    private final UsuarioRepository usuarioRepository;

    public ActividadService(ActividadRepository actividadRepository, UsuarioRepository usuarioRepository) {
        this.actividadRepository = actividadRepository;
        this.usuarioRepository = usuarioRepository;
    }

    /**
     * Registra una actividad. {@code usuario} puede ser null (automatización/sistema).
     * Un texto vacío se ignora; uno demasiado largo se recorta.
     */
    @Transactional
    public Actividad registrar(Long agenciaId, Long clienteId, Usuario usuario, String tipo, String texto) {
        if (agenciaId == null || clienteId == null || texto == null || texto.isBlank()) {
            return null;
        }
        Actividad a = new Actividad();
        a.setAgenciaId(agenciaId);
        a.setClienteId(clienteId);
        a.setUsuarioId(usuario != null ? usuario.getId() : null);
        a.setTipo(tipo);
        String limpio = texto.trim();
        a.setTexto(limpio.length() > TEXTO_MAXIMO ? limpio.substring(0, TEXTO_MAXIMO) : limpio);
        a.setFecha(LocalDateTime.now());
        return actividadRepository.save(a);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listar(Long agenciaId, Long clienteId, int limite) {
        int tope = Math.max(1, Math.min(limite, LIMITE_MAXIMO));
        List<Actividad> lista = actividadRepository
                .findByAgenciaIdAndClienteIdOrderByFechaDescIdDesc(agenciaId, clienteId, PageRequest.of(0, tope));

        Set<Long> ids = lista.stream().map(Actividad::getUsuarioId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> nombres = new HashMap<>();
        usuarioRepository.findAllById(ids).forEach(u -> nombres.put(u.getId(),
                u.getNombreCompleto() != null && !u.getNombreCompleto().isBlank()
                        ? u.getNombreCompleto() : u.getUsername()));

        return lista.stream().map(a -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", a.getId());
            m.put("tipo", a.getTipo());
            m.put("texto", a.getTexto());
            m.put("fecha", a.getFecha().toString());
            m.put("usuarioId", a.getUsuarioId());
            m.put("usuarioNombre", a.getUsuarioId() != null ? nombres.get(a.getUsuarioId()) : null);
            return m;
        }).toList();
    }
}
