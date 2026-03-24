package service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Usuario;
import repository.ClienteRepository;
import repository.UsuarioRepository;

@Service
public class DashboardService {

    private final ClienteRepository clienteRepository;
    private final UsuarioRepository usuarioRepository;

    public DashboardService(ClienteRepository clienteRepository, UsuarioRepository usuarioRepository) {
        this.clienteRepository = clienteRepository;
        this.usuarioRepository = usuarioRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getDashboardData(Usuario usuario) {
        if (usuario == null) return Collections.emptyMap();

        Map<String, Object> data = new HashMap<>();

        Map<String, Object> usuarioDto = new HashMap<>();
        usuarioDto.put("username", usuario.getUsername());
        usuarioDto.put("nombreCompleto", usuario.getNombreCompleto());
        usuarioDto.put("rol", usuario.getRol());
        usuarioDto.put("fotoUrl", usuario.getFotoUrl());
        data.put("usuario", usuarioDto);

        if (usuario.getAgencia() != null) {
            Map<String, Object> agenciaDto = new HashMap<>();
            agenciaDto.put("id", usuario.getAgencia().getId());
            agenciaDto.put("nombre", usuario.getAgencia().getNombre());
            agenciaDto.put("codigoInvitacion", usuario.getAgencia().getCodigoInvitacion());
            data.put("agencia", agenciaDto);

            Long agenciaId = usuario.getAgencia().getId();
            LocalDateTime inicioDelDia = LocalDate.now().atStartOfDay();

            long nuevosLeads = clienteRepository.countByAgenciaIdAndFechaRegistroAfter(agenciaId, inicioDelDia);
            long leadsSinLeer = clienteRepository.countByAgenciaIdAndMensajesSinLeerGreaterThan(agenciaId, 0);
            long totalLeads = clienteRepository.countByAgenciaId(agenciaId);

            data.put("nuevosLeads", nuevosLeads);
            data.put("leadsSinLeer", leadsSinLeer);
            data.put("totalLeads", totalLeads);
            data.put("whatsappConectado", totalLeads > 0);
            data.put("telegramConnected", false);

            List<Map<String, Object>> equipoDto = usuarioRepository.findByAgenciaId(agenciaId)
                    .stream()
                    .filter(u -> !u.getId().equals(usuario.getId()))
                    .map(u -> {
                        Map<String, Object> m = new HashMap<>();
                        m.put("username", u.getUsername());
                        m.put("nombreCompleto", u.getNombreCompleto());
                        m.put("email", u.getEmail());
                        m.put("rol", u.getRol());
                        m.put("fotoUrl", u.getFotoUrl());
                        return m;
                    })
                    .toList();
            data.put("equipo", equipoDto);

        } else {
            data.put("nuevosLeads", 0);
            data.put("leadsSinLeer", 0);
            data.put("totalLeads", 0);
            data.put("whatsappConectado", false);
            data.put("telegramConnected", false);
            data.put("equipo", Collections.emptyList());
            data.put("agencia", null);
        }

        return data;
    }
}