package controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import dto.EtapaUpdateRequest;
import model.Agencia;
import model.Etapa;
import model.Usuario;
import repository.EtapaRepository;
import repository.UsuarioRepository;
import service.EtapaService;

@RestController
@RequestMapping("/api/v1/etapas")
public class EtapaController {

    private final EtapaService etapaService;
    private final EtapaRepository etapaRepository;
    private final UsuarioRepository usuarioRepository;
    private final SimpMessagingTemplate messaging;

    public EtapaController(EtapaRepository etapaRepository,
            EtapaService etapaService,
            UsuarioRepository usuarioRepository,
            SimpMessagingTemplate messaging) {
        this.etapaRepository = etapaRepository;
        this.etapaService = etapaService;
        this.usuarioRepository = usuarioRepository;
        this.messaging = messaging;
    }

    @GetMapping
    public List<Etapa> listarEtapas(@AuthenticationPrincipal UserDetails userDetails) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        return etapaRepository.findByAgenciaIdOrderByOrdenAsc(usuario.getAgencia().getId());
    }

    @PostMapping
    public ResponseEntity<Etapa> crearEtapa(@AuthenticationPrincipal UserDetails userDetails, @RequestBody Etapa etapa) {
        Usuario usuario = getUsuarioOrThrow(userDetails);
        Agencia agencia = usuario.getAgencia();

        if (agencia == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sin agencia");
        }

        long cantidad = etapaRepository.countByAgenciaId(agencia.getId());
        etapa.setEsInicial(cantidad == 0);
        etapa.setOrden((int) cantidad + 1);
        etapa.setAgencia(agencia);

        Etapa nueva = etapaService.crearEtapa(etapa);
        
        notificarEtapaCreada(agencia.getId(), nueva);
        
        return ResponseEntity.status(HttpStatus.CREATED).body(nueva);
    }

    @PutMapping("/{id}/hacer-principal")
    @Transactional
    public ResponseEntity<Void> hacerPrincipal(
            @AuthenticationPrincipal UserDetails userDetails, 
            @PathVariable @NonNull Long id) {
        
        Usuario usuario = getUsuarioOrThrow(userDetails);
        Long agenciaId = usuario.getAgencia().getId();

        List<Etapa> etapas = etapaRepository.findByAgenciaId(agenciaId);
        etapas.forEach(e -> e.setEsInicial(false));
        etapaRepository.saveAll(etapas);

        return etapaRepository.findById(id)
            .filter(e -> Objects.equals(e.getAgencia().getId(), agenciaId))
            .map(etapa -> {
                etapa.setEsInicial(true);
                etapaRepository.save(etapa);
                
                notificarPrincipalActualizada(agenciaId, id); 
                
                return ResponseEntity.ok().<Void>build();
            })
            .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Etapa> actualizarEtapa(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable @NonNull Long id,
            @RequestBody EtapaUpdateRequest etapaData) {
        
        Usuario usuario = getUsuarioOrThrow(userDetails);
        Etapa actualizada = etapaService.actualizarEtapa(id, etapaData);

        notificarEtapaRenombrada(usuario.getAgencia().getId(), id, actualizada.getNombre());

        return ResponseEntity.ok(actualizada);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void eliminarEtapa(
            @AuthenticationPrincipal UserDetails userDetails, 
            @PathVariable @NonNull Long id) {
        
        Usuario usuario = getUsuarioOrThrow(userDetails);
        etapaService.eliminarEtapa(id);
        
        notificarEtapaEliminada(usuario.getAgencia().getId(), id);
    }

    @SuppressWarnings("null")
    @PostMapping("/reordenar")
    @ResponseStatus(HttpStatus.OK)
    public void reordenarEtapas(
            @AuthenticationPrincipal UserDetails userDetails, 
            @RequestBody List<Long> idsOrdenados) {
        
        etapaService.reordenarEtapas(idsOrdenados);
        Usuario usuario = getUsuarioOrThrow(userDetails);
        
        notificarEtapasReordenadas(usuario.getAgencia().getId(), idsOrdenados);
    }

    @PatchMapping("/{id}/color")
    @Transactional
    public ResponseEntity<Void> actualizarColor(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable @NonNull Long id,
            @RequestParam String color) {
        
        Usuario usuario = getUsuarioOrThrow(userDetails);
        return etapaRepository.findById(id)
                .filter(e -> Objects.equals(e.getAgencia().getId(), usuario.getAgencia().getId()))
                .map(etapa -> {
                    etapa.setColor(color);
                    etapaRepository.save(etapa);
                    
                    notificarColorActualizado(usuario.getAgencia().getId(), id, color);
                    
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }


    private Usuario getUsuarioOrThrow(UserDetails userDetails) {
        return usuarioRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private void notificarColorActualizado(Long agenciaId, Long etapaId, String nuevoColor) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPA_COLOR_ACTUALIZADA");
        evento.put("etapaId", etapaId);
        evento.put("nuevoColor", nuevoColor);
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

    private void notificarEtapaCreada(Long agenciaId, Etapa nuevaEtapa) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPA_CREADA");
        evento.put("etapa", nuevaEtapa); 
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

    private void notificarEtapaEliminada(Long agenciaId, Long etapaId) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPA_ELIMINADA");
        evento.put("etapaId", etapaId);
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

    private void notificarPrincipalActualizada(Long agenciaId, Long etapaId) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPA_PRINCIPAL_ACTUALIZADA");
        evento.put("etapaId", etapaId);
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

    private void notificarEtapaRenombrada(Long agenciaId, Long etapaId, String nuevoNombre) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPA_RENOMBRADA");
        evento.put("etapaId", etapaId);
        evento.put("nuevoNombre", nuevoNombre);
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

    private void notificarEtapasReordenadas(Long agenciaId, List<Long> nuevoOrden) {
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "ETAPAS_REORDENADAS");
        evento.put("nuevoOrden", nuevoOrden);
        messaging.convertAndSend("/topic/agencia/" + agenciaId, evento);
    }

}