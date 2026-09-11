package service;

import java.util.Optional;

import model.Usuario;

/**
 * Cache por request/hilo del Usuario autenticado.
 *
 * JwtRequestFilter ya resuelve el Usuario completo (via
 * CustomUserDetailsService, con agencia y plan EAGER) en CADA request para
 * armar el principal. Sin este cache, casi todos los controllers volvian a
 * pedirlo con la misma query (usuarioRepository.findByUsername) solo para
 * leer la agencia — el doble de round-trips a la base en cada request
 * autenticado de la app.
 *
 * Implementado con ThreadLocal en vez de un bean @RequestScope: WebSocketConfig
 * resuelve usuarios fuera del ciclo de vida de un HttpServletRequest (en los
 * hilos del broker STOMP tras el handshake), donde un bean @RequestScope
 * directamente rompe con "Scope 'request' is not active for the current
 * thread". El ThreadLocal es opt-in y no revienta si nadie lo pobló:
 * simplemente cae al camino normal (una query a la base).
 *
 * JwtRequestFilter y el interceptor de WebSocket llaman a limpiar() en un
 * finally al terminar de procesar, asi que nunca sobrevive mas alla de ese
 * request/mensaje aunque el pool de hilos lo reutilice para el siguiente.
 */
public final class RequestUsuarioCache {

    private static final ThreadLocal<Usuario> CACHE = new ThreadLocal<>();

    private RequestUsuarioCache() {}

    static void poblar(Usuario usuario) {
        CACHE.set(usuario);
    }

    public static void limpiar() {
        CACHE.remove();
    }

    public static Optional<Usuario> obtener(String username) {
        Usuario cached = CACHE.get();
        if (cached != null && username != null && username.equals(cached.getUsername())) {
            return Optional.of(cached);
        }
        return Optional.empty();
    }
}
