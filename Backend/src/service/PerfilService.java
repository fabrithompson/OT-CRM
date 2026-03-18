package service;

import java.util.Objects;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import exception.RegistroException;
import model.Usuario;
import repository.UsuarioRepository;

@Service
public class PerfilService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final CloudStorageService cloudStorageService;

    public PerfilService(UsuarioRepository usuarioRepository,
            PasswordEncoder passwordEncoder,
            CloudStorageService cloudStorageService) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
        this.cloudStorageService = cloudStorageService;
    }

    public Usuario findByUsername(String username) {
        return usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado: " + username));
    }

    @Transactional
    public void actualizarPerfil(String username, String nombreCompleto, String email, String newPassword, MultipartFile foto) {

        Usuario usuario = findByUsername(username);

        usuarioRepository.findByEmail(email).ifPresent(existingUser -> {
            if (!Objects.equals(existingUser.getId(), usuario.getId())) {
                throw new RegistroException("El correo electrónico ya está en uso por otro usuario.");
            }
        });

        usuario.setNombreCompleto(nombreCompleto);
        usuario.setEmail(email);

        if (newPassword != null && !newPassword.isEmpty()) {
            usuario.setPassword(passwordEncoder.encode(newPassword));
        }

        if (foto != null && !foto.isEmpty()) {
            String urlFoto = cloudStorageService.uploadFile(foto);
            usuario.setFotoUrl(urlFoto);
        }

        usuarioRepository.save(usuario);
    }
}
