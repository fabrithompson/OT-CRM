package util;

import org.springframework.web.server.ResponseStatusException;

import exception.RegistroException;

/**
 * Texto de error seguro para devolver al cliente.
 *
 * Los mensajes de excepciones de negocio (validaciones, límites del plan, registro)
 * están escritos para el usuario y se devuelven tal cual. Cualquier otra excepción
 * (SQL, IO, red, NullPointer...) puede traer nombres de clases, tablas o rutas
 * internas: se reemplaza por un texto genérico y el detalle queda solo en el log.
 *
 * También evita el null: Map.of("error", null) lanza NullPointerException.
 */
public final class MensajeError {

    public static final String GENERICO = "Ocurrió un error inesperado. Intentá de nuevo.";

    private MensajeError() {
    }

    public static String de(Throwable e) {
        return de(e, GENERICO);
    }

    public static String de(Throwable e, String generico) {
        if (e instanceof ResponseStatusException rse && rse.getReason() != null) {
            return rse.getReason();
        }
        boolean esDeNegocio = (e instanceof IllegalArgumentException && !(e instanceof NumberFormatException))
                || e instanceof IllegalStateException
                || e instanceof RegistroException;
        if (esDeNegocio && e.getMessage() != null && !e.getMessage().isBlank()) {
            return e.getMessage();
        }
        return generico;
    }
}
