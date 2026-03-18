package service;

import java.security.SecureRandom;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import exception.RegistroException;
import model.Agencia;
import model.Plan;
import model.SolicitudUnionEquipo;
import model.Usuario;
import repository.AgenciaRepository;
import repository.PlanRepository;
import repository.SolicitudUnionEquipoRepository;
import repository.UsuarioRepository;

@Service
public class UsuarioService {

    private static final Logger log = LoggerFactory.getLogger(UsuarioService.class);

    private static final String ROLE_USER = "USER";
    private static final String ROLE_ADMIN = "ADMIN";
    private static final String NOTIF_NUEVO_MIEMBRO = "NUEVO_MIEMBRO";
    private static final String NOTIF_SOLICITUD_UNION = "SOLICITUD_UNION";
    private static final String CHARACTERS = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";

    private final UsuarioRepository usuarioRepository;
    private final AgenciaRepository agenciaRepository;
    private final SolicitudUnionEquipoRepository solicitudUnionEquipoRepository;
    private final PlanRepository planRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final SimpMessagingTemplate messagingTemplate;
    private final SecureRandom secureRandom;

    public UsuarioService(UsuarioRepository usuarioRepository,
                          AgenciaRepository agenciaRepository,
                          SolicitudUnionEquipoRepository solicitudUnionEquipoRepository,
                          PlanRepository planRepository,
                          PasswordEncoder passwordEncoder,
                          EmailService emailService,
                          SimpMessagingTemplate messagingTemplate) {
        this.usuarioRepository = usuarioRepository;
        this.agenciaRepository = agenciaRepository;
        this.solicitudUnionEquipoRepository = solicitudUnionEquipoRepository;
        this.planRepository = planRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.messagingTemplate = messagingTemplate;
        this.secureRandom = new SecureRandom();
    }

    public Usuario findByEmail(String email) {
        return usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado con email: " + email));
    }

    public record SocketNotification(String tipo, String usuario) {

    }

    private String generarCodigoEmail() {
        int v = secureRandom.nextInt(900000) + 100000;
        return String.valueOf(v);
    }

