import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import useAudio from '../hooks/useAudio';
import NotificationBell from '../components/kanban/NotificationBell';

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
                nuevosLeads:       data.nuevosLeads       || 0,
                leadsSinLeer:      data.leadsSinLeer      || 0,
                totalLeads:        data.totalLeads        || 0,
                // Usar estado directo de los dispositivos, no el del stats (puede estar desactualizado)
                whatsappConectado: whatsappConectado,
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
            <div className="welcome-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1>Hola, <span>{dashboardData.nombreUsuario}</span></h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Resumen de actividad en tiempo real.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
                    <NotificationBell />
                </div>
            </div>

            {/* Métricas */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <h3>Nuevos Leads</h3>
                    <div className="metric-number">{dashboardData.nuevosLeads}</div>
                </div>
                <div className={`metric-card ${dashboardData.leadsSinLeer > 0 ? 'alert-mode' : ''}`}>
                    <h3>Sin Leer</h3>
                    <div className="metric-number">{dashboardData.leadsSinLeer}</div>
                </div>
                <div className="metric-card">
                    <h3>Total Activos</h3>
                    <div className="metric-number">{dashboardData.totalLeads}</div>
                </div>
            </div>

            <div className="section-grid">
                {/* Conexiones */}
                <div className="content-card" style={{ maxHeight: 'min-content' }}>
                    <div className="card-header">Vincula tus Números</div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '2rem' }}></i>
                                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>WhatsApp</span>
                            </div>
                            <button
                                style={btnConnectionStyle(dashboardData.whatsappConectado)}
                                onClick={() => navigate('/whatsapp-vincular')}
                            >
                                {dashboardData.whatsappConectado
                                    ? <><i className="fas fa-check-circle" style={{ marginRight: '5px' }}></i> Conectado</>
                                    : <> Vincular</>}
                            </button>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(128,128,128,0.2)' }}></div>

                        {/* Telegram */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <i className="fab fa-telegram" style={{ color: '#24A1DE', fontSize: '2rem' }}></i>
                                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Telegram</span>
                            </div>
                            <button
                                style={btnConnectionStyle(dashboardData.telegramConnected)}
                                onClick={() => navigate('/telegram-vincular')}
                            >
                                {dashboardData.telegramConnected
                                    ? <><i className="fas fa-check-circle" style={{ marginRight: '5px' }}></i> Conectado</>
                                    : <> Vincular</>}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Equipo */}
                <div className="content-card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Tu Equipo</span>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {dashboardData.rol !== 'ADMIN' && dashboardData.agencia?.id && (
                                <button
                                    onClick={() => setMostrarModalAbandonar(true)}
                                    className="btn-danger-soft"
                                    style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                                >
                                    <i className="fas fa-sign-out-alt"></i> Dejar equipo
                                </button>
                            )}
                            <span className="badge-team" style={{ fontSize: '0.75rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                {otrosMiembros.length + 1} Miembro{otrosMiembros.length !== 0 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    <div className="card-body">

                        {/* CASO 1: ADMIN → código de invitación + unirse a otro equipo */}
                        {dashboardData.rol === 'ADMIN' && (
                            <>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            <i className="fas fa-user-plus" style={{ marginRight: '8px' }}></i> Invitar con código:
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value={dashboardData.agencia?.codigoInvitacion || '---'}
                                                readOnly
                                                style={{ background: 'transparent', border: 'none', color: '#fff', fontFamily: 'monospace', fontWeight: 'bold', width: '120px', textAlign: 'right', outline: 'none' }}
                                            />
                                            <button onClick={copiarCodigo} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                <i className="fas fa-copy"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', padding: '16px', borderRadius: '10px', marginBottom: '15px' }}>
                                    <p style={{ color: '#a5b4fc', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <i className="fas fa-users"></i> Unirse a otro equipo con código de invitación
                                    </p>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="text"
                                            placeholder="Ej: JNJ-SVK"
                                            className="form-control"
                                            style={{ flexGrow: 1, letterSpacing: '1px', fontWeight: 600 }}
                                            value={codigoJoin}
                                            onChange={e => setCodigoJoin(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && unirseAEquipo()}
                                        />
                                        <button onClick={unirseAEquipo} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                                            <i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Solicitar
                                        </button>
                                    </div>
                                    {joinFeedback.message && (
                                        <div style={{ marginTop: '10px', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', background: joinFeedback.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: joinFeedback.error ? '#fca5a5' : '#86efac' }}>
                                            <i className={`fas ${joinFeedback.error ? 'fa-exclamation-circle' : 'fa-check-circle'}`} style={{ marginRight: 6 }}></i>
                                            {joinFeedback.message}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* CASO 2: No admin SIN equipo */}
                        {dashboardData.rol !== 'ADMIN' && !dashboardData.agencia?.id && (
                            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', padding: '16px', borderRadius: '10px', marginBottom: '15px' }}>
                                <p style={{ color: '#a5b4fc', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fas fa-users"></i> Ingresá el código de invitación para unirte a un equipo
                                </p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="Ej: JNJ-SVK"
                                        className="form-control"
                                        style={{ flexGrow: 1, letterSpacing: '1px', fontWeight: 600 }}
                                        value={codigoJoin}
                                        onChange={e => setCodigoJoin(e.target.value.toUpperCase())}
                                        onKeyDown={e => e.key === 'Enter' && unirseAEquipo()}
                                    />
                                    <button onClick={unirseAEquipo} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                                        <i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Solicitar
                                    </button>
                                </div>
                                {joinFeedback.message && (
                                    <div style={{ marginTop: '10px', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', background: joinFeedback.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: joinFeedback.error ? '#fca5a5' : '#86efac' }}>
                                        <i className={`fas ${joinFeedback.error ? 'fa-exclamation-circle' : 'fa-check-circle'}`} style={{ marginRight: 6 }}></i>
                                        {joinFeedback.message}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CASO 3: No admin CON equipo */}
                        {dashboardData.rol !== 'ADMIN' && dashboardData.agencia?.id && (
                            <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', padding: '10px 14px', borderRadius: '8px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                                <span style={{ color: '#86efac', fontSize: '0.85rem', fontWeight: 600 }}>
                                    Sos miembro de <strong>{dashboardData.agencia.nombre}</strong>
                                </span>
                            </div>
                        )}

                        {/* Solicitudes pendientes (solo admin) */}
                        {dashboardData.rol === 'ADMIN' && dashboardData.solicitudes.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fas fa-clock" style={{ color: '#f59e0b' }}></i> Solicitudes pendientes
                                </h4>
                                {dashboardData.solicitudes.map(s => (
                                    <div key={s.id} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                            <div>
                                                <p style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                                                    {s.usuarioSolicitante?.nombreCompleto || s.usuarioSolicitante?.username}
                                                </p>
                                                <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>Quiere unirse al equipo</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button onClick={() => gestionarSolicitud(s.id, true)}
                                                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <i className="fas fa-check" style={{ marginRight: 4 }}></i>Aceptar
                                                </button>
                                                <button onClick={() => gestionarSolicitud(s.id, false)}
                                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <i className="fas fa-times" style={{ marginRight: 4 }}></i>Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Lista de miembros */}
                        <div style={{ maxHeight: '280px', overflowY: 'auto', marginTop: '10px' }} id="team-list-container">
                            {usuarioActual && renderMiembro(usuarioActual, true)}
                            {otrosMiembros.map(user => renderMiembro(user))}
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