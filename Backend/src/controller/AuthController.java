package controller;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import exception.RegistroException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import model.Usuario;
import security.JwtUtil;
import service.CustomUserDetailsService;
import service.RefreshTokenService;
import service.UsuarioService;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UsuarioService usuarioService;
    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final JwtUtil jwtUtil;
    private final RefreshTokenService refreshTokenService;

    public AuthController(UsuarioService usuarioService, AuthenticationManager authenticationManager,
                          CustomUserDetailsService userDetailsService, JwtUtil jwtUtil,
                          RefreshTokenService refreshTokenService) {
        this.usuarioService = usuarioService;
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.jwtUtil = jwtUtil;
        this.refreshTokenService = refreshTokenService;
    }

    public record LoginRequest(
            @NotBlank String username,
            @NotBlank String password) {}
    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50) String username,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Email String email,
            String codigoInvitacion) {}
    public record VerifyRequest(
            @NotBlank String username,
            @NotBlank String code) {}
    public record ResendCodeRequest(
            @NotBlank String emailOrUsername) {}
    public record ForgotPasswordRequest(
            @NotBlank @Email String email) {}
    public record ResetPasswordRequest(
            @NotBlank @Email String email,
            @NotBlank String code,
            @NotBlank @Size(min = 8) String newPassword,
            @NotBlank String confirmPassword) {}
    public record RefreshRequest(
            @NotBlank String refreshToken) {}

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password())
            );
        } catch (AuthenticationException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Credenciales inválidas"));
        }

        final UserDetails userDetails = userDetailsService.loadUserByUsername(request.username());
        final Usuario usuario = usuarioService.buscarPorUsername(request.username());

        final String accessToken = jwtUtil.generateAccessToken(userDetails);
        final String jti = UUID.randomUUID().toString();
        final String refreshToken = jwtUtil.generateRefreshToken(userDetails, jti);
        refreshTokenService.emitir(usuario.getId(), jti);

        return ResponseEntity.ok(Map.of(
                "token", accessToken,
                "refreshToken", refreshToken,
                "username", request.username()));
    }

    /**
     * Renueva el access token usando el refresh token. Rota el refresh token
     * en cada uso (RefreshTokenService.validarYRotar): el que llega se revoca
     * y se emite uno nuevo, así una copia vieja filtrada deja de servir apenas
     * el legítimo la usa una vez más.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@Valid @RequestBody RefreshRequest request) {
        var claims = jwtUtil.validarRefreshToken(request.refreshToken()).orElse(null);
        if (claims == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Sesión expirada, iniciá sesión de nuevo."));
        }

        final UserDetails userDetails;
        final Usuario usuario;
        try {
            userDetails = userDetailsService.loadUserByUsername(claims.username());
            usuario = usuarioService.buscarPorUsername(claims.username());
        } catch (UsernameNotFoundException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Sesión expirada, iniciá sesión de nuevo."));
        }

        String jtiNuevo = UUID.randomUUID().toString();
        if (!refreshTokenService.validarYRotar(claims.jti(), jtiNuevo, usuario.getId())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Sesión expirada, iniciá sesión de nuevo."));
        }

        return ResponseEntity.ok(Map.of(
                "token", jwtUtil.generateAccessToken(userDetails),
                "refreshToken", jwtUtil.generateRefreshToken(userDetails, jtiNuevo)));
    }

    /**
     * Logout con revocación real del lado del servidor: antes, cerrar sesión
     * solo borraba el token en el navegador, sin invalidar nada acá. Best
     * effort: si el refresh token ya es inválido/no existe, igual responde 200
     * (no hay nada que filtre si una sesión ya estaba cerrada o nunca existió).
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@Valid @RequestBody RefreshRequest request) {
        jwtUtil.validarRefreshToken(request.refreshToken())
                .ifPresent(claims -> refreshTokenService.revocar(claims.jti()));
        return ResponseEntity.ok(Map.of("message", "Sesión cerrada."));
    }

    @PostMapping("/register")
    public ResponseEntity<?> procesarRegistro(@Valid @RequestBody RegisterRequest request) {
        try {
            usuarioService.registrarUsuario(request.username(), request.password(), request.email(), request.codigoInvitacion());
            return ResponseEntity.ok(Map.of("message", "Usuario registrado. Por favor verifica tu cuenta."));
        } catch (RegistroException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Ocurrió un error al registrar. Intenta nuevamente."));
        }
    }

    @PostMapping("/verify")
    public ResponseEntity<?> procesarVerificacion(@Valid @RequestBody VerifyRequest request) {
        boolean ok = usuarioService.verificarCodigo(request.username(), request.code());
        if (ok) {
            return ResponseEntity.ok(Map.of("message", "Cuenta verificada exitosamente."));
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "Código de verificación incorrecto."));
        }
    }

    @PostMapping("/resend-code")
    public ResponseEntity<?> resendCode(@Valid @RequestBody ResendCodeRequest request) {
        try {
            usuarioService.reenviarCodigo(request.emailOrUsername());
            return ResponseEntity.ok(Map.of("message", "Te reenviamos un código si tu usuario no estaba verificado."));
        } catch (RegistroException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of("error", "No se pudo reenviar el código en este momento."));
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> procesarSolicitudRecuperacion(@Valid @RequestBody ForgotPasswordRequest request) {
        try {
            usuarioService.iniciarRecuperacionPassword(request.email());
            return ResponseEntity.ok(Map.of("message", "Te enviamos un código de recuperación a tu email."));
        } catch (RegistroException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Ocurrió un error. Por favor intentá nuevamente."));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> procesarRestablecimiento(@Valid @RequestBody ResetPasswordRequest request) {
        if (!request.newPassword().equals(request.confirmPassword())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Las contraseñas no coinciden."));
        }

        if (request.newPassword().length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("error", "La contraseña debe tener al menos 8 caracteres."));
        }

        try {
            usuarioService.restablecerPassword(request.email(), request.code(), request.newPassword());
            return ResponseEntity.ok(Map.of("message", "Contraseña cambiada exitosamente."));
        } catch (RegistroException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Ocurrió un error al cambiar la contraseña."));
        }
    }
}