    private String generarCodigoAgencia() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(CHARACTERS.charAt(secureRandom.nextInt(CHARACTERS.length())));
        }
        return sb.insert(3, "-").toString();
    }

    private void enviarNotificacionNuevoMiembro(Usuario usuario) {
        if (usuario.getAgencia() == null) {
            return;
        }
        try {
            messagingTemplate.convertAndSend("/topic/agencia/" + usuario.getAgencia().getId(),
                    new SocketNotification(NOTIF_NUEVO_MIEMBRO, usuario.getUsername()));
        } catch (MessagingException e) {
            log.error("Error enviando notificación WS: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("Error inesperado en notificación WS", e);
        }
    }

    private void crearNuevaAgenciaParaUsuario(Usuario usuario) {
        String nombreBase = "Equipo de " + usuario.getUsername();
        Agencia nuevaAgencia = new Agencia();
        nuevaAgencia.setNombre(nombreBase);

        String codigoEquipo = generarCodigoAgencia();
        while (agenciaRepository.findByCodigoInvitacion(codigoEquipo).isPresent()) {
            codigoEquipo = generarCodigoAgencia();
        }
        nuevaAgencia.setCodigoInvitacion(codigoEquipo);

        agenciaRepository.save(nuevaAgencia);
        usuario.setAgencia(nuevaAgencia);
        usuario.setRol(ROLE_ADMIN);
    }

    @Transactional
    public void registrarUsuario(String username, String password, String email, String codigoInvitacion) {
        if (username == null || password == null || email == null) {
            throw new IllegalArgumentException("Todos los campos son requeridos.");
        }
        
        Optional<Usuario> porEmail = usuarioRepository.findByEmail(email);

        if (porEmail.isPresent()) {
            manejarReintentoRegistro(porEmail.get(), username, password, codigoInvitacion);
            return;
        }

        if (usuarioRepository.findByUsername(username).isPresent()) {
            throw new RegistroException("El usuario " + username + " ya existe.");
        }

        crearNuevoUsuario(username, password, email, codigoInvitacion);
    }

    private void manejarReintentoRegistro(Usuario usuario, String username, String password, String codigoInvitacion) {
        if (Boolean.TRUE.equals(usuario.getVerificado())) {
            throw new RegistroException("El correo ya está registrado y verificado.");
        }
        
        String codigo = generarCodigoEmail();
        usuario.setCodigoVerificacion(codigo);
        usuario.setUsername(username);
        usuario.setPassword(passwordEncoder.encode(password));
        usuarioRepository.save(usuario);

        if (codigoInvitacion != null && !codigoInvitacion.isBlank()) {
            try {
                solicitarUnionAEquipo(usuario.getUsername(), codigoInvitacion);
            } catch (RegistroException ex) {
                log.warn("No se pudo crear solicitud de unión en reintento: {}", ex.getMessage());
            }
        }
        emailService.enviarCodigoVerificacion(usuario.getEmail(), codigo);
    }

    private void crearNuevoUsuario(String username, String password, String email, String codigoInvitacion) {
        Usuario nuevo = new Usuario();
        nuevo.setUsername(username);
        nuevo.setEmail(email);
        nuevo.setPassword(passwordEncoder.encode(password));
        nuevo.setVerificado(false);
        Plan planFree = planRepository.findByNombre("FREE")
            .orElseGet(() -> {
                Plan p = new Plan();
                p.setNombre("FREE");
                p.setMaxDispositivos(1);
                p.setPrecioMensual(0.0);
                return planRepository.save(p);
            });
        
        nuevo.setPlan(planFree); 

        if (codigoInvitacion == null || codigoInvitacion.isBlank()) {
            crearNuevaAgenciaParaUsuario(nuevo);
            nuevo.setAgenciaOriginalId(nuevo.getAgencia().getId());
        }

        String codigoEmail = generarCodigoEmail();
        nuevo.setCodigoVerificacion(codigoEmail);

        Usuario usuarioGuardado = usuarioRepository.save(nuevo);
        emailService.enviarCodigoVerificacion(email, codigoEmail);

        if (codigoInvitacion != null && !codigoInvitacion.isBlank()) {
            try {
                solicitarUnionAEquipo(usuarioGuardado.getUsername(), codigoInvitacion);
            } catch (RegistroException ex) {
                log.warn("No se pudo crear solicitud: {}", ex.getMessage());
            }
        }

        enviarNotificacionNuevoMiembro(usuarioGuardado);
    }

    public boolean verificarCodigo(String username, String codigoIngresado) {
        return usuarioRepository.findByUsername(username).map(u -> {
            if (u.getCodigoVerificacion() != null && u.getCodigoVerificacion().equals(codigoIngresado)) {
                u.setVerificado(true);
                u.setCodigoVerificacion(null);
                usuarioRepository.save(u);
                return true;
            }
            return false;
        }).orElse(false);
    }

    public void reenviarCodigo(String emailOrUsername) {
        Usuario u = usuarioRepository.findByEmail(emailOrUsername)
                .or(() -> usuarioRepository.findByUsername(emailOrUsername))
                .orElseThrow(() -> new RegistroException("Usuario no encontrado."));

        if (Boolean.TRUE.equals(u.getVerificado())) {
            throw new RegistroException("El usuario ya está verificado.");
        }

        String codigo = generarCodigoEmail();
        u.setCodigoVerificacion(codigo);
        usuarioRepository.save(u);
        emailService.enviarCodigoVerificacion(u.getEmail(), codigo);
    }

    public Usuario buscarPorUsername(String username) {
        return usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado: " + username));
    }

    @Transactional
    public void iniciarRecuperacionPassword(String email) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new RegistroException("No existe una cuenta con ese email."));
        String codigo = generarCodigoEmail();
        usuario.setCodigoVerificacion(codigo);
        usuarioRepository.save(usuario);

        emailService.enviarCodigoRecuperacion(email, codigo);
        log.info("Código de recuperación enviado a: {}", email);
    }

    @Transactional
    public void restablecerPassword(String email, String codigo, String nuevaPassword) {
        if (nuevaPassword == null || nuevaPassword.length() < 8) {
            throw new RegistroException("La contraseña debe tener al menos 8 caracteres.");
        }

        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new RegistroException("No existe una cuenta con ese email."));

        if (usuario.getCodigoVerificacion() == null || !usuario.getCodigoVerificacion().equals(codigo)) {
            throw new RegistroException("El código de recuperación es incorrecto o ha expirado.");
        }

        usuario.setPassword(passwordEncoder.encode(nuevaPassword));
        usuario.setCodigoVerificacion(null);
        usuarioRepository.save(usuario);

        log.info("Contraseña restablecida para: {}", email);
    }

    @Transactional
    public SolicitudUnionEquipo crearSolicitudUnion(Usuario solicitante, String codigoInvitacion) {
        Agencia agencia = agenciaRepository.findByCodigoInvitacion(codigoInvitacion)
                .orElseThrow(() -> new RegistroException("Código de invitación inválido."));

        if (solicitante.getAgencia() != null && agencia.equals(solicitante.getAgencia())) {
            throw new RegistroException("Ya eres miembro de este equipo.");
        }

        boolean existe = solicitudUnionEquipoRepository.findByUsuarioSolicitanteAndAgenciaDestinoAndEstado(
                solicitante, agencia, SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE).isPresent();

        if (existe) {
            throw new RegistroException("Ya tienes una solicitud pendiente para este equipo.");
        }

        SolicitudUnionEquipo solicitud = new SolicitudUnionEquipo(solicitante, agencia);
        return solicitudUnionEquipoRepository.save(solicitud);
    }

    @Transactional
    public void solicitarUnionAEquipo(String username, String codigoInvitacion) {
        Usuario usuario = buscarPorUsername(username);
        SolicitudUnionEquipo solicitud = crearSolicitudUnion(usuario, codigoInvitacion);

        try {
            String destino = "/topic/agencia/" + solicitud.getAgenciaDestino().getId();
            SocketNotification payload = new SocketNotification(NOTIF_SOLICITUD_UNION, usuario.getUsername());
            messagingTemplate.convertAndSend(destino, payload);
        } catch (MessagingException e) {
            log.debug("No se pudo notificar SOLICITUD_UNION por WS: {}", e.getMessage());
        }
    }

    @Transactional
    public void gestionarSolicitud(@NonNull Long solicitudId, boolean aprobar, Usuario admin) {
        SolicitudUnionEquipo solicitud = solicitudUnionEquipoRepository.findById(solicitudId)
                .orElseThrow(() -> new RegistroException("Solicitud no encontrada."));

        if (admin.getAgencia() == null || !admin.getAgencia().getId().equals(solicitud.getAgenciaDestino().getId())) {
            throw new RegistroException("No tienes permisos.");
        }

        if (solicitud.getEstado() != SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE) {
            throw new RegistroException("La solicitud ya fue gestionada.");
        }

        if (aprobar) {
            Usuario usuario = solicitud.getUsuarioSolicitante();
            usuario.setAgencia(solicitud.getAgenciaDestino());
            usuario.setRol(ROLE_USER);
            usuario.setPlan(admin.getPlan());
            usuario.setPlanVencimiento(admin.getPlanVencimiento());
            usuario.setProveedorPago(admin.getProveedorPago());

            usuarioRepository.save(usuario);
            solicitud.setEstado(SolicitudUnionEquipo.EstadoSolicitud.APROBADA);
            enviarNotificacionNuevoMiembro(usuario);
        } else {
            solicitud.setEstado(SolicitudUnionEquipo.EstadoSolicitud.RECHAZADA);
        }
        solicitudUnionEquipoRepository.save(solicitud);
    }

    @Transactional
    public void gestionarSolicitud(@NonNull Long solicitudId, boolean aprobar) {
        SolicitudUnionEquipo solicitud = solicitudUnionEquipoRepository.findById(solicitudId)
                .orElseThrow(() -> new RegistroException("Solicitud no encontrada."));

        if (solicitud.getEstado() != SolicitudUnionEquipo.EstadoSolicitud.PENDIENTE) {
            throw new RegistroException("Solicitud ya gestionada.");
        }
        if (aprobar) {
            Usuario u = solicitud.getUsuarioSolicitante();
            u.setAgencia(solicitud.getAgenciaDestino());
            u.setRol(ROLE_USER);
            usuarioRepository.save(u);
            solicitud.setEstado(SolicitudUnionEquipo.EstadoSolicitud.APROBADA);
            enviarNotificacionNuevoMiembro(u);
        } else {
            solicitud.setEstado(SolicitudUnionEquipo.EstadoSolicitud.RECHAZADA);
        }
        solicitudUnionEquipoRepository.save(solicitud);
    }

    @Transactional
    public void unirUsuarioAEquipo(String username, String codigoInvitacion) {
        solicitarUnionAEquipo(username, codigoInvitacion);
    }

    @Transactional
    public void abandonarEquipo(Usuario usuario) {
        if (ROLE_ADMIN.equals(usuario.getRol())) {
            throw new RegistroException("El administrador no puede abandonar su propio equipo.");
        }

        String nombreBuscado = "Equipo de " + usuario.getUsername();

        Optional<Agencia> agenciaPrevia = agenciaRepository.findByNombre(nombreBuscado);

        if (agenciaPrevia.isPresent()) {
            usuario.setAgencia(agenciaPrevia.get());
            usuario.setAgenciaOriginalId(agenciaPrevia.get().getId());
            log.info("Usuario {} regresó a su agencia original existente.", usuario.getUsername());
        } else {

            log.info("No se encontró agencia previa. Creando nuevo espacio para {}", usuario.getUsername());
            crearNuevaAgenciaParaUsuario(usuario);
            usuario.setAgenciaOriginalId(usuario.getAgencia().getId());
        }

        Plan planFree = planRepository.findByNombre("FREE")
                .orElseThrow(() -> new RegistroException("Error: Plan FREE no configurado."));

        usuario.setPlan(planFree);
        usuario.setPlanVencimiento(null);
        usuario.setProveedorPago(null);
        usuario.setRol(ROLE_ADMIN);

        usuarioRepository.save(usuario);
    }

}