package service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Agencia;
import model.Plan;
import model.Usuario;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.PlanRepository;
import repository.UsuarioRepository;

@Service
public class SubscriptionValidationService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionValidationService.class);

    private final UsuarioRepository usuarioRepository;
    private final ClienteRepository clienteRepository;
    private final DispositivoRepository dispositivoRepository;
    private final PlanRepository planRepository;

    public SubscriptionValidationService(UsuarioRepository usuarioRepository, 
                                         ClienteRepository clienteRepository,
                                         DispositivoRepository dispositivoRepository, 
                                         PlanRepository planRepository) {
        this.usuarioRepository = usuarioRepository;
        this.clienteRepository = clienteRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.planRepository = planRepository;
    }

    @Cacheable(value = "planEfectivo", key = "#agencia.id")
    @Transactional(readOnly = true)
    public Plan getPlanEfectivoAgencia(Agencia agencia) {
        List<Usuario> usuarios = usuarioRepository.findByAgenciaId(agencia.getId());

        return usuarios.stream()
                .filter(u -> "ADMIN".equals(u.getRol()) && u.getPlan() != null)
                .map(Usuario::getPlan)
                .findFirst()
                .orElseGet(() -> planRepository.findByNombre("FREE")
                    .orElseThrow(() -> new IllegalStateException("Plan FREE no existe en BD")));
    }

    @Transactional(readOnly = true)
    public Usuario getAdminAgencia(Agencia agencia) {
        List<Usuario> usuarios = usuarioRepository.findByAgenciaId(agencia.getId());
        return usuarios.stream()
                .filter(u -> "ADMIN".equals(u.getRol()))
                .findFirst()
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean puedeAgregarDispositivo(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (plan.getMaxDispositivos() == -1) return true;

        long dispositivosActuales = dispositivoRepository.countByAgenciaId(agencia.getId());
        log.info("Agencia {} - Dispositivos: {}/{}", agencia.getId(), dispositivosActuales, plan.getMaxDispositivos());
        return dispositivosActuales < plan.getMaxDispositivos();
    }

    @Transactional(readOnly = true)
    public boolean puedeRecibirNuevoContacto(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (plan.getMaxContactos() == -1) return true;

        long contactosActuales = clienteRepository.countByAgenciaId(agencia.getId());
        log.info("Agencia {} - Contactos: {}/{}", agencia.getId(), contactosActuales, plan.getMaxContactos());
        return contactosActuales < plan.getMaxContactos();
    }
}