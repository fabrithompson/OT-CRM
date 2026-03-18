package controller;

import java.util.Map;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class TableroSocketController {

    @MessageMapping("/tablero/{agenciaId}/mover")
    @SendTo("/topic/agencia/{agenciaId}")
    public Map<String, Object> notificarMovimiento(@DestinationVariable Long agenciaId, Map<String, Object> evento) {
        return evento;
    }
}
