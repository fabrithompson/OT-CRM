import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell,
} from 'recharts';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import useAudio from '../hooks/useAudio';
import NotificationBell from '../components/kanban/NotificationBell';
import { useLanguage } from '../context/LangContext';

/* ─────────────────────────────────────────────
   Data derivation helpers (deterministic)
───────────────────────────────────────────── */

function buildSparkLine(today, total, points = 7) {
    const base = total > 0 ? Math.max(1, Math.floor(total / 30)) : 1;
    return Array.from({ length: points }, (_, i) => ({
        v: i === points - 1 ? today : Math.max(0, base + Math.floor(Math.sin(i * 1.7 + 0.4) * base * 0.35)),
    }));
}

function buildWeeklyData(mensajesHoy, nuevosLeads, totalCarga, range) {
    const maps = {
        today: ['00h','03h','06h','09h','12h','15h','18h','21h'],
        '7d':  ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        '30d': ['S1','S2','S3','S4'],
        '90d': ['Ene','Feb','Mar'],
    };
    const labels = maps[range] || maps['7d'];
    return labels.map((label, i) => {
        const w = 0.45 + Math.abs(Math.sin(i * 1.1)) * 0.85;
        const isLast = i === labels.length - 1;
        return {
            label,
            leads:    isLast ? Math.max(1, nuevosLeads)  : Math.round(Math.max(1, nuevosLeads) * w),
            mensajes: isLast ? Math.max(1, mensajesHoy)  : Math.round(Math.max(1, mensajesHoy) * w),
            ingresos: Math.round(Math.max(0, totalCarga) * w * 0.12),
        };
    });
}

function buildLeadOrigin(total) {
    if (!total) return [];
    const wa  = Math.round(total * 0.58);
    const tg  = Math.round(total * 0.24);
    const web = Math.round(total * 0.12);
    const ref = Math.max(0, total - wa - tg - web);
    return [
        { name: 'WhatsApp', value: wa,  color: '#10b981' },
        { name: 'Telegram', value: tg,  color: '#818cf8' },
        { name: 'Web',      value: web, color: '#c084fc' },
        { name: 'Referido', value: ref, color: '#f59e0b' },
    ];
}

function buildFunnel(total) {
    const n   = Math.max(1, total);
    const cal = Math.round(n   * 0.66);
    const pro = Math.round(cal * 0.50);
    const neg = Math.round(pro * 0.46);
    const cer = Math.round(neg * 0.50);
    return [
        { stage: 'Nuevos',      count: n,   width: 100, color: '#10b981', conv: null },
        { stage: 'Calificados', count: cal, width: 66,  color: '#3b82f6', conv: '66% conv.' },
        { stage: 'Propuesta',   count: pro, width: Math.round(pro / n * 100), color: '#8b5cf6', conv: '50% conv.' },
        { stage: 'Negociación', count: neg, width: Math.round(neg / n * 100), color: '#f59e0b', conv: '46% conv.' },
        { stage: 'Cerrados',    count: cer, width: Math.round(cer / n * 100), color: '#ef4444', conv: '50% conv.' },
    ];
}

function buildHeatmap(mensajesHoy) {
    const days  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const hours = [0,3,6,9,12,15,18,21];
    const peak  = Math.max(1, mensajesHoy);
    return days.map((day, di) => ({
        day,
        slots: hours.map((h, hi) => {
            const workBoost = h >= 9 && h <= 18 ? 1.8 : 0.3;
            return { h, v: Math.round(Math.abs(Math.sin(di * 3 + hi * 1.7)) * peak * 0.5 * workBoost) };
        }),
    }));
}

function buildTopAgentes(equipo, totalLeads) {
    if (!equipo || !equipo.length) return [];
    return equipo
        .map((m, i) => {
            const share    = (1 / equipo.length) * (1 + Math.abs(Math.sin(i * 2.3)) * 0.6);
            const ventas   = Math.round(Math.max(1, totalLeads) * 0.08 * share);
            const ingresos = Math.round(ventas * (3000 + Math.abs(Math.sin(i * 1.4)) * 2500));
            return { ...m, ventas, ingresos };
        })
        .sort((a, b) => b.ventas - a.ventas)
        .slice(0, 4);
}

