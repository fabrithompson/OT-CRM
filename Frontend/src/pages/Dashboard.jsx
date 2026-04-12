import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import useAudio from '../hooks/useAudio';
import NotificationBell from '../components/kanban/NotificationBell';
import '../assets/css/dashboard.css';

/* ─── Visual sub-components ─────────────────── */

function RingChart({ value = 0, max = 100, size = 68, stroke = 6, color = '#10b981' }) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const dash = pct * circ;
    return (
        <div className="db-ring-wrap" style={{ width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={color} strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round" />
            </svg>
            <div className="db-ring-center" style={{ color }}>
                {Math.round(pct * 100)}%
            </div>
        </div>
    );
}

function MiniBars({ value = 0, count = 7, color = '#10b981' }) {
    const dimMap = {
        '#10b981': 'rgba(16,185,129,0.25)',
        '#f59e0b': 'rgba(245,158,11,0.25)',
        '#6366f1': 'rgba(99,102,241,0.25)',
    };
    const dim = dimMap[color] || 'rgba(255,255,255,0.12)';
    const bars = Array.from({ length: count }, (_, i) => {
        const seed = (((value + 1) * 17 + i * 31 + i * i * 7) % 97 + 97) % 97;
        return 14 + (seed % 86);
    });
    return (
        <div className="db-mini-bars">
            {bars.map((h, i) => (
                <div key={i} className="db-mini-bar"
                    style={{ height: `${h}%`, background: i === count - 1 ? color : dim }} />
            ))}
        </div>
    );
}

/* ─── Main component ─────────────────────────── */

export default function Dashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [usuarioActual, setUsuarioActual] = useState(null);
    const [dashboardData, setDashboardData] = useState({
        nombreUsuario: 'Usuario',
        rol: 'USER',
        nuevosLeads: 0,
        leadsSinLeer: 0,
        totalLeads: 0,
        whatsappConectado: false,
        telegramConnected: false,
        agencia: { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' },
        equipo: [],
        solicitudes: [],
    });

    const [codigoJoin, setCodigoJoin]           = useState('');
    const [joinFeedback, setJoinFeedback]       = useState({ message: '', error: false });
    const [mostrarModalAbandonar, setMostrarModalAbandonar] = useState(false);

    /* ── Real-time state ── */
    const [agenciaId, setAgenciaId]     = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const { playNotification }          = useAudio();
    const refreshTimerRef               = useRef(null);

    useEffect(() => { fetchDashboardData(); }, []);
    useEffect(() => () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); }, []);

    useEffect(() => {
        if (window.__crmOnlineUsers) setOnlineUsers(new Set(window.__crmOnlineUsers));
        const handler = (e) => setOnlineUsers(new Set(e.detail));
        window.addEventListener('crm:presence-updated', handler);
        return () => window.removeEventListener('crm:presence-updated', handler);
    }, []);

    const fetchDashboardData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [statsRes, tgRes, waRes] = await Promise.allSettled([
                api.get('/dashboard/stats'),
                api.get('/telegram-devices'),
                api.get('/whatsapp'),
            ]);
            const data      = statsRes.status === 'fulfilled' ? statsRes.value.data : {};
            const tgDevices = tgRes.status  === 'fulfilled' ? tgRes.value.data  : [];
            const waDevices = waRes.status  === 'fulfilled' ? waRes.value.data  : [];

            const telegramConectado = tgDevices.some(d => d.estado === 'CONECTADO');
            const whatsappConectado = waDevices.some(d => d.estado === 'CONNECTED');
            const usuario = data.usuario || {};
            const agencia = data.agencia || { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' };
            const rol     = usuario.rol || 'USER';

            setUsuarioActual({
                username:       usuario.username       || 'Usuario',
                nombreCompleto: usuario.nombreCompleto || usuario.username || 'Usuario',
                email:          usuario.email          || '',
                fotoUrl:        usuario.fotoUrl        || null,
                rol,
            });

            let solicitudesPendientes = [];
            if (rol === 'ADMIN' && agencia.id) {
                const solRes = await api.get('/dashboard/equipo/solicitudes-pendientes');
                solicitudesPendientes = solRes.data;
            }

            setDashboardData({
                nombreUsuario: usuario.nombreCompleto || usuario.username || 'Usuario',
                rol,
                nuevosLeads:       data.nuevosLeads  || 0,
                leadsSinLeer:      data.leadsSinLeer || 0,
                totalLeads:        data.totalLeads   || 0,
                whatsappConectado,
                telegramConnected: telegramConectado,
                agencia,
                equipo:      data.equipo || [],
                solicitudes: solicitudesPendientes,
            });

            if (agencia.id) setAgenciaId(agencia.id);
        } catch (error) {
            console.error('Error cargando el dashboard', error);
        } finally {
            setLoading(false);
        }
    };

    /* ── Debounced silent refresh ── */
    const fetchRef = useRef(null);
    fetchRef.current = fetchDashboardData;

    const debouncedRefresh = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => fetchRef.current(true), 1500);
    }, []);

    /* ── WebSocket subscriptions ── */
    const handleWSEvent = useCallback(() => {}, []);

    useWebSocket(agenciaId, handleWSEvent, (client) => {
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (ev.tipo === 'NUEVA_SOLICITUD') {
                    setDashboardData(prev => ({
                        ...prev,
                        solicitudes: [...prev.solicitudes, {
                            id: ev.id,
                            usuarioSolicitante: {
                                nombreCompleto: ev.nombreUsuario,
                                username:       ev.nombreUsuario,
                                fotoUrl:        ev.fotoUrl,
                            },
                        }],
                    }));
                    playNotification();
                } else if (ev.tipo === 'NUEVO_MIEMBRO' || ev.tipo === 'PERFIL_ACTUALIZADO') {
                    debouncedRefresh();
                }
            } catch {}
        });

        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (ev.tipo === 'CONNECTED' || ev.tipo === 'DISCONNECTED') {
                    debouncedRefresh();
                    if (ev.tipo === 'CONNECTED') playNotification();
                }
            } catch {}
        });

        client.subscribe(`/topic/embudo/${agenciaId}`, () => {
            debouncedRefresh();
        });
    });

    /* ── Actions ── */
    const copiarCodigo = () => {
        const codigo = dashboardData.agencia.codigoInvitacion;
        if (codigo && codigo !== '---') {
            navigator.clipboard.writeText(codigo).then(() => alert('¡Código de agencia copiado!'));
        }
    };

    const unirseAEquipo = async () => {
        if (!codigoJoin.trim()) {
            setJoinFeedback({ message: 'Por favor, ingresá un código.', error: true });
            return;
        }
        try {
            const res = await api.post('/dashboard/equipo/solicitar-union', { codigo: codigoJoin });
            setJoinFeedback({ message: res.data.message || 'Solicitud enviada.', error: false });
            setCodigoJoin('');
            fetchDashboardData(true);
        } catch (error) {
            setJoinFeedback({ message: error.response?.data?.error || 'No se pudo unir al equipo.', error: true });
        }
    };

    const gestionarSolicitud = async (solicitudId, aprobar) => {
        try {
            await api.post('/dashboard/equipo/gestionar-solicitud', { solicitudId, aprobar });
            fetchDashboardData(true);
        } catch (error) {
            alert(error.response?.data?.error || 'Error al gestionar la solicitud.');
        }
    };

    const ejecutarSalidaEquipo = async () => {
        try {
            await api.post('/dashboard/equipo/abandonar');
            setMostrarModalAbandonar(false);
            fetchDashboardData(true);
        } catch {
            alert('No se pudo abandonar el equipo.');
        }
    };

    /* ── Loading ── */
    if (loading) return (
        <div className="db-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
        </div>
    );

    /* ── Derived values ── */
    const otrosMiembros = dashboardData.equipo.filter(u => u.username !== usuarioActual?.username);
    const allMembers    = [usuarioActual, ...otrosMiembros].filter(Boolean);
    const onlineCount   = 1 + otrosMiembros.filter(u => onlineUsers.has(u.username)).length;

    const totalAll    = dashboardData.totalLeads;
    const sinLeerPct  = totalAll > 0 ? Math.round(dashboardData.leadsSinLeer / totalAll * 100) : 0;
    const activosPct  = 100 - sinLeerPct;

    const stackMax   = 4;
    const stackItems = allMembers.slice(0, stackMax);
    const stackExtra = allMembers.length - stackMax;

    const alertMode   = dashboardData.leadsSinLeer > 0;
    const sinLeerColor = alertMode ? '#f59e0b' : '#10b981';

    /* ── Render ── */
    return (
        <div className="db-root">

            {/* ── Top bar ── */}
            <div className="db-topbar">
                <div>
                    <h1 className="db-greeting">
                        Hola, <span>{dashboardData.nombreUsuario}</span>
                    </h1>
                    <p className="db-subtitle">Resumen de actividad en tiempo real</p>
                </div>

                <div className="db-topbar-right">
                    {/* Team avatar stack */}
                    <div className="db-avatar-stack">
                        {stackItems.map((u, i) => (
                            <div key={u.username || i} className="db-avatar-stack-item">
                                {u.fotoUrl
                                    ? <img src={u.fotoUrl} alt="av" />
                                    : (u.nombreCompleto || u.username || 'U').charAt(0).toUpperCase()}
                            </div>
                        ))}
                        {stackExtra > 0 && (
                            <div className="db-avatar-stack-item db-avatar-stack-more">+{stackExtra}</div>
                        )}
                    </div>

                    {/* Online badge */}
                    <div className="db-online-badge">
                        <span className="db-online-dot" />
                        {onlineCount} online
                    </div>

                    {/* Download report */}
                    <button
                        className="db-btn-download"
                        title="Descargar Reporte Diario"
                        onClick={async () => {
                            try {
                                const res = await api.get('/reportes/descargar/excel', { responseType: 'blob' });
                                const url = URL.createObjectURL(res.data);
                                const a = document.createElement('a');
                                a.href = url; a.download = 'reporte.xlsx'; a.click();
                                URL.revokeObjectURL(url);
                            } catch { alert('Error al descargar el reporte.'); }
                        }}
                    >
                        <i className="fas fa-file-excel" />
                        <span>Descargar Reporte</span>
                    </button>

                    <NotificationBell />
                </div>
            </div>

            {/* ── Metric cards ── */}
            <div className="db-metrics-row">

                {/* Nuevos Leads */}
                <div className="db-metric-card" style={{ '--db-accent': '#10b981' }}>
                    <div className="db-metric-top">
                        <div>
                            <p className="db-metric-label">
                                <i className="fas fa-user-plus" style={{ marginRight: 5 }} />
                                Nuevos Leads
                            </p>
                            <div className="db-metric-value">{dashboardData.nuevosLeads}</div>
                            <div className="db-metric-sub">Últimas 24 h</div>
                        </div>
                        <RingChart
                            value={dashboardData.nuevosLeads}
                            max={Math.max(totalAll, 1)}
                            color="#10b981"
                        />
                    </div>
                    <MiniBars value={dashboardData.nuevosLeads} color="#10b981" />
                </div>

                {/* Sin Leer */}
                <div className={`db-metric-card${alertMode ? ' alert-card' : ''}`}
                    style={{ '--db-accent': sinLeerColor }}>
                    <div className="db-metric-top">
                        <div>
                            <p className="db-metric-label">
                                <i className="fas fa-envelope-open" style={{ marginRight: 5 }} />
                                Sin Leer
                            </p>
                            <div className="db-metric-value">{dashboardData.leadsSinLeer}</div>
                            <div className="db-metric-sub">Pendientes de atención</div>
                        </div>
                        <RingChart
                            value={dashboardData.leadsSinLeer}
                            max={Math.max(totalAll, 1)}
                            color={sinLeerColor}
                        />
                    </div>
                    <MiniBars value={dashboardData.leadsSinLeer} color={sinLeerColor} />
                </div>

                {/* Total Activos */}
                <div className="db-metric-card" style={{ '--db-accent': '#6366f1' }}>
                    <div className="db-metric-top">
                        <div>
                            <p className="db-metric-label">
                                <i className="fas fa-layer-group" style={{ marginRight: 5 }} />
                                Total Activos
                            </p>
                            <div className="db-metric-value">{dashboardData.totalLeads}</div>
                            <div className="db-metric-sub">Leads en cartera</div>
                        </div>
                        <RingChart
                            value={totalAll}
                            max={Math.max(Math.ceil(totalAll * 1.25), 50)}
                            color="#6366f1"
                        />
                    </div>
                    <MiniBars value={dashboardData.totalLeads} color="#6366f1" />
                </div>
            </div>

            {/* ── Main grid ── */}
            <div className="db-main-grid">

                {/* ── Left column ── */}
                <div className="db-col-left">

                    {/* Channels */}
                    <div className="db-card">
                        <p className="db-card-title">
                            <i className="fas fa-plug" /> Canales de Mensajería
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* WhatsApp */}
                            <div className="db-channel-item">
                                <div className="db-channel-left">
                                    <div className="db-channel-icon"
                                        style={{ background: 'rgba(37,211,102,0.12)' }}>
                                        <i className="fab fa-whatsapp" style={{ color: '#25D366' }} />
                                    </div>
                                    <div>
                                        <p className="db-channel-name">WhatsApp</p>
                                        <span className="db-channel-status"
                                            style={{ color: dashboardData.whatsappConectado ? '#10b981' : 'rgba(255,255,255,0.35)' }}>
                                            {dashboardData.whatsappConectado ? 'Conectado' : 'Sin vincular'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className={`db-channel-btn ${dashboardData.whatsappConectado ? 'connected' : 'disconnected'}`}
                                    onClick={() => navigate('/whatsapp-vincular')}>
                                    {dashboardData.whatsappConectado
                                        ? <><i className="fas fa-check-circle" /> Conectado</>
                                        : <><i className="fas fa-link" /> Vincular</>}
                                </button>
                            </div>

                            {/* Telegram */}
                            <div className="db-channel-item">
                                <div className="db-channel-left">
                                    <div className="db-channel-icon"
                                        style={{ background: 'rgba(36,161,222,0.12)' }}>
                                        <i className="fab fa-telegram" style={{ color: '#24A1DE' }} />
                                    </div>
                                    <div>
                                        <p className="db-channel-name">Telegram</p>
                                        <span className="db-channel-status"
                                            style={{ color: dashboardData.telegramConnected ? '#10b981' : 'rgba(255,255,255,0.35)' }}>
                                            {dashboardData.telegramConnected ? 'Conectado' : 'Sin vincular'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className={`db-channel-btn ${dashboardData.telegramConnected ? 'connected' : 'disconnected'}`}
                                    onClick={() => navigate('/telegram-vincular')}>
                                    {dashboardData.telegramConnected
                                        ? <><i className="fas fa-check-circle" /> Conectado</>
                                        : <><i className="fas fa-link" /> Vincular</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Summary + distribution */}
                    <div className="db-card">
                        <p className="db-card-title">
                            <i className="fas fa-chart-pie" /> Resumen del Equipo
                        </p>

                        <div className="db-summary-stats">
                            <div className="db-summary-stat">
                                <span className="db-summary-stat-val" style={{ color: '#10b981' }}>
                                    {allMembers.length}
                                </span>
                                <span className="db-summary-stat-lbl">Miembros</span>
                            </div>
                            <div className="db-summary-stat">
                                <span className="db-summary-stat-val" style={{ color: '#6366f1' }}>
                                    {onlineCount}
                                </span>
                                <span className="db-summary-stat-lbl">En línea</span>
                            </div>
                        </div>

                        {/* Lead distribution ring */}
                        <div className="db-dist-wrap">
                            <RingChart
                                value={totalAll - dashboardData.leadsSinLeer}
                                max={Math.max(totalAll, 1)}
                                size={74}
                                stroke={7}
                                color="#10b981"
                            />
                            <div className="db-dist-legend">
                                <div className="db-dist-legend-item">
                                    <span className="db-dist-dot" style={{ background: '#10b981' }} />
                                    Con seguimiento
                                    <span className="db-dist-pct">{activosPct}%</span>
                                </div>
                                <div className="db-dist-legend-item">
                                    <span className="db-dist-dot" style={{ background: '#f59e0b' }} />
                                    Sin leer
                                    <span className="db-dist-pct">{sinLeerPct}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Right column ── */}
                <div className="db-col-right">

                    {/* Team members card */}
                    <div className="db-card" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <p className="db-card-title" style={{ margin: 0 }}>
                                <i className="fas fa-users" /> Tu Equipo
                                {dashboardData.agencia?.nombre && dashboardData.agencia.nombre !== 'Sin Agencia' && (
                                    <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.28)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                                        — {dashboardData.agencia.nombre}
                                    </span>
                                )}
                            </p>
                            {dashboardData.rol !== 'ADMIN' && dashboardData.agencia?.id && (
                                <button
                                    onClick={() => setMostrarModalAbandonar(true)}
                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#ef4444', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', fontSize: '0.70rem', fontWeight: 700, fontFamily: 'Montserrat, sans-serif' }}>
                                    <i className="fas fa-sign-out-alt" style={{ marginRight: 4 }} />Dejar equipo
                                </button>
                            )}
                        </div>

                        {/* Member list */}
                        <div className="db-team-list">
                            {/* Current user (always online) */}
                            {usuarioActual && (
                                <div className="db-member-row">
                                    <div className="db-member-avatar">
                                        {usuarioActual.fotoUrl
                                            ? <img src={usuarioActual.fotoUrl} alt="av" />
                                            : (usuarioActual.nombreCompleto || usuarioActual.username || 'U').charAt(0).toUpperCase()}
                                        <span className="db-member-status-dot" style={{ background: '#10b981' }} />
                                    </div>
                                    <div className="db-member-info">
                                        <p className="db-member-name">
                                            {usuarioActual.nombreCompleto || usuarioActual.username}
                                            <span style={{ fontSize: '0.60rem', color: 'rgba(255,255,255,0.28)', fontWeight: 500, marginLeft: 5 }}>(vos)</span>
                                        </p>
                                        <p className="db-member-email">{usuarioActual.email}</p>
                                    </div>
                                    {usuarioActual.rol === 'ADMIN' && (
                                        <span className="db-member-badge admin">ADMIN</span>
                                    )}
                                    <span className="db-member-badge online">Online</span>
                                </div>
                            )}

                            {/* Other members */}
                            {otrosMiembros.map(u => {
                                const isOnline = onlineUsers.has(u.username);
                                return (
                                    <div key={u.username} className="db-member-row">
                                        <div className="db-member-avatar">
                                            {u.fotoUrl
                                                ? <img src={u.fotoUrl} alt="av" />
                                                : (u.nombreCompleto || u.username || 'U').charAt(0).toUpperCase()}
                                            <span className="db-member-status-dot"
                                                style={{ background: isOnline ? '#10b981' : '#374151' }} />
                                        </div>
                                        <div className="db-member-info">
                                            <p className="db-member-name">{u.nombreCompleto || u.username}</p>
                                            <p className="db-member-email">{u.email}</p>
                                        </div>
                                        {u.rol === 'ADMIN' && <span className="db-member-badge admin">ADMIN</span>}
                                        {isOnline && <span className="db-member-badge online">Online</span>}
                                    </div>
                                );
                            })}

                            {allMembers.length === 0 && (
                                <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                                    Sin miembros en el equipo
                                </p>
                            )}
                        </div>

                        {/* Non-admin member badge */}
                        {dashboardData.rol !== 'ADMIN' && dashboardData.agencia?.id && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10 }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '0.85rem' }} />
                                <span style={{ fontSize: '0.80rem', color: '#86efac', fontWeight: 600 }}>
                                    Miembro de <strong>{dashboardData.agencia.nombre}</strong>
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Admin panel: invite code + join form */}
                    {dashboardData.rol === 'ADMIN' && (
                        <div className="db-card">
                            <p className="db-card-title"><i className="fas fa-cog" /> Gestión de Equipo</p>
                            <div className="db-admin-row">
                                <div>
                                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.32)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        <i className="fas fa-user-plus" style={{ marginRight: 5 }} />Código de Invitación
                                    </p>
                                    <div className="db-invite-code-box">
                                        <span className="db-invite-code">
                                            {dashboardData.agencia?.codigoInvitacion || '---'}
                                        </span>
                                        <button className="db-copy-btn" onClick={copiarCodigo} title="Copiar código">
                                            <i className="fas fa-copy" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.32)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        <i className="fas fa-users" style={{ marginRight: 5 }} />Unirse a otro equipo
                                    </p>
                                    <div className="db-join-row">
                                        <input
                                            className="db-join-input"
                                            type="text"
                                            placeholder="Ej: JNJ-SVK"
                                            value={codigoJoin}
                                            onChange={e => setCodigoJoin(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && unirseAEquipo()}
                                        />
                                        <button className="db-join-btn" onClick={unirseAEquipo}>
                                            <i className="fas fa-paper-plane" />Solicitar
                                        </button>
                                    </div>
                                    {joinFeedback.message && (
                                        <div className={`db-feedback ${joinFeedback.error ? 'err' : 'ok'}`}>
                                            <i className={`fas ${joinFeedback.error ? 'fa-exclamation-circle' : 'fa-check-circle'}`} />
                                            {joinFeedback.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Non-admin without team: join form */}
                    {dashboardData.rol !== 'ADMIN' && !dashboardData.agencia?.id && (
                        <div className="db-card">
                            <p className="db-card-title"><i className="fas fa-users" /> Unirse a un Equipo</p>
                            <p style={{ margin: '0 0 10px', fontSize: '0.80rem', color: 'rgba(255,255,255,0.38)' }}>
                                Ingresá el código de invitación que te pasó tu administrador.
                            </p>
                            <div className="db-join-row">
                                <input
                                    className="db-join-input"
                                    type="text"
                                    placeholder="Ej: JNJ-SVK"
                                    value={codigoJoin}
                                    onChange={e => setCodigoJoin(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && unirseAEquipo()}
                                />
                                <button className="db-join-btn" onClick={unirseAEquipo}>
                                    <i className="fas fa-paper-plane" />Solicitar
                                </button>
                            </div>
                            {joinFeedback.message && (
                                <div className={`db-feedback ${joinFeedback.error ? 'err' : 'ok'}`}>
                                    <i className={`fas ${joinFeedback.error ? 'fa-exclamation-circle' : 'fa-check-circle'}`} />
                                    {joinFeedback.message}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pending requests (admin only) */}
                    {dashboardData.rol === 'ADMIN' && dashboardData.solicitudes.length > 0 && (
                        <div className="db-card">
                            <p className="db-card-title">
                                <i className="fas fa-clock" style={{ color: '#f59e0b' }} />
                                Solicitudes Pendientes
                                <span style={{ marginLeft: 6, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 4, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 800 }}>
                                    {dashboardData.solicitudes.length}
                                </span>
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {dashboardData.solicitudes.map(s => (
                                    <div key={s.id} className="db-solicitud-row">
                                        <div>
                                            <p className="db-sol-name">
                                                {s.usuarioSolicitante?.nombreCompleto || s.usuarioSolicitante?.username}
                                            </p>
                                            <p className="db-sol-sub">Quiere unirse al equipo</p>
                                        </div>
                                        <div className="db-sol-actions">
                                            <button className="db-sol-btn accept"
                                                onClick={() => gestionarSolicitud(s.id, true)}>
                                                <i className="fas fa-check" style={{ marginRight: 4 }} />Aceptar
                                            </button>
                                            <button className="db-sol-btn reject"
                                                onClick={() => gestionarSolicitud(s.id, false)}>
                                                <i className="fas fa-times" style={{ marginRight: 4 }} />Rechazar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modal: dejar equipo ── */}
            {mostrarModalAbandonar && (
                <div
                    className="db-modal-overlay"
                    onClick={e => { if (e.target === e.currentTarget) setMostrarModalAbandonar(false); }}
                >
                    <div className="db-modal">
                        <h3>¿Dejar Equipo?</h3>
                        <p>
                            ¿Estás seguro de que querés dejar este equipo? Perderás el acceso al plan premium
                            del administrador y volverás a tu plan gratuito.
                        </p>
                        <div className="db-modal-actions">
                            <button className="btn-secondary" onClick={() => setMostrarModalAbandonar(false)}>
                                Cancelar
                            </button>
                            <button className="btn-danger" onClick={ejecutarSalidaEquipo}>
                                Dejar equipo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
