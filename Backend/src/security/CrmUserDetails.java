package security;

import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import model.Usuario;

/**
 * UserDetails propio. Ademas de lo que exige la interfaz, expone agenciaId,
 * usuarioId y rol sin que cada controller/interceptor que los necesite tenga
 * que volver a golpear la base con usuarioRepository.findByUsername(...)
 * (WebSocketConfig, PresenceHandshakeInterceptor, y en general cualquier
 * lugar que hoy hace ese lookup solo para leer la agencia).
 *
 * Los datos se copian de Usuario en loadUserByUsername() en vez de guardar
 * la entidad: Usuario es un objeto JPA que puede quedar detached fuera de
 * la transaccion, y ademas asi no se filtran campos sensibles (tokens de
 * Google, password hash aparte) a quien inspeccione el principal.
 */
public class CrmUserDetails implements UserDetails {

    private final Long usuarioId;
    private final String username;
    private final String password;
    private final String rol;
    private final Long agenciaId;
    private final boolean enabled;

    private CrmUserDetails(Long usuarioId, String username, String password, String rol,
                            Long agenciaId, boolean enabled) {
        this.usuarioId = usuarioId;
        this.username = username;
        this.password = password;
        this.rol = rol;
        this.agenciaId = agenciaId;
        this.enabled = enabled;
    }

    public static CrmUserDetails from(Usuario usuario) {
        Long agenciaId = usuario.getAgencia() != null ? usuario.getAgencia().getId() : null;
        // La columna 'rol' es nullable en la base (V1__baseline.sql); igual que
        // DashboardRestController al serializarlo, si viene null se asume USER
        // en vez de fallar el login.
        String rol = usuario.getRol() != null ? usuario.getRol() : "USER";
        return new CrmUserDetails(
                usuario.getId(),
                usuario.getUsername(),
                usuario.getPassword(),
                rol,
                agenciaId,
                Boolean.TRUE.equals(usuario.getVerificado())
        );
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public Long getAgenciaId() {
        return agenciaId;
    }

    public String getRol() {
        return rol;
    }

    @Override
    public List<GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + rol));
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
