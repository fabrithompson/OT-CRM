package service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Dispositivo;
import model.Dispositivo.Plataforma;
import model.Plan;
import model.Usuario;
import repository.DispositivoRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;

@Service
public class PlanService {

    private static final Logger log = LoggerFactory.getLogger(PlanService.class);

    @Autowired
    private DispositivoRepository dispositivoRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private PlanRepository planRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    public boolean puedeConectarDispositivo(Long usuarioId, Plataforma plataforma) {
        @SuppressWarnings("null")
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        Plan planEfectivo = getPlanEfectivoAgencia(usuario);

        if (planEfectivo == null) {
            return false;
        }

        int limite = planEfectivo.getMaxDispositivos();

        if (limite == -1) {
            return true;
        }

        Long agenciaId = usuario.getAgencia().getId();
        long dispositivosActivos = dispositivoRepository
                .countByAgenciaIdAndPlataforma(agenciaId, plataforma);

        return dispositivosActivos < limite;
    }

    /**
     * Obtiene el plan efectivo para un usuario, buscando el plan del admin de su agencia.
     */
    private Plan getPlanEfectivoAgencia(Usuario usuario) {
        if (usuario.getAgencia() == null) {
            return usuario.getPlan();
        }

        List<Usuario> miembros = usuarioRepository.findByAgenciaId(usuario.getAgencia().getId());
        return miembros.stream()
                .filter(u -> "ADMIN".equals(u.getRol()) && u.getPlan() != null)
                .map(Usuario::getPlan)
                .findFirst()
                .orElse(usuario.getPlan());
    }

    @CacheEvict(value = "planEfectivo", allEntries = true)
    @Transactional
    public void cambiarPlan(Long usuarioId, Long planId) {
        @SuppressWarnings("null")
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        @SuppressWarnings("null")
        Plan nuevoPlan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan no encontrado"));

        int limiteActual = usuario.getPlan() != null ? usuario.getPlan().getMaxDispositivos() : 1;
        int limiteNuevo  = nuevoPlan.getMaxDispositivos();

        if (usuario.getPlan() != null && limiteNuevo != -1 && limiteNuevo < limiteActual) {
            desconectarExcedentes(usuario.getAgencia().getId(), limiteNuevo);
        }

        usuario.setPlan(nuevoPlan);

        if (nuevoPlan.getPrecioMensual() > 0) {
            usuario.setPlanVencimiento(LocalDate.now().plusMonths(1));
        } else {
            usuario.setPlanVencimiento(null);
            usuario.setProveedorPago(null);
        }

        usuarioRepository.save(usuario);

        if ("ADMIN".equals(usuario.getRol())) {
            propagarPlanAEquipo(usuario, nuevoPlan);
        }
    }

    @CacheEvict(value = "planEfectivo", allEntries = true)
    @Transactional
    public void activarPlanPorPago(long usuarioId, long planId, String proveedorPago) {
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        Plan nuevoPlan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan no encontrado"));

        int limiteActual = usuario.getPlan() != null ? usuario.getPlan().getMaxDispositivos() : 1;
        int limiteNuevo  = nuevoPlan.getMaxDispositivos();

        if (usuario.getPlan() != null && limiteNuevo != -1 && limiteNuevo < limiteActual) {
            desconectarExcedentes(usuario.getAgencia().getId(), limiteNuevo);
        }

        usuario.setPlan(nuevoPlan);
        usuario.setPlanVencimiento(LocalDate.now().plusMonths(1));

        if (proveedorPago != null && !proveedorPago.isBlank()) {
            usuario.setProveedorPago(proveedorPago);
        }

        usuarioRepository.save(usuario);

        if ("ADMIN".equals(usuario.getRol())) {
            propagarPlanAEquipo(usuario, nuevoPlan);
        }
    }

    @CacheEvict(value = "planEfectivo", allEntries = true)
    @Transactional
    public void cancelarPlanPorSuscripcion(long usuarioId) {
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        Plan planFree = planRepository.findByNombre("FREE")
                .orElseThrow(() -> new RuntimeException("Plan FREE no encontrado"));

        int limiteActual = usuario.getPlan() != null ? usuario.getPlan().getMaxDispositivos() : 1;
        int limiteFree   = planFree.getMaxDispositivos();

        if (limiteActual > limiteFree) {
            desconectarExcedentes(usuario.getAgencia().getId(), limiteFree);
        }

        usuario.setPlan(planFree);
        usuario.setPlanVencimiento(null);
        usuario.setProveedorPago(null);
        usuarioRepository.save(usuario);

        if ("ADMIN".equals(usuario.getRol())) {
            propagarPlanAEquipo(usuario, planFree);
        }
    }

    @Cacheable("planFree")
    public Plan getPlanFree() {
        return planRepository.findByNombre("FREE")
                .orElseThrow(() -> new RuntimeException("Plan FREE no encontrado."));
    }

    private void propagarPlanAEquipo(Usuario admin, Plan nuevoPlan) {
        if (admin.getAgencia() == null) return;

        Long agenciaId = admin.getAgencia().getId();
        List<Usuario> miembros = usuarioRepository.findByAgenciaId(agenciaId);

        for (Usuario miembro : miembros) {
            if (miembro.getId().equals(admin.getId())) continue;

            miembro.setPlan(nuevoPlan);
            miembro.setPlanVencimiento(admin.getPlanVencimiento());
            miembro.setProveedorPago(admin.getProveedorPago());
            usuarioRepository.save(miembro);

            log.info("Plan propagado a miembro {} (ID: {}) -> {}",
                    miembro.getUsername(), miembro.getId(), nuevoPlan.getNombre());
        }

        // Notify all team members via WebSocket
        Map<String, Object> evento = new HashMap<>();
        evento.put("tipo", "PLAN_EQUIPO_ACTUALIZADO");
        evento.put("planNombre", nuevoPlan.getNombre());
        evento.put("planId", nuevoPlan.getId());
        evento.put("maxDispositivos", nuevoPlan.getMaxDispositivos());
        evento.put("maxContactos", nuevoPlan.getMaxContactos());
        evento.put("precioMensual", nuevoPlan.getPrecioMensual());
        evento.put("vencimiento", admin.getPlanVencimiento() != null ? admin.getPlanVencimiento().toString() : null);
        evento.put("proveedorPago", admin.getProveedorPago());

        messagingTemplate.convertAndSend("/topic/agencia/" + agenciaId, evento);
        log.info("Evento PLAN_EQUIPO_ACTUALIZADO enviado a agencia {}", agenciaId);
    }

    private void desconectarExcedentes(Long agenciaId, int nuevoLimite) {
        for (Plataforma plataforma : Plataforma.values()) {
            List<Dispositivo> dispositivos = dispositivoRepository
                    .findByAgenciaIdAndPlataformaAndActivoTrueOrderByIdAsc(agenciaId, plataforma);

            if (dispositivos.size() > nuevoLimite) {
                dispositivos.subList(nuevoLimite, dispositivos.size())
                        .forEach(d -> {
                            d.setActivo(false);
                            dispositivoRepository.save(d);
                        });
            }
        }
    }
}
