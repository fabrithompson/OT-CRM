package dto;

import java.util.List;

public record ClienteSearchResult(
    Long id,
    String nombre,
    String telefono,
    String fotoUrl,
    String origen,
    String etapa,
    String dispositivo,
    String ultimoMensaje,
    List<TagDto> etiquetas
) {
    public record TagDto(String nombre, String color) {}
}