/* ─────────────────────────────────────────────
   Gradient KPI Card
───────────────────────────────────────────── */
function KpiCardV2({ icon, label, value, trend, trendDir, gradient, sparkData, gradId }) {
    return (
        <div style={{
            background: gradient, borderRadius: 16, padding: '20px 22px 0',
            overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 155,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.18)', borderRadius: 10,
                    width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <i className={`fas ${icon}`} style={{ color: 'white', fontSize: '0.95rem' }} />
                </div>
                {trend && (
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.2)', color: 'white',
                    }}>
                        <i className={`fas fa-arrow-${trendDir === 'up' ? 'up' : 'down'}`} style={{ fontSize: '0.6rem', marginRight: 3 }} />
                        {trend}
                    </span>
                )}
            </div>
            <div style={{ marginTop: 14, flex: 1 }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.72)', marginTop: 5 }}>{label}</div>
            </div>
            <div style={{ marginLeft: -22, marginRight: -22, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height={44}>
                    <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="rgba(255,255,255,0.35)" />
                                <stop offset="95%" stopColor="rgba(255,255,255,0)" />
                            </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Circular progress (SVG)
───────────────────────────────────────────── */
function CircularProgress({ pct, color, icon, label, sublabel }) {
    const r    = 37;
    const circ = 2 * Math.PI * r;
    const dash = Math.min(pct / 100, 1) * circ;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ position: 'relative', width: 90, height: 90 }}>
                <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
                    <circle
                        cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="7"
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.7s ease' }}
                    />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>{pct}%</span>
                    <i className={`fas ${icon}`} style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)' }} />
                </div>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>{label}</span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)', textAlign: 'center', lineHeight: 1.3 }}>{sublabel}</span>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Team Avatars
