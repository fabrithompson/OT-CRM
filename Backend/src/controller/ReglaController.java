package controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import model.Regla;
import model.Usuario;
import repository.EtapaRepository;
import repository.ReglaRepository;
import repository.UsuarioRepository;
import service.UsuarioService;

/**
 * Automatizaciones: "cuando un contacto entra a la etapa X, hacer Y".
 * Solo ADMIN/OWNER pueden crearlas o cambiarlas porque afectan a todo el equipo;
 * cualquier miembro puede verlas.
 */
@RestController
@RequestMapping("/api/v1/reglas")
public class ReglaController {

    public record ReglaRequest(String nombre, Long etapaId, String accion, String tituloTarea,
                               Integer diasVencimiento, Long usuarioId) {}

    private static final Set<String> ACCIONES = Set.of(Regla.CREAR_TAREA, Regla.ASIGNAR_RESPONSABLE);

    private final ReglaRepository reglaRepository;
    private final EtapaRepository etapaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UsuarioService usuarioService;

    public ReglaController(ReglaRepository reglaRepository, EtapaRepository etapaRepository,
                           UsuarioRepository usuarioRepository, UsuarioService usuarioService) {
        this.reglaRepository = reglaRepository;
        this.etapaRepository = etapaRepository;
        this.usuarioRepository = usuarioRepository;
        this.usuarioService = usuarioService;
    }

    private Usuario usuarioConAgencia(Authentication auth) {
        Usuario u = usuarioService.buscarPorUsername(auth.getName());
        if (u.getAgencia() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El usuario no pertenece a una agencia");
        }
        return u;
    }

    private static Map<String, Object> aDto(Regla r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("nombre", r.getNombre());
        m.put("etapaId", r.getEtapaId());
        m.put("accion", r.getAccion());
        m.put("tituloTarea", r.getTituloTarea());
        m.put("diasVencimiento", r.getDiasVencimiento());
        m.put("usuarioId", r.getUsuarioId());
        m.put("activa", r.isActiva());
        return m;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listar(Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        return ResponseEntity.ok(reglaRepository.findByAgenciaIdOrderByIdDesc(u.getAgencia().getId())
                .stream().map(ReglaController::aDto).toList());
    }

    @PreAuthorize("hasAnyRole('ADMIN','OWNER')")
    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> crear(@RequestBody ReglaRequest req, Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        Long agenciaId = u.getAgencia().getId();

        String nombre = req.nombre() == null ? "" : req.nombre().trim();
        if (nombre.isEmpty() || nombre.length() > 120) {
            throw new IllegalArgumentException("El nombre es obligatorio (máximo 120 caracteres)");
        }
        if (req.accion() == null || !ACCIONES.contains(req.accion())) {
            throw new IllegalArgumentException("La acción debe ser CREAR_TAREA o ASIGNAR_RESPONSABLE");
        }
        if (req.etapaId() == null || etapaRepository.findByIdAndAgenciaId(req.etapaId(), agenciaId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Etapa no encontrada");
        }

        Regla r = new Regla();
        r.setAgenciaId(agenciaId);
        r.setEtapaId(req.etapaId());
        r.setNombre(nombre);
        r.setAccion(req.accion());

        if (Regla.CREAR_TAREA.equals(req.accion())) {
            String titulo = req.tituloTarea() == null ? "" : req.tituloTarea().trim();
            if (titulo.isEmpty() || titulo.length() > 200) {
                throw new IllegalArgumentException("El título de la tarea es obligatorio (máximo 200 caracteres)");
            }
            int dias = req.diasVencimiento() == null ? 0 : req.diasVencimiento();
            if (dias < 0 || dias > 365) {
                throw new IllegalArgumentException("Los días de vencimiento deben estar entre 0 y 365");
            }
            r.setTituloTarea(titulo);
            r.setDiasVencimiento(dias);
        } else {
            Long usuarioId = req.usuarioId();
            boolean esDelEquipo = usuarioId != null && usuarioRepository.findAllByAgenciaId(agenciaId).stream()
                    .anyMatch(m -> usuarioId.equals(m.getId()));
            if (!esDelEquipo) {
                throw new IllegalArgumentException("El usuario no pertenece a tu equipo");
            }
            r.setUsuarioId(usuarioId);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(aDto(reglaRepository.save(r)));
    }

    @PreAuthorize("hasAnyRole('ADMIN','OWNER')")
    @PatchMapping("/{id}/activa")
    @Transactional
    public ResponseEntity<Map<String, Object>> activar(
            @PathVariable @NonNull Long id, @RequestParam boolean valor, Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        Regla r = reglaRepository.findByIdAndAgenciaId(id, u.getAgencia().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Regla no encontrada"));
        r.setActiva(valor);
        return ResponseEntity.ok(aDto(reglaRepository.save(r)));
    }

    @PreAuthorize("hasAnyRole('ADMIN','OWNER')")
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> eliminar(@PathVariable @NonNull Long id, Authentication auth) {
        Usuario u = usuarioConAgencia(auth);
        Regla r = reglaRepository.findByIdAndAgenciaId(id, u.getAgencia().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Regla no encontrada"));
        reglaRepository.delete(r);
        return ResponseEntity.noContent().build();
    }
}
