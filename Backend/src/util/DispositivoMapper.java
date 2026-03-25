package util;

import java.util.HashMap;
import java.util.Map;

import model.Dispositivo;

public final class DispositivoMapper {

    private DispositivoMapper() {}

    public static Map<String, Object> toDto(Dispositivo d) {
        Map<String, Object> dto = new HashMap<>();
        dto.put("id", d.getId());
        dto.put("alias", d.getAlias());
        dto.put("sessionId", d.getSessionId());
        dto.put("estado", d.getEstado());
        dto.put("numeroTelefono", d.getNumeroTelefono());
        dto.put("plataforma", d.getPlataforma() != null ? d.getPlataforma().name() : null);
        return dto;
    }
}