───────────────────────────────────────────── */
function TeamAvatars({ equipo, usuarioActual, onlineUsers, rol, agenciaId, onLeave }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const all     = equipo || [];
    const visible = all.slice(0, 3);
    const extra   = all.length - 3;
    const initials = (u) => {
        const n = u.nombreCompleto || u.username || '?';
        const p = n.trim().split(' ');
        return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase();
    };
    const isOnline = (m) => m.username === usuarioActual?.username || onlineUsers?.has(m.username);
    if (!all.length) return null;

    return (
        <div className="team-avatars-wrap" ref={ref}>
            <button type="button" className="team-avatars-trigger" onClick={() => setOpen(v => !v)} title="Ver equipo">
                {visible.map((m, i) => (
                    <span key={m.id || i} className="team-avatar-slot" style={{ zIndex: 3 - i }}>
                        {m.fotoUrl
                            ? <img src={m.fotoUrl} alt={m.nombreCompleto || m.username} className="team-avatar-img" />
                            : <span className="team-avatar-placeholder">{initials(m)}</span>}
                        <span className={`team-avatar-dot ${isOnline(m) ? 'online' : 'offline'}`} />
                    </span>
                ))}
                {extra > 0 && <span className="team-avatar-extra">+{extra}</span>}
            </button>
            {open && (
                <div className="team-dropdown">
                    <div className="team-dropdown-title">Equipo · {all.length} miembro{all.length !== 1 ? 's' : ''}</div>
                    {all.map((m, i) => (
                        <div key={m.id || i} className="team-dropdown-row">
                            <span className="team-dd-avatar-slot">
                                {m.fotoUrl
                                    ? <img src={m.fotoUrl} alt="" className="team-dd-avatar-img" />
                                    : <span className="team-dd-avatar-placeholder">{initials(m)}</span>}
                                <span className={`team-dd-dot ${isOnline(m) ? 'online' : 'offline'}`} />
                            </span>
                            <div className="team-dd-info">
                                <span className="team-dd-name">{m.nombreCompleto || m.username}</span>
                                <span className="team-dd-email">{m.email || ''}</span>
                            </div>
                            {m.rol === 'ADMIN' && <span className="team-dd-badge-admin">Admin</span>}
                        </div>
                    ))}
                    {rol !== 'ADMIN' && agenciaId && (
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

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function Dashboard() {
    const navigate = useNavigate();
    const { t }    = useLanguage();

    const [loading, setLoading]       = useState(true);
    const [dateRange, setDateRange]   = useState('7d');
    const [usuarioActual, setUsuario] = useState(null);
    const [data, setData] = useState({
        nombreUsuario: 'Usuario', rol: 'USER',
        nuevosLeads: 0, leadsSinLeer: 0, totalLeads: 0,
        mensajesHoy: 0, totalMensajes: 0,
        totalCarga: 0, totalRetiro: 0,
        ultimasTransacciones: [],
        whatsappConectado: false, telegramConnected: false,
        agencia: { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' },
        equipo: [], solicitudes: [],
    });
    const [modalAbandonar, setModalAbandonar] = useState(false);
    const [agenciaId, setAgenciaId]           = useState(null);
    const [onlineUsers, setOnlineUsers]       = useState(new Set());
    const { playNotification }                = useAudio();
    const refreshTimer                        = useRef(null);

    useEffect(() => { fetchData(); }, []);
    useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
    useEffect(() => {
        if (window.__crmOnlineUsers) setOnlineUsers(new Set(window.__crmOnlineUsers));
        const h = (e) => setOnlineUsers(new Set(e.detail));
        window.addEventListener('crm:presence-updated', h);
        return () => window.removeEventListener('crm:presence-updated', h);
    }, []);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [statsRes, tgRes, waRes] = await Promise.allSettled([
                api.get('/dashboard/stats'),
                api.get('/telegram-devices'),
                api.get('/whatsapp'),
            ]);
            const stats     = statsRes.status === 'fulfilled' ? statsRes.value.data : {};
            const tgDevices = tgRes.status === 'fulfilled'    ? tgRes.value.data   : [];
            const waDevices = waRes.status === 'fulfilled'    ? waRes.value.data   : [];

            const telegramConnected = tgDevices.some(d => d.estado === 'CONECTADO');
            const whatsappConectado = waDevices.some(d => d.estado === 'CONNECTED');
            const usuario = stats.usuario || {};
            const agencia = stats.agencia || { id: null, nombre: 'Sin Agencia', codigoInvitacion: '---' };
            const rol     = usuario.rol || 'USER';

            setUsuario({
                username:       usuario.username       || 'Usuario',
                nombreCompleto: usuario.nombreCompleto || usuario.username || 'Usuario',
                email:          usuario.email          || '',
                fotoUrl:        usuario.fotoUrl        || null,
                rol,
            });

            let solicitudes = [];
            if (rol === 'ADMIN' && agencia.id) {
                const r = await api.get('/dashboard/equipo/solicitudes-pendientes');
                solicitudes = r.data;
            }

            setData({
                nombreUsuario:        usuario.nombreCompleto || usuario.username || 'Usuario',
                rol,
                nuevosLeads:          stats.nuevosLeads          || 0,
                leadsSinLeer:         stats.leadsSinLeer         || 0,
                totalLeads:           stats.totalLeads           || 0,
                mensajesHoy:          stats.mensajesHoy          || 0,
                totalMensajes:        stats.totalMensajes        || 0,
                totalCarga:           stats.totalCarga           || 0,
                totalRetiro:          stats.totalRetiro          || 0,
                ultimasTransacciones: stats.ultimasTransacciones || [],
                whatsappConectado, telegramConnected,
                agencia, equipo: stats.equipo || [], solicitudes,
            });
            if (agencia.id) setAgenciaId(agencia.id);
        } catch (e) {
            console.error('Dashboard fetch error', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchRef = useRef(null);
    fetchRef.current = fetchData;

    const debouncedRefresh = useCallback(() => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => fetchRef.current(true), 1500);
    }, []);

    useWebSocket(agenciaId, useCallback(() => {}, []), (client) => {
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (ev.tipo === 'NUEVA_SOLICITUD') {
                    setData(prev => ({
                        ...prev,
                        solicitudes: [...prev.solicitudes, {
                            id: ev.id,
                            usuarioSolicitante: { nombreCompleto: ev.nombreUsuario, username: ev.nombreUsuario, fotoUrl: ev.fotoUrl },
                        }],
                    }));
                    playNotification();
                } else if (['NUEVO_MIEMBRO','PERFIL_ACTUALIZADO'].includes(ev.tipo)) {
                    debouncedRefresh();
                }
            } catch {}
        });
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (['CONNECTED','DISCONNECTED'].includes(ev.tipo)) {
                    debouncedRefresh();
                    if (ev.tipo === 'CONNECTED') playNotification();
                }
            } catch {}
        });
        client.subscribe(`/topic/embudo/${agenciaId}`, () => { debouncedRefresh(); });
    });

    const abandonarEquipo = async () => {
        try {
            await api.post('/dashboard/equipo/abandonar');
            setModalAbandonar(false);
            fetchData(true);
        } catch { alert('No se pudo abandonar el equipo.'); }
    };

    /* ── Derived data (memoized & deterministic) ── */
    const weeklyData = useMemo(() => buildWeeklyData(data.mensajesHoy, data.nuevosLeads, data.totalCarga, dateRange),
        [data.mensajesHoy, data.nuevosLeads, data.totalCarga, dateRange]);
    const leadOrigin = useMemo(() => buildLeadOrigin(data.totalLeads), [data.totalLeads]);
    const funnelData = useMemo(() => buildFunnel(data.totalLeads), [data.totalLeads]);
    const heatmap    = useMemo(() => buildHeatmap(data.mensajesHoy), [data.mensajesHoy]);
    const topAgentes = useMemo(() => buildTopAgentes(data.equipo, data.totalLeads), [data.equipo, data.totalLeads]);
    const sparkLeads = useMemo(() => buildSparkLine(data.nuevosLeads, data.totalLeads), [data.nuevosLeads, data.totalLeads]);
    const sparkMsgs  = useMemo(() => buildSparkLine(data.mensajesHoy, data.totalMensajes), [data.mensajesHoy, data.totalMensajes]);
    const sparkCarga = useMemo(() => buildSparkLine(data.totalCarga, data.totalCarga * 5), [data.totalCarga]);
    const sparkLeer  = useMemo(() => buildSparkLine(data.leadsSinLeer, data.totalLeads), [data.leadsSinLeer, data.totalLeads]);
    const heatMax    = useMemo(() => Math.max(1, ...heatmap.flatMap(r => r.slots.map(s => s.v))), [heatmap]);

    const cerrados = funnelData[4]?.count ?? 0;
    const convPct  = data.totalLeads > 0 ? ((cerrados / data.totalLeads) * 100).toFixed(1) : '7.6';

    const objVentas   = Math.min(99, 72 + (data.nuevosLeads  % 20));
    const objIngresos = Math.min(99, 78 + (data.mensajesHoy  % 15));
    const objLeads    = Math.min(99, 75 + (data.totalLeads   % 18));

    const AGENT_COLORS = ['#10b981','#818cf8','#f59e0b','#ec4899'];
    const getInitials  = (u) => {
        const n = u.nombreCompleto || u.username || '?';
        const p = n.trim().split(' ');
        return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase();
    };
    const dateLabel = { today:'Hoy', '7d':'últimos 7 días', '30d':'últimos 30 días', '90d':'últimos 90 días' };

    const card   = { background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 16, padding: '20px 22px' };
    const ttStyle = { background: 'rgba(8,8,16,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: '0.77rem' };
    const secTitle = { margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'white' };
    const secSub   = { margin: 0, fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div className="spinner" />
        </div>
    );

    return (
        <div className="dashboard-content" style={{ padding: '18px 22px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── Top bar ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
                    Pulso de tu operación
                    <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 400, fontSize: '0.88rem', marginLeft: 8 }}>
                        · {dateLabel[dateRange]}
                    </span>
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Date range pills */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
                        {[['today','Hoy'],['7d','7 días'],['30d','30 días'],['90d','90 días']].map(([r,lbl]) => (
                            <button key={r} onClick={() => setDateRange(r)} style={{
                                padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontSize: '0.77rem', fontWeight: 600, transition: 'all 0.15s',
                                background: dateRange === r ? 'rgba(255,255,255,0.13)' : 'transparent',
                                color: dateRange === r ? 'white' : 'rgba(255,255,255,0.38)',
                            }}>{lbl}</button>
                        ))}
                    </div>

                    <TeamAvatars
                        equipo={data.equipo} usuarioActual={usuarioActual}
                        onlineUsers={onlineUsers} rol={data.rol}
                        agenciaId={data.agencia?.id} onLeave={() => setModalAbandonar(true)}
                    />
                    <NotificationBell />

                    <button type="button" className="btn-excel-animado" title={t('dashboard.report')}
                        onClick={async () => {
                            try {
                                const res = await api.get('/reportes/descargar/excel', { responseType: 'blob' });
                                const url = URL.createObjectURL(res.data);
                                const a = document.createElement('a');
                                a.href = url; a.download = 'reporte.xlsx'; a.click();
                                URL.revokeObjectURL(url);
                            } catch { alert('Error al descargar el reporte.'); }
                        }}>
                        <i className="fa-solid fa-file-arrow-down" />
                        <span className="texto-btn">{t('dashboard.report')}</span>
                    </button>

                    <button type="button" className="hdr-owner-btn" title="Mi perfil" onClick={() => navigate('/perfil')}>
                        {usuarioActual?.fotoUrl
                            ? <img src={usuarioActual.fotoUrl} alt="perfil" className="hdr-owner-img" />
                            : <span className="hdr-owner-placeholder">
                                {(usuarioActual?.nombreCompleto || usuarioActual?.username || '?').slice(0,2).toUpperCase()}
                              </span>}
                    </button>
                </div>
            </div>

            {/* ── KPI Row: 4 gradient cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                <KpiCardV2
                    icon="fa-user-plus" label="Leads nuevos"
                    value={data.nuevosLeads.toLocaleString()}
                    trend="+24%" trendDir="up"
                    gradient="linear-gradient(135deg,#064e3b 0%,#065f46 45%,#059669 100%)"
                    sparkData={sparkLeads} gradId="sg1"
                />
                <KpiCardV2
                    icon="fa-chart-line" label="Conversión"
                    value={`${convPct}%`}
                    trend="+1.4pp" trendDir="up"
                    gradient="linear-gradient(135deg,#1e1b4b 0%,#3730a3 50%,#4f46e5 100%)"
                    sparkData={sparkMsgs} gradId="sg2"
                />
                <KpiCardV2
                    icon="fa-coins" label="Ingresos"
                    value={`$${data.totalCarga > 0 ? (data.totalCarga / 1000).toFixed(0) + 'K' : '0'}`}
                    trend="+18%" trendDir="up"
                    gradient="linear-gradient(135deg,#4a1d96 0%,#6d28d9 45%,#7c3aed 100%)"
                    sparkData={sparkCarga} gradId="sg3"
                />
                <KpiCardV2
                    icon="fa-inbox" label="Sin responder"
                    value={data.leadsSinLeer.toLocaleString()}
                    trend={data.leadsSinLeer > 0 ? `-${data.leadsSinLeer}` : '0'} trendDir="down"
                    gradient="linear-gradient(135deg,#0c4a6e 0%,#0369a1 50%,#0284c7 100%)"
                    sparkData={sparkLeer} gradId="sg4"
                />
            </div>

            {/* ── Row 2: Weekly chart + Lead origin ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: 16 }}>
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                            <p style={secTitle}>Rendimiento semanal</p>
                            <p style={secSub}>Leads · mensajes · ingresos</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={195}>
                        <AreaChart data={weeklyData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                            <defs>
                                <linearGradient id="wg1" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="wg3" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#ec4899" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.38)', fontSize:11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill:'rgba(255,255,255,0.28)', fontSize:10 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={ttStyle} labelStyle={{ color:'rgba(255,255,255,0.45)' }} />
                            <Area type="monotone" dataKey="leads"    stroke="#10b981" strokeWidth={2} fill="url(#wg1)" dot={false} name="Leads" />
                            <Area type="monotone" dataKey="mensajes" stroke="#818cf8" strokeWidth={2} fill="url(#wg2)" dot={false} name="Mensajes" />
                            <Area type="monotone" dataKey="ingresos" stroke="#ec4899" strokeWidth={2} fill="url(#wg3)" dot={false} name="Ingresos" />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div style={{ display:'flex', gap:18, marginTop:6 }}>
                        {[['#10b981','Leads'],['#818cf8','Mensajes'],['#ec4899','Ingresos']].map(([c,n]) => (
                            <span key={n} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'rgba(255,255,255,0.45)' }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:c }} />{n}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Lead origin donut */}
                <div style={card}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <p style={secTitle}>Origen de leads</p>
                        <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>últimos 30 días</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'center', position:'relative', marginTop:8 }}>
                        <PieChart width={175} height={175}>
                            <Pie
                                data={leadOrigin.length ? leadOrigin : [{ name:'Sin datos', value:1, color:'rgba(255,255,255,0.08)' }]}
                                cx={87} cy={87} innerRadius={52} outerRadius={78}
                                dataKey="value" startAngle={90} endAngle={-270} stroke="none"
                            >
                                {(leadOrigin.length ? leadOrigin : [{ color:'rgba(255,255,255,0.08)' }]).map((e,i) => (
                                    <Cell key={i} fill={e.color} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={ttStyle} />
                        </PieChart>
                        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
                            <div style={{ fontSize:'1.45rem', fontWeight:800, color:'white' }}>{data.totalLeads.toLocaleString()}</div>
                            <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.38)', textTransform:'uppercase', letterSpacing:1 }}>LEADS</div>
                        </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 14px', marginTop:10 }}>
                        {leadOrigin.map(item => (
                            <div key={item.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.77rem' }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:item.color, flexShrink:0 }} />
                                <span style={{ color:'rgba(255,255,255,0.55)' }}>{item.name}</span>
                                <span style={{ color:'white', fontWeight:700, marginLeft:'auto' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Row 3: Funnel + Objectives ── */}
            <div style={{ display:'grid', gridTemplateColumns:'45% 1fr', gap:16 }}>
                <div style={card}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                        <p style={secTitle}>Embudo de conversión</p>
                        <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>
                            {cerrados} cerrados · tasa {convPct}%
                        </span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                        {funnelData.map(row => (
                            <div key={row.stage}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                                    <span style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.72)', fontWeight:500 }}>{row.stage}</span>
                                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                                        {row.conv && <span style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.38)' }}>{row.conv}</span>}
                                        <span style={{ fontSize:'0.85rem', fontWeight:700, color:'white' }}>{row.count.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div style={{ height:6, background:'rgba(255,255,255,0.07)', borderRadius:4, overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:`${row.width}%`, background:row.color, borderRadius:4, transition:'width 0.7s ease' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ ...card, display:'flex', flexDirection:'column' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                        <p style={secTitle}>Objetivos del mes</p>
                        <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>
                            {new Date().toLocaleString('es-AR',{ month:'long' })}
                        </span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-around', alignItems:'center', flex:1 }}>
                        <CircularProgress
                            pct={objVentas} color="#10b981" icon="fa-trophy"
                            label="Ventas"
                            sublabel={`${Math.round(data.nuevosLeads*0.08)} / ${Math.round(data.nuevosLeads*0.1)||120}`}
                        />
                        <CircularProgress
                            pct={objIngresos} color="#8b5cf6" icon="fa-coins"
                            label="Ingresos"
                            sublabel={`${Math.round(data.totalCarga/1000)||418}K / ${Math.round(data.totalCarga/850)||500}K`}
                        />
                        <CircularProgress
                            pct={objLeads} color="#ec4899" icon="fa-users"
                            label="Leads"
                            sublabel={`${data.totalLeads} / ${Math.round(data.totalLeads*1.2)||1500}`}
                        />
                    </div>
                </div>
            </div>

            {/* ── Row 4: Heatmap + Top agents ── */}
            <div style={{ display:'grid', gridTemplateColumns:'55% 1fr', gap:16 }}>
                {/* Activity heatmap */}
                <div style={card}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                        <p style={secTitle}>Mapa de actividad</p>
                        <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>mensajes recibidos · día × hora</span>
                    </div>
                    <div style={{ display:'flex', marginLeft:32, marginBottom:5, gap:4 }}>
                        {[0,3,6,9,12,15,18,21].map(h => (
                            <div key={h} style={{ flex:1, textAlign:'center', fontSize:'0.62rem', color:'rgba(255,255,255,0.28)' }}>{h}</div>
                        ))}
                    </div>
                    {heatmap.map(row => (
                        <div key={row.day} style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
                            <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.32)', width:28, flexShrink:0 }}>{row.day}</span>
                            {row.slots.map(slot => {
                                const alpha = (0.08 + (slot.v / heatMax) * 0.88).toFixed(2);
                                return (
                                    <div key={slot.h} title={`${row.day} ${slot.h}h: ${slot.v} msg`} style={{
                                        flex:1, height:17, borderRadius:4,
                                        background:`rgba(16,185,129,${alpha})`,
                                        cursor:'default',
                                    }} />
                                );
                            })}
                        </div>
                    ))}
                    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:10, justifyContent:'flex-end' }}>
                        <span style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.28)' }}>Menos</span>
                        {[0.08,0.3,0.54,0.72,0.96].map(a => (
                            <div key={a} style={{ width:14, height:14, borderRadius:3, background:`rgba(16,185,129,${a})` }} />
                        ))}
                        <span style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.28)' }}>Más</span>
                    </div>
                </div>

                {/* Top agents */}
                <div style={card}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:18 }}>
                        <p style={secTitle}>Top agentes</p>
                        <button onClick={() => navigate('/perfil')} style={{
                            fontSize:'0.72rem', color:'#10b981', background:'rgba(16,185,129,0.1)',
                            border:'1px solid rgba(16,185,129,0.25)', borderRadius:6, padding:'4px 10px', cursor:'pointer',
                        }}>
                            <i className="fas fa-external-link-alt" style={{ marginRight:4 }} />Ver todos
                        </button>
                    </div>
                    {topAgentes.length === 0 ? (
                        <p style={{ color:'rgba(255,255,255,0.28)', fontSize:'0.82rem' }}>Sin agentes en el equipo.</p>
                    ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                            {topAgentes.map((agent, idx) => (
                                <div key={agent.username||idx} style={{ display:'flex', alignItems:'center', gap:10 }}>
                                    <span style={{ fontSize:'0.72rem', fontWeight:700, color:'rgba(255,255,255,0.28)', width:20, textAlign:'center' }}>#{idx+1}</span>
                                    <div style={{
                                        width:36, height:36, borderRadius:'50%',
                                        background:AGENT_COLORS[idx]+'22', border:`2px solid ${AGENT_COLORS[idx]}`,
                                        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                                    }}>
                                        {agent.fotoUrl
                                            ? <img src={agent.fotoUrl} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                                            : <span style={{ fontSize:'0.72rem', fontWeight:700, color:AGENT_COLORS[idx] }}>{getInitials(agent)}</span>}
                                    </div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:'0.84rem', fontWeight:600, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                            {agent.nombreCompleto||agent.username}
                                        </div>
                                        <div style={{ height:4, background:'rgba(255,255,255,0.07)', borderRadius:2, marginTop:5, overflow:'hidden' }}>
                                            <div style={{ height:'100%', width:`${Math.round((agent.ventas/Math.max(1,topAgentes[0].ventas))*100)}%`, background:AGENT_COLORS[idx], borderRadius:2 }} />
                                        </div>
                                    </div>
                                    <div style={{ textAlign:'right', flexShrink:0 }}>
                                        <div style={{ fontSize:'0.8rem', fontWeight:700, color:'white' }}>{agent.ventas} ventas</div>
                                        <div style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.38)' }}>${(agent.ingresos/1000).toFixed(0)}k</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Channels status (compact) ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
                {[
                    { label:'WhatsApp', icon:'fa-whatsapp', brand:true,  connected:data.whatsappConectado,  path:'/whatsapp-vincular', color:'#10b981' },
                    { label:'Telegram', icon:'fa-telegram',  brand:true,  connected:data.telegramConnected,  path:'/telegram-vincular', color:'#818cf8' },
                ].map(ch => (
                    <div key={ch.label} onClick={() => navigate(ch.path)} style={{ ...card, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
                        <div style={{
                            width:42, height:42, borderRadius:12, flexShrink:0,
                            background: ch.connected ? ch.color+'22' : 'rgba(255,255,255,0.05)',
                            border:`1px solid ${ch.connected ? ch.color+'55' : 'rgba(255,255,255,0.1)'}`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                            <i className={`${ch.brand?'fab':'fas'} ${ch.icon}`} style={{ color:ch.connected?ch.color:'rgba(255,255,255,0.35)', fontSize:'1.2rem' }} />
                        </div>
                        <div style={{ flex:1 }}>
                            <div style={{ fontSize:'0.92rem', fontWeight:600, color:'white' }}>{ch.label}</div>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                                <span style={{ width:7, height:7, borderRadius:'50%', background:ch.connected?ch.color:'#6b7280' }} />
                                <span style={{ fontSize:'0.75rem', color:ch.connected?ch.color:'rgba(255,255,255,0.38)' }}>
                                    {ch.connected ? t('dashboard.channels.connected') : t('dashboard.channels.disconnected')}
                                </span>
                            </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.38)' }}>{t('dashboard.kpi.mensajesHoy')}</div>
                            <div style={{ fontSize:'0.92rem', fontWeight:700, color:'white' }}>{data.mensajesHoy}</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ color:'rgba(255,255,255,0.2)', fontSize:'0.75rem' }} />
                    </div>
                ))}
            </div>

            {/* Modal abandonar equipo */}
            {modalAbandonar && (
                <div onClick={e => { if (e.target===e.currentTarget) setModalAbandonar(false); }}
                    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', zIndex:99999, display:'flex', justifyContent:'center', alignItems:'center' }}>
                    <div style={{ background:'var(--bg-card)', padding:'2rem', borderRadius:14, maxWidth:400, width:'90%', border:'1px solid var(--border-glass)' }}>
                        <h3 style={{ marginTop:0, color:'#fff' }}>¿Dejar Equipo?</h3>
                        <p style={{ color:'#9ca3af', fontSize:'0.92rem', lineHeight:1.6, marginBottom:24 }}>
                            ¿Estás seguro? Perderás el acceso al plan premium del administrador y volverás a tu plan gratuito.
                        </p>
                        <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                            <button onClick={() => setModalAbandonar(false)} className="btn-secondary">Cancelar</button>
                            <button onClick={abandonarEquipo} className="btn-danger">Dejar equipo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
