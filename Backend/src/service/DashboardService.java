package service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import model.Dispositivo;
import model.Usuario;
import repository.ClienteRepository;
import repository.DispositivoRepository;
import repository.MensajeRepository;
import repository.TransaccionRepository;
import repository.UsuarioRepository;

@Service
public class DashboardService {

    private final ClienteRepository clienteRepository;
    private final UsuarioRepository usuarioRepository;
    private final DispositivoRepository dispositivoRepository;
    private final MensajeRepository mensajeRepository;
    private final TransaccionRepository transaccionRepository;

    public DashboardService(ClienteRepository clienteRepository, UsuarioRepository usuarioRepository,
                            DispositivoRepository dispositivoRepository,
                            MensajeRepository mensajeRepository,
                            TransaccionRepository transaccionRepository) {
        this.clienteRepository = clienteRepository;
        this.usuarioRepository = usuarioRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.mensajeRepository = mensajeRepository;
        this.transaccionRepository = transaccionRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getDashboardData(Usuario usuario, LocalDateTime desde, LocalDateTime hasta) {
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

            long nuevosLeads  = clienteRepository.countByAgenciaIdAndFechaRegistroBetween(agenciaId, desde, hasta);
            long leadsSinLeer = clienteRepository.countByAgenciaIdAndMensajesSinLeerGreaterThan(agenciaId, 0);
            long totalLeads   = clienteRepository.countByAgenciaId(agenciaId);

            long waLeads = 0, tgLeads = 0;
            for (Object[] row : clienteRepository.countByPlataformaAndFechaRegistroBetween(agenciaId, desde, hasta)) {
                String plat = row[0] != null ? row[0].toString() : "";
                long cnt = row[1] instanceof Number ? ((Number) row[1]).longValue() : 0L;
                if ("WHATSAPP".equals(plat)) waLeads = cnt;
                else if ("TELEGRAM".equals(plat)) tgLeads = cnt;
            }

            data.put("nuevosLeads", nuevosLeads);
            data.put("leadsSinLeer", leadsSinLeer);
            data.put("totalLeads", totalLeads);
            data.put("waLeads", waLeads);
            data.put("tgLeads", tgLeads);

            // ── Mensajes analytics ──
            long mensajesHoy   = mensajeRepository.countByClienteAgenciaIdAndFechaHoraBetween(agenciaId, desde, hasta);
            long totalMensajes = mensajeRepository.countByClienteAgenciaIdAndFechaHoraBetween(agenciaId, desde, hasta);
            data.put("mensajesHoy",   mensajesHoy);
            data.put("totalMensajes", totalMensajes);

            // ── Financiero ──
            Double totalCarga  = transaccionRepository.sumMontoByAgenciaIdAndTipoAndFecha(agenciaId, "CARGA",   desde, hasta);
            Double totalRetiro = transaccionRepository.sumMontoByAgenciaIdAndTipoAndFecha(agenciaId, "RETIRO",  desde, hasta);
            data.put("totalCarga",  totalCarga  != null ? totalCarga  : 0.0);
            data.put("totalRetiro", totalRetiro != null ? totalRetiro : 0.0);

            List<Map<String, Object>> ultimas = transaccionRepository
                    .findTop5ByAgenciaIdAndFecha(agenciaId, desde, hasta, PageRequest.of(0, 5))
                    .stream()
                    .map(t -> {
                        Map<String, Object> tx = new HashMap<>();
                        tx.put("id",    t.getId());
                        tx.put("monto", t.getMonto());
                        tx.put("tipo",  t.getTipo());
                        tx.put("fecha", t.getFecha() != null ? t.getFecha().toString() : "");
                        // Cliente
                        if (t.getCliente() != null) {
                            tx.put("cliente", t.getCliente().getNombre() != null ? t.getCliente().getNombre() : "Cliente");
                            // Dispositivo del cliente (canal)
                            if (t.getCliente().getDispositivo() != null) {
                                String alias = t.getCliente().getDispositivo().getAlias();
                                String plat  = t.getCliente().getDispositivo().getPlataforma() != null
                                        ? t.getCliente().getDispositivo().getPlataforma().name() : "";
                                tx.put("dispositivo", alias != null ? alias : plat);
                                tx.put("canal", plat);
                            } else {
                                tx.put("dispositivo", "—");
                                tx.put("canal", "");
                            }
                        } else {
                            tx.put("cliente", "Cliente");
                            tx.put("dispositivo", "—");
                            tx.put("canal", "");
                        }
                        // Usuario que realizó la transacción
                        if (t.getUsuario() != null) {
                            String nombre = t.getUsuario().getNombreCompleto() != null
                                    ? t.getUsuario().getNombreCompleto()
                                    : t.getUsuario().getUsername();
                            tx.put("operador", nombre);
                        } else {
                            tx.put("operador", "—");
                        }
                        return tx;
                    })
                    .toList();
            data.put("ultimasTransacciones", ultimas);

            boolean waConectado = dispositivoRepository.findByAgenciaIdAndPlataforma(agenciaId, Dispositivo.Plataforma.WHATSAPP)
                    .stream().anyMatch(d -> "CONNECTED".equals(d.getEstado()));
            boolean tgConectado = dispositivoRepository.findByAgenciaIdAndPlataforma(agenciaId, Dispositivo.Plataforma.TELEGRAM)
                    .stream().anyMatch(d -> "CONECTADO".equals(d.getEstado()));
            data.put("whatsappConectado", waConectado);
            data.put("telegramConnected", tgConectado);

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
            data.put("mensajesHoy", 0);
            data.put("totalMensajes", 0);
            data.put("totalCarga", 0.0);
            data.put("totalRetiro", 0.0);
            data.put("ultimasTransacciones", Collections.emptyList());
            data.put("whatsappConectado", false);
            data.put("telegramConnected", false);
            data.put("equipo", Collections.emptyList());
            data.put("agencia", null);
        }

        return data;
    }
}