package service;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.RefreshToken;
import repository.RefreshTokenRepository;

/**
 * Bookkeeping en DB de los refresh tokens: el JWT en sí (firma, subject,
 * expiración) se valida standalone en JwtUtil.validarRefreshToken; acá solo
 * vive el jti, para poder revocarlo — logout invalida uno puntual, y refresh
 * lo rota (revoca el viejo + emite uno nuevo) para acotar la ventana útil de
 * un refresh token robado.
 */
@Service
public class RefreshTokenService {

    private final RefreshTokenRepository repository;

    @Value("${jwt.refresh-expiration-days:30}")
    private int refreshExpirationDays;

    public RefreshTokenService(RefreshTokenRepository repository) {
        this.repository = repository;
    }

    public void emitir(Long usuarioId, String jti) {
        RefreshToken rt = new RefreshToken();
        rt.setJti(jti);
        rt.setUsuarioId(usuarioId);
        rt.setCreadoEn(LocalDateTime.now());
        rt.setExpiraEn(LocalDateTime.now().plusDays(refreshExpirationDays));
        rt.setRevocado(false);
        repository.save(rt);
    }

    /**
     * Valida que jtiViejo exista, no esté revocado ni vencido, y pertenezca al
     * usuario esperado (defensa extra sobre lo que ya valida la firma del JWT);
     * si todo eso da bien, lo revoca y emite jtiNuevo en su lugar. Atómico: si
     * la rotación falla a mitad de camino, no queda ni el viejo revocado sin
     * reemplazo ni un nuevo emitido sobre una validación que no cerró.
     */
    @Transactional
    public boolean validarYRotar(String jtiViejo, String jtiNuevo, Long usuarioIdEsperado) {
        Optional<RefreshToken> existente = repository.findByJti(jtiViejo);
        if (existente.isEmpty()) {
            return false;
        }
        RefreshToken rt = existente.get();
        if (rt.isRevocado() || rt.getExpiraEn().isBefore(LocalDateTime.now())
                || !rt.getUsuarioId().equals(usuarioIdEsperado)) {
            return false;
        }

        rt.setRevocado(true);
        repository.save(rt);
        emitir(usuarioIdEsperado, jtiNuevo);
        return true;
    }

    /** Logout: revocar un jti puntual. Silencioso si ya no existe o estaba revocado. */
    public void revocar(String jti) {
        repository.findByJti(jti).ifPresent(rt -> {
            rt.setRevocado(true);
            repository.save(rt);
        });
    }
}
