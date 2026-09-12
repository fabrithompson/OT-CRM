package security;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtUtil {

    private static final String CLAIM_TYPE = "type";
    private static final String TYPE_ACCESS = "access";
    private static final String TYPE_REFRESH = "refresh";

    @Value("${jwt.secret}")
    private String secretKey;

    // Antes un unico token duraba 10hs sin refresh ni revocacion posible
    // (logout no invalidaba nada del lado del servidor). Ahora el access token
    // dura minutos; AuthController.refresh lo renueva con el refresh token
    // (RefreshTokenService, revocable por jti).
    @Value("${jwt.access-expiration-minutes:30}")
    private int accessExpirationMinutes;

    @Value("${jwt.refresh-expiration-days:30}")
    private int refreshExpirationDays;

    public record RefreshClaims(String username, String jti) {}

    private Key getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(token).getBody();
    }

    public String generateToken(UserDetails userDetails) {
        return generateAccessToken(userDetails);
    }

    public String generateAccessToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        claims.put(CLAIM_TYPE, TYPE_ACCESS);
        return createToken(claims, userDetails.getUsername(), accessExpirationMinutes * 60_000L, null);
    }

    /** jti: identificador único del refresh token, para poder revocarlo por RefreshTokenService. */
    public String generateRefreshToken(UserDetails userDetails, String jti) {
        Map<String, Object> claims = new HashMap<>();
        claims.put(CLAIM_TYPE, TYPE_REFRESH);
        return createToken(claims, userDetails.getUsername(), refreshExpirationDays * 86_400_000L, jti);
    }

    private String createToken(Map<String, Object> claims, String subject, long ttlMillis, String jti) {
        var builder = Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + ttlMillis));
        if (jti != null) {
            builder.setId(jti);
        }
        return builder.signWith(getSigningKey(), SignatureAlgorithm.HS256).compact();
    }

    /**
     * Válido para autenticar un request (JwtRequestFilter, WebSocketConfig):
     * firma OK, no expiró, y el tipo del token es "access" (o ausente).
     *
     * El "o ausente" es una ventana de compatibilidad: tokens emitidos ANTES
     * de este cambio (10hs de vida, sin claim "type") no tienen que quedar
     * invalidados de golpe al desplegar esto — igual expiran solos, a más
     * tardar, 10hs después del deploy. Un token que SÍ declara type=refresh
     * (emitido después del deploy) es rechazado igual como credencial de
     * acceso: no sirve para autenticar requests, solo para /auth/refresh.
     */
    public boolean validateToken(String token, UserDetails userDetails) {
        final Claims claims = extractAllClaims(token);
        final String username = claims.getSubject();
        final String tipo = claims.get(CLAIM_TYPE, String.class);
        return username.equals(userDetails.getUsername())
                && !claims.getExpiration().before(new Date())
                && userDetails.isEnabled()
                && (tipo == null || TYPE_ACCESS.equals(tipo));
    }

    /**
     * Valida un refresh token de forma standalone (sin UserDetails: el punto
     * de /auth/refresh es justamente renovar la sesión sin uno vigente).
     * Devuelve vacío si la firma es inválida, expiró, o no es de tipo refresh
     * — nunca tira excepción, para que el controller no necesite try/catch.
     */
    public Optional<RefreshClaims> validarRefreshToken(String token) {
        try {
            Claims claims = extractAllClaims(token);
            if (!TYPE_REFRESH.equals(claims.get(CLAIM_TYPE, String.class))) {
                return Optional.empty();
            }
            if (claims.getExpiration().before(new Date())) {
                return Optional.empty();
            }
            if (claims.getId() == null) {
                return Optional.empty();
            }
            return Optional.of(new RefreshClaims(claims.getSubject(), claims.getId()));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
