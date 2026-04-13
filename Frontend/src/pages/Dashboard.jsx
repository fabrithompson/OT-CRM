import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import useAudio from '../hooks/useAudio';
import NotificationBell from '../components/kanban/NotificationBell';

/* ── Spark data helper (simulated 7-point trend from totals) ── */
function buildSparkData(hoy, total) {
    const base = total > 0 ? Math.max(1, Math.floor(total / 30)) : 0;
    return Array.from({ length: 7 }, (_, i) =>
        ({ d: `D-${6 - i}`, v: i === 6 ? hoy : Math.max(0, base + Math.floor((Math.random() - 0.4) * base * 0.6)) })
    );
}

/* ── KPI Card ────────────────────────────────────────────── */
const KPI_COLORS = {
    green:  { icon: 'rgba(16,185,129,0.15)',  text: '#10b981', border: 'rgba(16,185,129,0.25)' },
    red:    { icon: 'rgba(239,68,68,0.15)',   text: '#ef4444', border: 'rgba(239,68,68,0.25)'  },
    blue:   { icon: 'rgba(99,102,241,0.15)',  text: '#818cf8', border: 'rgba(99,102,241,0.25)' },
    purple: { icon: 'rgba(168,85,247,0.15)',  text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
    teal:   { icon: 'rgba(20,184,166,0.15)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
};
function KpiCard({ icon, label, value, sub, color = 'green' }) {
    const c = KPI_COLORS[color] || KPI_COLORS.green;
    return (
        <div className="kpi-card">
            <div className="kpi-icon" style={{ background: c.icon, border: `1px solid ${c.border}` }}>
                <i className={`fas ${icon}`} style={{ color: c.text }} />
            </div>
            <div className="kpi-body">
                <span className="kpi-value" style={{ color: c.text }}>{value?.toLocaleString?.() ?? value}</span>
                <span className="kpi-label">{label}</span>
                <span className="kpi-sub">{sub}</span>
            </div>
        </div>
    );
}

/* ── Team Avatars stack ────────────────────────────────── */
function TeamAvatars({ equipo, usuarioActual, onlineUsers, rol, agenciaId, onLeave }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const MAX_VISIBLE = 3;
    const allMembers = equipo || [];
    const visible = allMembers.slice(0, MAX_VISIBLE);
    const extra   = allMembers.length - MAX_VISIBLE;

    const getInitials = (u) => {
        const name = u.nombreCompleto || u.username || '?';
        const parts = name.trim().split(' ');
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    };

    const isOnline = (m) => m.username === usuarioActual?.username || onlineUsers?.has(m.username);

    if (!allMembers || allMembers.length === 0) return null;

    const canLeave = rol !== 'ADMIN' && agenciaId;

    return (
        <div className="team-avatars-wrap" ref={ref}>
            <button type="button" className="team-avatars-trigger" onClick={() => setOpen(v => !v)} title="Ver equipo">
                {visible.map((m, i) => (
                    <span key={m.id || i} className="team-avatar-slot" style={{ zIndex: MAX_VISIBLE - i }}>
                        {m.fotoUrl
                            ? <img src={m.fotoUrl} alt={m.nombreCompleto || m.username} className="team-avatar-img" />
                            : <span className="team-avatar-placeholder">{getInitials(m)}</span>}
                        <span className={`team-avatar-dot ${isOnline(m) ? 'online' : 'offline'}`} />
                    </span>
                ))}
                {extra > 0 && <span className="team-avatar-extra">+{extra}</span>}
            </button>

            {open && (
                <div className="team-dropdown">
                    <div className="team-dropdown-title">Equipo · {allMembers.length} miembro{allMembers.length !== 1 ? 's' : ''}</div>
                    {allMembers.map((m, i) => (
                        <div key={m.id || i} className="team-dropdown-row">
                            <span className="team-dd-avatar-slot">
                                {m.fotoUrl
                                    ? <img src={m.fotoUrl} alt="" className="team-dd-avatar-img" />
                                    : <span className="team-dd-avatar-placeholder">{getInitials(m)}</span>}
                                <span className={`team-dd-dot ${isOnline(m) ? 'online' : 'offline'}`} />
                            </span>
                            <div className="team-dd-info">
                                <span className="team-dd-name">{m.nombreCompleto || m.username}</span>
                                <span className="team-dd-email">{m.email || ''}</span>
                            </div>
                            {m.rol === 'ADMIN' && <span className="team-dd-badge-admin">Admin</span>}
                        </div>
                    ))}
                    {canLeave && (
                        <div className="team-dropdown-footer">
                            <button type="button" className="team-dd-leave-btn" onClick={onLeave}>
                                <i className="fas fa-sign-out-alt" /> Dejar equipo
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

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
        mensajesHoy: 0,
        totalMensajes: 0,
        totalCarga: 0,
        totalRetiro: 0,
        ultimasTransacciones: [],
        whatsappConectado: false,
        telegramConnected: false,
        agencia: { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' },
        equipo: [],
        solicitudes: [],
    });

    const [moneda, setMoneda] = useState('USD');
    const TASAS = { USD: 1, EUR: 0.92, BRL: 5.0, ARS: 900, MXN: 17.2 };
    const SIMBOLOS = { USD: '$', EUR: '€', BRL: 'R$', ARS: '$', MXN: '$' };
    const convertir = (usd) => (usd * TASAS[moneda]).toLocaleString('es-AR', { maximumFractionDigits: 0 });

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

    // Escuchar presencia global desde MainLayout
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
            const data = statsRes.status === 'fulfilled' ? statsRes.value.data : {};
            const tgDevices = tgRes.status === 'fulfilled' ? tgRes.value.data : [];
            const waDevices = waRes.status === 'fulfilled' ? waRes.value.data : [];
            const telegramConectado = tgDevices.some(d => d.estado === 'CONECTADO');
            const whatsappConectado = waDevices.some(d => d.estado === 'CONNECTED');
            const usuario = data.usuario || {};
            const agencia = data.agencia || { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' };
            const rol     = usuario.rol || 'USER';

            setUsuarioActual({
                username:       usuario.username || 'Usuario',
                nombreCompleto: usuario.nombreCompleto || usuario.username || 'Usuario',
                email:          usuario.email || '',
                fotoUrl:        usuario.fotoUrl || null,
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
                nuevosLeads:          data.nuevosLeads          || 0,
                leadsSinLeer:         data.leadsSinLeer         || 0,
                totalLeads:           data.totalLeads           || 0,
                mensajesHoy:          data.mensajesHoy          || 0,
                totalMensajes:        data.totalMensajes        || 0,
                totalCarga:           data.totalCarga           || 0,
                totalRetiro:          data.totalRetiro          || 0,
                ultimasTransacciones: data.ultimasTransacciones || [],
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

    /* ── Debounced silent refresh (max 1 call per 1.5s) ── */
    const fetchRef = useRef(null);
    fetchRef.current = fetchDashboardData;

    const debouncedRefresh = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => fetchRef.current(true), 1500);
    }, []);

    /* ── WebSocket: real-time subscriptions ── */
    const handleWSEvent = useCallback(() => {}, []);

    useWebSocket(agenciaId, handleWSEvent, (client) => {
        // Team events: new solicitation, new member, profile updates
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
                                username: ev.nombreUsuario,
                                fotoUrl: ev.fotoUrl,
                            },
                        }],
                    }));
                    playNotification();
                } else if (ev.tipo === 'NUEVO_MIEMBRO' || ev.tipo === 'PERFIL_ACTUALIZADO') {
                    debouncedRefresh();
                }
            } catch {}
        });

        // Device connection/disconnection
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (ev.tipo === 'CONNECTED' || ev.tipo === 'DISCONNECTED') {
                    debouncedRefresh();
                    if (ev.tipo === 'CONNECTED') playNotification();
                }
            } catch {}
        });

        // Lead / message events → refresh metrics
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

    const btnConnectionStyle = (connected) => ({
        minWidth: '110px',
        color: connected ? '#10b981' : 'inherit',
        borderColor: connected ? '#10b981' : 'rgba(255,255,255,0.25)',
        border: `1px solid ${connected ? '#10b981' : 'rgba(255,255,255,0.25)'}`,
        background: 'rgba(255,255,255,0.05)',
        padding: '8px 16px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.9rem',
        transition: 'all 0.2s',
    });

    if (loading) return (
        <div style={{ padding: '2rem', color: 'white', display: 'flex', justifyContent: 'center', marginTop: '50px' }}>
            <div className="spinner"></div>
        </div>
    );

    const otrosMiembros = dashboardData.equipo.filter(u => u.username !== usuarioActual?.username);

    const renderMiembro = (user, isSelf = false) => {
        const isOnline = isSelf || onlineUsers.has(user.username);
        return (
            <div key={user.username} className="member-row" style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="avatar-container" style={{ width: '38px', height: '38px', position: 'relative' }}>
                            {user.fotoUrl ? (
                                <img src={user.fotoUrl} className="user-avatar-img" alt="avatar"
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#1e293b', borderRadius: '50%', color: '#fff', fontWeight: 700 }}>
                                    {(user.nombreCompleto || user.username || 'U').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <span style={{
                                position: 'absolute', bottom: 1, right: 1,
                                width: 10, height: 10, borderRadius: '50%',
                                background: isOnline ? '#10b981' : '#6b7280',
                                border: '2px solid #0f1214',
                            }} />
                        </div>
                        <div>
                            <p style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                                {user.nombreCompleto || user.username}
                            </p>
                            <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>
                                {user.email || ''}
                            </p>
                        </div>
                    </div>
                    {user.rol === 'ADMIN' && (
                        <div style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="dashboard-content" style={{ padding: '2rem', overflowY: 'auto', height: '100%' }}>

            {/* Header */}
            <div className="welcome-header">
                <div>
                    <h1>{(() => { const h = new Date().getHours(); return h >= 6 && h < 12 ? 'Buenos días' : h >= 12 && h < 20 ? 'Buenas tardes' : 'Buenas noches'; })()}, <span>{dashboardData.nombreUsuario}</span></h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Resumen de actividad en tiempo real.</p>
                </div>
                <div className="welcome-header-actions">
                    {/* Team avatars */}
                    <TeamAvatars
                        equipo={dashboardData.equipo}
                        usuarioActual={usuarioActual}
                        onlineUsers={onlineUsers}
                        rol={dashboardData.rol}
                        agenciaId={dashboardData.agencia?.id}
                        onLeave={() => setMostrarModalAbandonar(true)}
                    />

                    {/* Excel report */}
                    <button
                        type="button"
                        className="btn-excel-animado"
                        title="Descargar Reporte Diario"
                        onClick={async () => {
                            try {
                                const res = await api.get('/reportes/descargar/excel', { responseType: 'blob' });
                                const url = URL.createObjectURL(res.data);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'reporte.xlsx';
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch {
                                alert('Error al descargar el reporte.');
                            }
                        }}
                    >
                        <i className="fas fa-file-excel"></i>
                        <span className="texto-btn">Descargar Reporte</span>
                    </button>

                    {/* Notifications */}
                    <NotificationBell />

                    {/* Owner avatar → perfil */}
                    <button
                        type="button"
                        className="hdr-owner-btn"
                        title="Mi perfil"
                        onClick={() => navigate('/perfil')}
                    >
                        {usuarioActual?.fotoUrl
                            ? <img src={usuarioActual.fotoUrl} alt="perfil" className="hdr-owner-img" />
                            : <span className="hdr-owner-placeholder">
                                {usuarioActual ? (usuarioActual.nombreCompleto || usuarioActual.username || '?').slice(0, 2).toUpperCase() : '?'}
                              </span>}
                    </button>
                </div>
            </div>

            {/* ── KPI Row ── */}
            <div className="kpi-grid">
                <KpiCard icon="fa-comment-dots"  label="Mensajes hoy"     value={dashboardData.mensajesHoy}   sub="Se resetea a medianoche"  color="green" />
                <KpiCard icon="fa-envelope"       label="Sin leer"         value={dashboardData.leadsSinLeer}  sub="Conversaciones pendientes" color={dashboardData.leadsSinLeer > 0 ? 'red' : 'green'} />
                <KpiCard icon="fa-comments"       label="Total mensajes"   value={dashboardData.totalMensajes} sub="Histórico acumulado"       color="blue"  />
                <KpiCard icon="fa-user-plus"      label="Contactos hoy"    value={dashboardData.nuevosLeads}   sub="Registrados desde las 00hs" color="purple" />
                <KpiCard icon="fa-users"          label="Contactos activos" value={dashboardData.totalLeads}   sub="En el embudo"              color="teal" />
            </div>

            {/* ── Analytics Row ── */}
            <div className="analytics-grid">

                {/* Financiero */}
                <div className="an-card an-card--finance">
                    <div className="an-card-header">
                        <span className="an-card-title"><i className="fas fa-wallet" /> Financiero</span>
                        <select
                            className="currency-select"
                            value={moneda}
                            onChange={e => setMoneda(e.target.value)}
                        >
                            <option value="USD">USD $</option>
                            <option value="EUR">EUR €</option>
                            <option value="BRL">BRL R$</option>
                            <option value="ARS">ARS $</option>
                            <option value="MXN">MXN $</option>
                        </select>
                    </div>

                    <div className="finance-summary">
                        <div className="finance-stat finance-stat--in">
                            <span className="fs-label"><i className="fas fa-arrow-down" /> Total cargado</span>
                            <span className="fs-value">{SIMBOLOS[moneda]}{convertir(dashboardData.totalCarga)}</span>
                        </div>
                        <div className="finance-divider" />
                        <div className="finance-stat finance-stat--out">
                            <span className="fs-label"><i className="fas fa-arrow-up" /> Total retirado</span>
                            <span className="fs-value">{SIMBOLOS[moneda]}{convertir(dashboardData.totalRetiro)}</span>
                        </div>
                        <div className="finance-divider" />
                        <div className="finance-stat finance-stat--net">
                            <span className="fs-label"><i className="fas fa-balance-scale" /> Saldo neto</span>
                            <span className="fs-value">{SIMBOLOS[moneda]}{convertir(dashboardData.totalCarga - dashboardData.totalRetiro)}</span>
                        </div>
                    </div>

                    <div className="tx-list-header">Últimas transacciones</div>
                    {dashboardData.ultimasTransacciones.length === 0 ? (
                        <p className="tx-empty">Sin transacciones registradas</p>
                    ) : dashboardData.ultimasTransacciones.map((tx, i) => (
                        <div key={i} className="tx-row">
                            <span className={`tx-badge ${tx.tipo === 'CARGA' ? 'tx-badge--in' : 'tx-badge--out'}`}>
                                <i className={`fas ${tx.tipo === 'CARGA' ? 'fa-plus' : 'fa-minus'}`} />
                            </span>
                            <div className="tx-info">
                                <span className="tx-cliente">{tx.cliente}</span>
                                <span className="tx-fecha">{tx.fecha ? new Date(tx.fecha).toLocaleDateString('es-AR') : ''}</span>
                            </div>
                            <span className={`tx-monto ${tx.tipo === 'CARGA' ? 'tx-monto--in' : 'tx-monto--out'}`}>
                                {tx.tipo === 'CARGA' ? '+' : '-'}{SIMBOLOS[moneda]}{convertir(tx.monto)}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Mensajes chart */}
                <div className="an-card an-card--msgs">
                    <div className="an-card-header">
                        <span className="an-card-title"><i className="fas fa-chart-area" /> Actividad de mensajes</span>
                    </div>
                    <div className="msgs-big-number">
                        <span className="msgs-num">{dashboardData.mensajesHoy.toLocaleString()}</span>
                        <span className="msgs-label">mensajes hoy</span>
                    </div>
                    <div className="msgs-chart-wrap">
                        <ResponsiveContainer width="100%" height={90}>
                            <AreaChart data={buildSparkData(dashboardData.mensajesHoy, dashboardData.totalMensajes)} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Tooltip
                                    contentStyle={{ background: 'rgba(14,14,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.78rem' }}
                                    labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                                    itemStyle={{ color: '#10b981' }}
                                    formatter={(v) => [v, 'mensajes']}
                                />
                                <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} fill="url(#msgGrad)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="msgs-stats-row">
                        <div className="msgs-stat">
                            <span className="msgs-stat-v">{dashboardData.totalMensajes.toLocaleString()}</span>
                            <span className="msgs-stat-l">Total histórico</span>
                        </div>
                        <div className="msgs-stat">
                            <span className="msgs-stat-v">{dashboardData.totalLeads > 0 ? (dashboardData.totalMensajes / dashboardData.totalLeads).toFixed(1) : '—'}</span>
                            <span className="msgs-stat-l">Prom. por contacto</span>
                        </div>
                        <div className="msgs-stat">
                            <span className="msgs-stat-v">{dashboardData.leadsSinLeer}</span>
                            <span className="msgs-stat-l">Sin responder</span>
                        </div>
                    </div>
                </div>

                {/* Canales + Conexiones */}
                <div className="an-card an-card--channels">
                    <div className="an-card-header">
                        <span className="an-card-title"><i className="fas fa-plug" /> Canales</span>
                    </div>
                    <div className="channel-row" onClick={() => navigate('/whatsapp-vincular')}>
                        <div className="channel-icon channel-icon--wa">
                            <i className="fab fa-whatsapp" />
                        </div>
                        <div className="channel-info">
                            <span className="channel-name">WhatsApp</span>
                            <span className={`channel-status ${dashboardData.whatsappConectado ? 'status--on' : 'status--off'}`}>
                                <span className="status-dot" />
                                {dashboardData.whatsappConectado ? 'Conectado' : 'Desconectado'}
                            </span>
                        </div>
                        <i className="fas fa-chevron-right channel-arrow" />
                    </div>
                    <div className="channel-divider" />
                    <div className="channel-row" onClick={() => navigate('/telegram-vincular')}>
                        <div className="channel-icon channel-icon--tg">
                            <i className="fab fa-telegram" />
                        </div>
                        <div className="channel-info">
                            <span className="channel-name">Telegram</span>
                            <span className={`channel-status ${dashboardData.telegramConnected ? 'status--on' : 'status--off'}`}>
                                <span className="status-dot" />
                                {dashboardData.telegramConnected ? 'Conectado' : 'Desconectado'}
                            </span>
                        </div>
                        <i className="fas fa-chevron-right channel-arrow" />
                    </div>
                    <div className="channel-divider" />

                    {/* Resumen rápido */}
                    <div className="quick-stats">
                        <div className="qs-item">
                            <i className="fas fa-fire qs-icon qs-icon--orange" />
                            <div>
                                <span className="qs-val">{dashboardData.nuevosLeads}</span>
                                <span className="qs-label">leads hoy</span>
                            </div>
                        </div>
                        <div className="qs-item">
                            <i className="fas fa-check-circle qs-icon qs-icon--green" />
                            <div>
                                <span className="qs-val">{dashboardData.totalLeads}</span>
                                <span className="qs-label">activos</span>
                            </div>
                        </div>
                        <div className="qs-item">
                            <i className="fas fa-bell qs-icon qs-icon--red" />
                            <div>
                                <span className="qs-val">{dashboardData.leadsSinLeer}</span>
                                <span className="qs-label">sin leer</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* Modal abandonar equipo */}
            {mostrarModalAbandonar && (
                <div
                    className="modal-overlay show"
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setMostrarModalAbandonar(false); }}
                >
                    <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '90%', border: '1px solid var(--border-glass)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.5rem', marginBottom: '10px', color: '#fff' }}>¿Dejar Equipo?</h3>
                        <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '25px' }}>
                            ¿Estás seguro de que querés dejar este equipo? Perderás el acceso al plan premium del administrador y volverás a tu plan gratuito.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setMostrarModalAbandonar(false)} className="btn-secondary">Cancelar</button>
                            <button onClick={ejecutarSalidaEquipo} className="btn-danger">Dejar equipo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}