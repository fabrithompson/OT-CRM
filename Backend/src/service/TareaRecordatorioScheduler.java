package service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import model.Tarea;
import repository.TareaRepository;

/**
 * Avisa por WebSocket cuando vence una tarea. Cada tarea se avisa una sola vez
 * (queda marcada como notificada), aunque el scheduler corra muchas veces.
 */
@Component
public class TareaRecordatorioScheduler {

    private static final Logger log = LoggerFactory.getLogger(TareaRecordatorioScheduler.class);

    private final TareaRepository tareaRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public TareaRecordatorioScheduler(TareaRepository tareaRepository, SimpMessagingTemplate messagingTemplate) {
        this.tareaRepository = tareaRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void avisarVencidas() {
        try {
            avisarVencidasAhora();
        } catch (RuntimeException e) {
            log.warn("No se pudieron procesar los recordatorios de tareas: {}", e.getMessage());
        }
    }

    /** Separado del @Scheduled para poder probarlo directamente. */
    @Transactional
    public int avisarVencidasAhora() {
        List<Tarea> vencidas = tareaRepository
                .findByCompletadaFalseAndNotificadaFalseAndVencimientoLessThanEqual(TareaService.ahora());

        for (Tarea t : vencidas) {
            Map<String, Object> evento = new HashMap<>();
            evento.put("tipo", "TAREA_VENCIDA");
            evento.put("tareaId", t.getId());
            evento.put("titulo", t.getTitulo());
            evento.put("clienteId", t.getClienteId());
            evento.put("usuarioId", t.getUsuarioId());
            messagingTemplate.convertAndSend("/topic/agencia/" + t.getAgenciaId(), evento);
            t.setNotificada(true);
        }
        tareaRepository.saveAll(vencidas);
        return vencidas.size();
    }
}
