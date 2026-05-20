package service;

import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Agencia;
import model.Dispositivo;
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
        Plan plan = usuarioRepository.findAdminByAgenciaId(agencia.getId())
                .map(Usuario::getPlan)
                .orElseGet(() -> planRepository.findByNombre("FREE")
                    .orElseThrow(() -> new IllegalStateException("Plan FREE no existe en BD")));

        Hibernate.initialize(plan);
        return plan;
    }

    @Transactional(readOnly = true)
    public Usuario getAdminAgencia(Agencia agencia) {
        return usuarioRepository.findAdminByAgenciaId(agencia.getId()).orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean puedeAgregarDispositivo(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (plan.getMaxDispositivos() == -1) return true;

        long dispositivosActuales = contarDispositivosEmbudo(agencia.getId());
        log.info("Agencia {} - Dispositivos embudo: {}/{}",
                agencia.getId(), dispositivosActuales, plan.getMaxDispositivos());
        return dispositivosActuales < plan.getMaxDispositivos();
    }

    @Transactional(readOnly = true)
    public boolean puedeAgregarDispositivoCampania(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (!plan.isCampaniasHabilitadas()) return false;
        if (plan.getMaxDispositivosCampanias() == -1) return true;

        long actuales = contarDispositivosCampania(agencia.getId());
        log.info("Agencia {} - Dispositivos campañas: {}/{}",
                agencia.getId(), actuales, plan.getMaxDispositivosCampanias());
        return actuales < plan.getMaxDispositivosCampanias();
    }

    @Transactional(readOnly = true)
    public boolean puedeRecibirNuevoContacto(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (plan.getMaxContactos() == -1) return true;

        long contactosActuales = clienteRepository.countByAgenciaId(agencia.getId());
        log.info("Agencia {} - Contactos: {}/{}",
                agencia.getId(), contactosActuales, plan.getMaxContactos());
        return contactosActuales < plan.getMaxContactos();
    }

    @Transactional(readOnly = true)
    public boolean puedeAgregarMiembro(Agencia agencia) {
        Plan plan = getPlanEfectivoAgencia(agencia);
        if (plan.getMaxMiembrosEquipo() == -1) return true;

        long miembros = usuarioRepository.countByAgencia(agencia);
        log.info("Agencia {} - Miembros: {}/{}",
                agencia.getId(), miembros, plan.getMaxMiembrosEquipo());
        return miembros < plan.getMaxMiembrosEquipo();
    }

    @Transactional(readOnly = true)
    public boolean puedeUsarAgenteIA(Agencia agencia) {
        return getPlanEfectivoAgencia(agencia).isAgenteIaHabilitado();
    }

    @Transactional(readOnly = true)
    public boolean puedeUsarCampanias(Agencia agencia) {
        return getPlanEfectivoAgencia(agencia).isCampaniasHabilitadas();
    }

    private long contarDispositivosEmbudo(Long agenciaId) {
        return dispositivoRepository.findByAgenciaIdAndVisibleTrue(agenciaId).stream()
                .filter(d -> d.getProposito() == Dispositivo.Proposito.PRINCIPAL)
                .count();
    }

    private long contarDispositivosCampania(Long agenciaId) {
        return dispositivoRepository.findByAgenciaIdAndVisibleTrue(agenciaId).stream()
                .filter(d -> d.getProposito() == Dispositivo.Proposito.CAMPANIAS)
                .count();
    }
}
