package service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
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

            long nuevosLeads       = clienteRepository.countByAgenciaIdAndFechaRegistroBetween(agenciaId, desde, hasta);
            long leadsSinLeer      = clienteRepository.countByAgenciaIdAndMensajesSinLeerGreaterThan(agenciaId, 0);
            long totalLeads        = clienteRepository.countByAgenciaIdAndFechaRegistroBetween(agenciaId, desde, hasta);
            long clientesConCarga  = transaccionRepository.countClientesConCargaByAgenciaAndFecha(agenciaId, desde, hasta);

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
            data.put("clientesConCarga", clientesConCarga);
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

            // Solo cuentan los devices PRINCIPAL: el dashboard refleja el embudo real,
            // no el sector /spam (los CAMPAÑAS pueden estar online sin que el negocio
            // tenga "WhatsApp conectado" en el sentido productivo).
            boolean waConectado = dispositivoRepository.findByAgenciaIdAndPlataforma(agenciaId, Dispositivo.Plataforma.WHATSAPP)
                    .stream()
                    .filter(d -> d.getProposito() == Dispositivo.Proposito.PRINCIPAL)
                    .anyMatch(d -> "CONNECTED".equals(d.getEstado()));
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

    // ════════════════════════════════════════════════════════════════════════
    // SERIES TEMPORALES (alimenta sparklines + gráfico de tendencia del dashboard)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Configuración de bucketing por período: unidad SQL de date_trunc, cantidad
     * de buckets y cómo etiquetar cada uno.
     */
    private enum Bucketing {
        TODAY("hour"), SEM("day"), MES("day"), ANUAL("month"), CUSTOM("day");
        final String sqlUnit;
        Bucketing(String sqlUnit) { this.sqlUnit = sqlUnit; }
    }

    private static final String[] LABELS_TODAY = {"00h","03h","06h","09h","12h","15h","18h","21h"};
    private static final String[] LABELS_SEM   = {"Lun","Mar","Mié","Jue","Vie","Sáb","Dom"};
    private static final String[] LABELS_MES   = {"S1","S2","S3","S4","S5"};
    private static final String[] LABELS_ANUAL = {"Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"};

    /**
     * Devuelve la serie temporal real del período. Estructura:
     * { "buckets": [ { "label": "Lun", "leads": n, "mensajes": n, "ingresos": n } ] }
     *
     * Reemplaza los generadores sintéticos (Math.sin) que tenía el frontend.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getSeries(Usuario usuario, String periodo,
                                         LocalDateTime desde, LocalDateTime hasta) {
        if (usuario == null || usuario.getAgencia() == null) {
            return Map.of("buckets", Collections.emptyList());
        }
        Long agenciaId = usuario.getAgencia().getId();
        Bucketing cfg = switch (periodo != null ? periodo : "today") {
            case "sem"   -> Bucketing.SEM;
            case "mes"   -> Bucketing.MES;
            case "anual" -> Bucketing.ANUAL;
            case "custom"-> Bucketing.CUSTOM;
            default      -> Bucketing.TODAY;
        };

        // Acumuladores por índice de bucket
        int n = bucketCount(cfg, desde, hasta);
        double[] leads    = new double[n];
        double[] mensajes = new double[n];
        double[] ingresos = new double[n];

        accumulate(clienteRepository.serieLeadsPorBucket(agenciaId, cfg.sqlUnit, desde, hasta), cfg, desde, leads);
        accumulate(mensajeRepository.serieMensajesPorBucket(agenciaId, cfg.sqlUnit, desde, hasta), cfg, desde, mensajes);
        accumulate(transaccionRepository.serieCargaPorBucket(agenciaId, cfg.sqlUnit, desde, hasta), cfg, desde, ingresos);

        List<Map<String, Object>> buckets = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("label", labelFor(cfg, i, desde));
            b.put("leads", (long) leads[i]);
            b.put("mensajes", (long) mensajes[i]);
            b.put("ingresos", Math.round(ingresos[i]));
            buckets.add(b);
        }
        return Map.of("buckets", buckets);
    }

    private int bucketCount(Bucketing cfg, LocalDateTime desde, LocalDateTime hasta) {
        return switch (cfg) {
            case TODAY -> LABELS_TODAY.length;
            case SEM   -> LABELS_SEM.length;
            case ANUAL -> LABELS_ANUAL.length;
            case MES   -> 5; // hasta 5 semanas en un mes
            case CUSTOM -> (int) Math.max(1, Math.min(31, ChronoUnit.DAYS.between(desde.toLocalDate(), hasta.toLocalDate()) + 1));
        };
    }

    /**
     * Mapea cada fila [bucket_timestamp, valor] al índice de bucket correspondiente
     * y acumula el valor. El bucket_timestamp viene truncado por date_trunc.
     */
    private void accumulate(List<Object[]> rows, Bucketing cfg, LocalDateTime desde, double[] acc) {
        for (Object[] row : rows) {
            if (row[0] == null) continue;
            LocalDateTime ts = toLocalDateTime(row[0]);
            double val = row[1] instanceof Number num ? num.doubleValue() : 0.0;
            int idx = bucketIndex(cfg, desde, ts, acc.length);
            if (idx >= 0 && idx < acc.length) acc[idx] += val;
        }
    }

    private int bucketIndex(Bucketing cfg, LocalDateTime desde, LocalDateTime ts, int n) {
        return switch (cfg) {
            case TODAY -> Math.min(ts.getHour() / 3, n - 1);            // 8 franjas de 3h
            case SEM   -> Math.min(Math.max(ts.getDayOfWeek().getValue() - 1, 0), n - 1); // Lun=0..Dom=6
            case MES   -> Math.min((ts.getDayOfMonth() - 1) / 7, n - 1); // semana del mes
            case ANUAL -> Math.min(ts.getMonthValue() - 1, n - 1);       // Ene=0..Dic=11
            case CUSTOM -> (int) Math.min(Math.max(ChronoUnit.DAYS.between(desde.toLocalDate(), ts.toLocalDate()), 0), n - 1);
        };
    }

    private String labelFor(Bucketing cfg, int i, LocalDateTime desde) {
        return switch (cfg) {
            case TODAY -> LABELS_TODAY[i];
            case SEM   -> LABELS_SEM[i];
            case MES   -> LABELS_MES[Math.min(i, LABELS_MES.length - 1)];
            case ANUAL -> LABELS_ANUAL[i];
            case CUSTOM -> desde.toLocalDate().plusDays(i).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM"));
        };
    }

    private LocalDateTime toLocalDateTime(Object dbValue) {
        if (dbValue instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (dbValue instanceof LocalDateTime ldt) return ldt;
        if (dbValue instanceof java.time.Instant inst) return LocalDateTime.ofInstant(inst, java.time.ZoneId.systemDefault());
        // Fallback defensivo: algunas versiones del driver devuelven OffsetDateTime
        if (dbValue instanceof java.time.OffsetDateTime odt) return odt.toLocalDateTime();
        return LocalDateTime.now();
    }
}