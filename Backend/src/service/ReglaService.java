package service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import model.Actividad;
import model.Cliente;
import model.Regla;
import model.Usuario;
import repository.ClienteRepository;
import repository.ReglaRepository;
import repository.UsuarioRepository;

/** Ejecuta las automatizaciones de una agencia cuando un contacto entra a una etapa. */
@Service
public class ReglaService {

    private static final Logger log = LoggerFactory.getLogger(ReglaService.class);

    private final ReglaRepository reglaRepository;
    private final ClienteRepository clienteRepository;
    private final UsuarioRepository usuarioRepository;
    private final TareaService tareaService;
    private final ActividadService actividadService;

    public ReglaService(ReglaRepository reglaRepository, ClienteRepository clienteRepository,
                        UsuarioRepository usuarioRepository, TareaService tareaService,
                        ActividadService actividadService) {
        this.reglaRepository = reglaRepository;
        this.clienteRepository = clienteRepository;
        this.usuarioRepository = usuarioRepository;
        this.tareaService = tareaService;
        this.actividadService = actividadService;
    }

    /**
     * Aplica las reglas activas de la etapa. Una regla que falla se registra y se
     * saltea: nunca debe impedir que el contacto cambie de etapa.
     *
     * Sin @Transactional a propósito: cada acción abre su propia transacción. Con una
     * externa, una acción que lanza deja la transacción compartida en rollback-only y
     * el movimiento del contacto terminaría en error aunque acá se capture.
     *
     * @param actor quien movió el contacto (atribuye las tareas y la actividad)
     */
    public void aplicarAlEntrarEnEtapa(Cliente cliente, Long etapaId, Usuario actor) {
        Long agenciaId = cliente.getAgencia().getId();
        List<Regla> reglas = reglaRepository.findByAgenciaIdAndEtapaIdAndActivaTrue(agenciaId, etapaId);

        for (Regla regla : reglas) {
            try {
                switch (regla.getAccion()) {
                    case Regla.CREAR_TAREA -> crearTarea(regla, cliente, actor);
                    case Regla.ASIGNAR_RESPONSABLE -> asignarResponsable(regla, cliente, actor);
                    default -> log.warn("Regla {} con acción desconocida: {}", regla.getId(), regla.getAccion());
                }
            } catch (RuntimeException e) {
                log.warn("La regla {} falló para el contacto {}: {}", regla.getId(), cliente.getId(), e.getMessage());
            }
        }
    }

    private void crearTarea(Regla regla, Cliente cliente, Usuario actor) {
        int dias = regla.getDiasVencimiento() != null ? Math.max(0, regla.getDiasVencimiento()) : 0;
        // Si el contacto ya tiene responsable, la tarea es para esa persona; si no, para quien lo movió
        Long asignado = cliente.getResponsableId() != null ? cliente.getResponsableId() : actor.getId();
        tareaService.crear(actor, regla.getTituloTarea(), null, TareaService.ahora().plusDays(dias),
                cliente.getId(), asignado);
        actividadService.registrar(cliente.getAgencia().getId(), cliente.getId(), null, Actividad.AUTOMATIZACION,
                "Regla «" + regla.getNombre() + "»: se creó la tarea \"" + regla.getTituloTarea() + "\"");
    }

    private void asignarResponsable(Regla regla, Cliente cliente, Usuario actor) {
        Long agenciaId = cliente.getAgencia().getId();
        boolean esDelEquipo = regla.getUsuarioId() != null && usuarioRepository.findAllByAgenciaId(agenciaId)
                .stream().anyMatch(u -> regla.getUsuarioId().equals(u.getId()));
        if (!esDelEquipo) {
            return; // el usuario ya no está en el equipo: la regla no hace nada
        }
        cliente.setResponsableId(regla.getUsuarioId());
        clienteRepository.save(cliente);
        actividadService.registrar(agenciaId, cliente.getId(), null, Actividad.AUTOMATIZACION,
                "Regla «" + regla.getNombre() + "»: se asignó el responsable");
    }
}
