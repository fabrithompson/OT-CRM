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
        today:  ['00h','03h','06h','09h','12h','15h','18h','21h'],
        sem:    ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        mes:    ['S1','S2','S3','S4'],
        anual:  ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
        custom: ['P1','P2','P3','P4','P5','P6','P7'],
    };
    const SCALE = { today: 1, sem: 7, mes: 30, anual: 365, custom: 1 };
    const scale = SCALE[range] || 1;
    const labels = maps[range] || maps['sem'];
    const n = labels.length;
    return labels.map((label, i) => {
        const w = 0.45 + Math.abs(Math.sin(i * 1.1)) * 0.85;
        return {
            label,
            leads:    nuevosLeads > 0 ? Math.round(nuevosLeads * scale / n * w) : 0,
            mensajes: mensajesHoy > 0 ? Math.round(mensajesHoy * scale / n * w) : 0,
            ingresos: totalCarga  > 0 ? Math.round(totalCarga  * scale / n * w * 0.12) : 0,
        };
    });
}

function buildLeadOrigin(total) {
    if (!total) return [];
    const wa = Math.round(total * 0.70);
    const tg = Math.max(0, total - wa);
    return [
        { name: 'WhatsApp', value: wa, color: '#10b981' },
        { name: 'Telegram', value: tg, color: '#818cf8' },
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
    const [dateRange, setDateRange]   = useState('today');
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
    const [etapasStats, setEtapasStats]       = useState([]);
    const [topStats, setTopStats]             = useState({ topClientes: [], topAgentes: [] });
    const [topView, setTopView]               = useState('agentes');
    const [customFrom, setCustomFrom]         = useState('');
    const [customTo, setCustomTo]             = useState('');
    const [now, setNow]                       = useState(new Date());
    const [pickerOpen, setPickerOpen]         = useState(false);
    const pickerRef                           = useRef(null);
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

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const midnightRef = { current: null };
        const schedule = () => {
            const n = new Date();
            const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0);
            midnightRef.current = setTimeout(() => { fetchRef.current(true); schedule(); }, next - n);
        };
        schedule();
        return () => { if (midnightRef.current) clearTimeout(midnightRef.current); };
    }, []);

    useEffect(() => {
        const h = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [statsRes, tgRes, waRes, etapasRes, topRes] = await Promise.allSettled([
                api.get('/dashboard/stats'),
                api.get('/telegram-devices'),
                api.get('/whatsapp'),
                api.get('/etapas/stats'),
                api.get('/dashboard/top-stats'),
            ]);
            const stats     = statsRes.status === 'fulfilled'  ? statsRes.value.data  : {};
            const tgDevices = tgRes.status === 'fulfilled'     ? tgRes.value.data     : [];
            const waDevices = waRes.status === 'fulfilled'     ? waRes.value.data     : [];
            if (etapasRes.status === 'fulfilled') setEtapasStats(etapasRes.value.data || []);
            if (topRes.status === 'fulfilled')    setTopStats(topRes.value.data || { topClientes: [], topAgentes: [] });

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
    const sparkLeads = useMemo(() => buildSparkLine(data.nuevosLeads, data.totalLeads), [data.nuevosLeads, data.totalLeads]);
    const sparkMsgs  = useMemo(() => buildSparkLine(data.mensajesHoy, data.totalMensajes), [data.mensajesHoy, data.totalMensajes]);
    const sparkCarga = useMemo(() => buildSparkLine(data.totalCarga, data.totalCarga * 5), [data.totalCarga]);
    const sparkLeer  = useMemo(() => buildSparkLine(data.leadsSinLeer, data.totalLeads), [data.leadsSinLeer, data.totalLeads]);

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

    const originLabel = dateRange !== 'custom'
        ? (t(`dashboard.metrics.range${dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}`) || t('dashboard.metrics.rangeCustom'))
        : customFrom && customTo ? `${customFrom} → ${customTo}`
        : customFrom ? `${t('dashboard.picker.from')} ${customFrom}`
        : t('dashboard.metrics.rangeCustom');

    const rangeText = dateRange === 'today' ? t('dashboard.metrics.rangeToday')
        : dateRange === 'sem'   ? t('dashboard.metrics.rangeSem')
        : dateRange === 'mes'   ? t('dashboard.metrics.rangeMes')
        : dateRange === 'anual' ? t('dashboard.metrics.rangeAnual')
        : customFrom && customTo ? `${customFrom} → ${customTo}`
        : customFrom ? `${t('dashboard.picker.from')} ${customFrom}`
        : t('dashboard.metrics.rangeCustom');

    const hour     = now.getHours();
    const greeting = hour >= 6 && hour < 12 ? t('dashboard.greeting.morning')
        : hour >= 12 && hour < 20 ? t('dashboard.greeting.afternoon')
        : t('dashboard.greeting.evening');
    const firstName = (usuarioActual?.nombreCompleto || usuarioActual?.username || 'Usuario').split(' ')[0];

    const trendLeads = data.nuevosLeads === 0  ? null : { text: `+${data.nuevosLeads} hoy`, dir: 'up' };
    const trendConv  = data.totalLeads  === 0  ? null : { text: `${convPct}%`, dir: parseFloat(convPct) >= 5 ? 'up' : 'down' };
    const trendLeer  = data.leadsSinLeer === 0 ? { text: '✓ Al día', dir: 'up' } : { text: `-${data.leadsSinLeer}`, dir: 'down' };
    const neto       = (data.totalCarga || 0) - (data.totalRetiro || 0);
    const fmtMoney   = (v) => v === 0 ? '$0' : Math.abs(v) >= 1000 ? `$${(Math.abs(v)/1000).toFixed(1)}K` : `$${Math.abs(v).toFixed(0)}`;

    const card   = {
        background: 'linear-gradient(135deg, #0e0e1c 0%, #13131f 55%, #0a0a14 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    };
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
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <span style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.45)', fontWeight:400 }}>
                        {greeting},{' '}
                        <strong style={{ color:'white', fontWeight:700 }}>{firstName}</strong>
                    </span>
                    <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>
                        {t('dashboard.metrics.title')}{' '}
                        <span style={{ color:'rgba(255,255,255,0.4)', fontWeight:400, fontSize:'0.9rem' }}>{rangeText}</span>
                    </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Date range pills + custom picker */}
                    <div style={{ position:'relative' }} ref={pickerRef}>
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
                            {[['today', t('dashboard.periods.today')], ['sem', t('dashboard.periods.sem')], ['mes', t('dashboard.periods.mes')], ['anual', t('dashboard.periods.anual')]].map(([r,lbl]) => (
                                <button key={r} onClick={() => { setDateRange(r); setPickerOpen(false); }} style={{
                                    padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    fontSize: '0.77rem', fontWeight: 600, transition: 'all 0.15s',
                                    background: dateRange === r ? 'rgba(255,255,255,0.13)' : 'transparent',
                                    color: dateRange === r ? 'white' : 'rgba(255,255,255,0.38)',
                                }}>{lbl}</button>
                            ))}
                            <button onClick={() => setPickerOpen(v => !v)} style={{
                                padding: '5px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontSize: '0.77rem', fontWeight: 600, transition: 'all 0.15s', display:'flex', alignItems:'center', gap:4,
                                background: dateRange === 'custom' ? 'rgba(255,255,255,0.13)' : 'transparent',
                                color: dateRange === 'custom' ? 'white' : 'rgba(255,255,255,0.38)',
                            }}>
                                <i className="fas fa-calendar-alt" style={{ fontSize:'0.7rem' }} />
                                {dateRange === 'custom' ? 'Custom' : ''}
                            </button>
                        </div>
                        {pickerOpen && (
                            <div style={{
                                position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200,
                                background:'rgba(12,12,24,0.98)', border:'1px solid rgba(255,255,255,0.12)',
                                borderRadius:12, padding:'16px 18px', minWidth:260,
                                backdropFilter:'blur(12px)', boxShadow:'0 12px 40px rgba(0,0,0,0.6)',
                            }}>
                                <p style={{ margin:'0 0 12px', fontSize:'0.8rem', fontWeight:700, color:'white' }}></p>
                                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                    <label style={{ fontSize:'0.73rem', color:'rgba(255,255,255,0.5)' }}>
                                        {t('dashboard.picker.from')}
                                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                            style={{ display:'block', width:'100%', marginTop:4, padding:'6px 10px', boxSizing:'border-box',
                                                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)',
                                                borderRadius:8, color:'white', fontSize:'0.82rem', outline:'none' }} />
                                    </label>
                                    <label style={{ fontSize:'0.73rem', color:'rgba(255,255,255,0.5)' }}>
                                        {t('dashboard.picker.to')}
                                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                            style={{ display:'block', width:'100%', marginTop:4, padding:'6px 10px', boxSizing:'border-box',
                                                background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)',
                                                borderRadius:8, color:'white', fontSize:'0.82rem', outline:'none' }} />
                                    </label>
                                </div>
                                <button
                                    disabled={!customFrom}
                                    onClick={() => { setDateRange('custom'); setPickerOpen(false); }}
                                    style={{
                                        marginTop:14, width:'100%', padding:'8px', borderRadius:8, border:'none',
                                        cursor: customFrom ? 'pointer' : 'not-allowed',
                                        background: customFrom ? '#10b981' : 'rgba(255,255,255,0.1)',
                                        color: customFrom ? 'white' : 'rgba(255,255,255,0.3)',
                                        fontSize:'0.82rem', fontWeight:600, transition:'all 0.15s',
                                    }}>
                                    {t('dashboard.picker.apply')}
                                </button>
                            </div>
                        )}
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
                    icon="fa-user-plus" label={t('dashboard.kpi.newLeads')}
                    value={data.nuevosLeads.toLocaleString()}
                    trend={trendLeads?.text ?? null} trendDir={trendLeads?.dir ?? 'up'}
                    gradient="linear-gradient(135deg,#064e3b 0%,#065f46 45%,#059669 100%)"
                    sparkData={sparkLeads} gradId="sg1"
                />
                <KpiCardV2
                    icon="fa-chart-line" label={t('dashboard.kpi.conversion')}
                    value={`${convPct}%`}
                    trend={trendConv?.text ?? null} trendDir={trendConv?.dir ?? 'up'}
                    gradient="linear-gradient(135deg,#1e1b4b 0%,#3730a3 50%,#4f46e5 100%)"
                    sparkData={sparkMsgs} gradId="sg2"
                />
                {/* Finance card: neto = ingresos − egresos */}
                <div style={{
                    background: 'linear-gradient(135deg,#4a1d96 0%,#6d28d9 45%,#7c3aed 100%)',
                    borderRadius: 16, padding: '20px 22px 0', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', minHeight: 155,
                }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ background:'rgba(255,255,255,0.18)', borderRadius:10, width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <i className="fas fa-coins" style={{ color:'white', fontSize:'0.95rem' }} />
                        </div>
                        {neto !== 0 && (
                            <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 9px', borderRadius:20, background:'rgba(255,255,255,0.2)', color:'white' }}>
                                <i className={`fas fa-arrow-${neto > 0 ? 'up' : 'down'}`} style={{ fontSize:'0.6rem', marginRight:3 }} />
                                {neto > 0 ? '+' : '-'}{fmtMoney(neto)}
                            </span>
                        )}
                    </div>
                    <div style={{ marginTop:12, flex:1 }}>
                        <div style={{ fontSize:'1.65rem', fontWeight:800, color: neto < 0 ? '#fca5a5' : 'white', lineHeight:1 }}>
                            {neto > 0 ? '+' : neto < 0 ? '-' : ''}{fmtMoney(neto)}
                        </div>
                        <div style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.65)', marginTop:4 }}>{t('dashboard.kpi.netCompany')}</div>
                        <div style={{ display:'flex', gap:14, marginTop:8 }}>
                            <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', gap:4 }}>
                                <i className="fas fa-arrow-up" style={{ color:'#86efac', fontSize:'0.58rem' }} />
                                {fmtMoney(data.totalCarga)}
                            </span>
                            <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', gap:4 }}>
                                <i className="fas fa-arrow-down" style={{ color:'#fca5a5', fontSize:'0.58rem' }} />
                                {fmtMoney(data.totalRetiro)}
                            </span>
                        </div>
                    </div>
                    <div style={{ marginLeft:-22, marginRight:-22, marginTop:8 }}>
                        <ResponsiveContainer width="100%" height={44}>
                            <AreaChart data={sparkCarga} margin={{ top:0, right:0, left:0, bottom:0 }}>
                                <defs>
                                    <linearGradient id="sg3" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor="rgba(255,255,255,0.35)" />
                                        <stop offset="95%" stopColor="rgba(255,255,255,0)" />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="v" stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} fill="url(#sg3)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <KpiCardV2
                    icon="fa-inbox" label={t('dashboard.kpi.unread')}
                    value={data.leadsSinLeer.toLocaleString()}
                    trend={trendLeer.text} trendDir={trendLeer.dir}
                    gradient="linear-gradient(135deg,#0c4a6e 0%,#0369a1 50%,#0284c7 100%)"
                    sparkData={sparkLeer} gradId="sg4"
                />
            </div>

            {/* ── Row 2: Weekly chart + Lead origin ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: 16 }}>
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                            <p style={secTitle}>
                                {dateRange === 'today' ? t('dashboard.chart.perfDay')
                                    : dateRange === 'sem'   ? t('dashboard.chart.perfSem')
                                    : dateRange === 'mes'   ? t('dashboard.chart.perfMes')
                                    : dateRange === 'anual' ? t('dashboard.chart.perfAnual')
                                    : t('dashboard.chart.perfCustom')}
                            </p>
                            <p style={secSub}>
                                {dateRange === 'today' ? t('dashboard.chart.byHour')
                                    : dateRange === 'sem'   ? t('dashboard.chart.byDay')
                                    : dateRange === 'mes'   ? t('dashboard.chart.byWeek')
                                    : t('dashboard.chart.byMonth')}
                            </p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={195}>
                        <AreaChart data={weeklyData} margin={{ top: 4, right: 45, left: -22, bottom: 0 }}>
                            <defs>
                                <linearGradient id="wg1" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="wg3" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#ec4899" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.38)', fontSize:11 }} axisLine={false} tickLine={false} />
                            <YAxis
                                yAxisId="left" orientation="left"
                                tick={{ fill:'rgba(255,255,255,0.28)', fontSize:10 }} axisLine={false} tickLine={false}
                                tickFormatter={(v) => v === 0 ? '' : v}
                                width={28}
                            />
                            <YAxis
                                yAxisId="right" orientation="right"
                                tick={{ fill:'rgba(255,255,255,0.2)', fontSize:9 }} axisLine={false} tickLine={false}
                                tickFormatter={(v) => v === 0 ? '' : `$${(v/1000).toFixed(0)}K`}
                                width={38}
                            />
                            <Tooltip
                                contentStyle={ttStyle} labelStyle={{ color:'rgba(255,255,255,0.45)' }}
                                formatter={(value, name) => name === 'Ingresos' ? [`$${value.toLocaleString()}`, name] : [value, name]}
                            />
                            <Area yAxisId="left"  type="monotone" dataKey="leads"    stroke="#10b981" strokeWidth={2} fill="url(#wg1)" dot={false} name="Leads" />
                            <Area yAxisId="left"  type="monotone" dataKey="mensajes" stroke="#818cf8" strokeWidth={2} fill="url(#wg2)" dot={false} name="Mensajes" />
                            <Area yAxisId="right" type="monotone" dataKey="ingresos" stroke="#ec4899" strokeWidth={1.5} fill="url(#wg3)" dot={false} name="Ingresos" />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div style={{ display:'flex', gap:18, marginTop:6 }}>
                        {[['#10b981', t('dashboard.chart.leads')],['#818cf8', t('dashboard.chart.messages')],['#ec4899', t('dashboard.chart.income')]].map(([c,n]) => (
                            <span key={n} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'rgba(255,255,255,0.45)' }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:c }} />{n}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Lead origin donut */}
                <div style={card}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <p style={secTitle}>{t('dashboard.chart.leadOrigin')}</p>
                        <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>{originLabel}</span>
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
                    {(() => {
                        const maxClientes = Math.max(1, ...etapasStats.map(e => e.cantidadClientes));
                        const totalClientes = etapasStats.reduce((s, e) => s + e.cantidadClientes, 0);
                        return (
                            <>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                                    <p style={secTitle}>{t('dashboard.funnel.title')}</p>
                                    <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>
                                        {etapasStats.length} {t('dashboard.funnel.stages')} · {totalClientes} {t('dashboard.funnel.contacts')}
                                    </span>
                                </div>
                                {etapasStats.length === 0 ? (
                                    <p style={{ color:'rgba(255,255,255,0.28)', fontSize:'0.82rem' }}>{t('dashboard.funnel.noStages')}</p>
                                ) : (
                                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                                        {etapasStats.map(etapa => {
                                            const barW = Math.round((etapa.cantidadClientes / maxClientes) * 100);
                                            return (
                                                <div key={etapa.id}>
                                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                                                        <span style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.72)', fontWeight:500 }}>{etapa.nombre}</span>
                                                        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                                                            <span style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.38)' }}>{etapa.pctMensajes}% msgs</span>
                                                            <span style={{ fontSize:'0.85rem', fontWeight:700, color:'white' }}>{etapa.cantidadClientes.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ height:6, background:'rgba(255,255,255,0.07)', borderRadius:4, overflow:'hidden' }}>
                                                        <div style={{ height:'100%', width:`${barW}%`, background: etapa.color || '#6366f1', borderRadius:4, transition:'width 0.7s ease' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Top Clientes / Top Agentes toggle card */}
                <div style={{ ...card, display:'flex', flexDirection:'column' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                        <p style={secTitle}>{t('dashboard.ranking.title')}</p>
                        <div style={{ display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:8, padding:3, gap:2 }}>
                            {[['agentes', t('dashboard.ranking.agents')], ['clientes', t('dashboard.ranking.clients')]].map(([v,lbl]) => (
                                <button key={v} onClick={() => setTopView(v)} style={{
                                    padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer',
                                    fontSize:'0.74rem', fontWeight:600, transition:'all 0.15s',
                                    background: topView === v ? 'rgba(255,255,255,0.13)' : 'transparent',
                                    color: topView === v ? 'white' : 'rgba(255,255,255,0.38)',
                                }}>{lbl}</button>
                            ))}
                        </div>
                    </div>
                    {(() => {
                        const list = (topView === 'agentes' ? topStats.topAgentes : topStats.topClientes).slice(0, 5);
                        const maxTotal = Math.max(1, ...list.map(r => r.total || 0));
                        if (!list.length) return (
                            <p style={{ color:'rgba(255,255,255,0.28)', fontSize:'0.82rem' }}>
                                {topView === 'agentes' ? t('dashboard.ranking.noSales') : t('dashboard.ranking.noLoads')}
                            </p>
                        );
                        return (
                            <div style={{ display:'flex', flexDirection:'column', gap:14, flex:1, justifyContent:'space-around' }}>
                                {list.map((row, idx) => (
                                    <div key={row.id || idx} style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:'0.72rem', fontWeight:700, color:'rgba(255,255,255,0.28)', width:20, textAlign:'center', flexShrink:0 }}>#{idx+1}</span>
                                        {row.fotoUrl
                                            ? <img src={row.fotoUrl} alt={row.nombre} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`2px solid ${AGENT_COLORS[idx % 4]}` }} />
                                            : <div style={{
                                                width:32, height:32, borderRadius:'50%', flexShrink:0,
                                                background: AGENT_COLORS[idx % 4] + '22',
                                                border: `2px solid ${AGENT_COLORS[idx % 4]}`,
                                                display:'flex', alignItems:'center', justifyContent:'center',
                                            }}>
                                                <span style={{ fontSize:'0.68rem', fontWeight:700, color: AGENT_COLORS[idx % 4] }}>
                                                    {(row.nombre || '?').slice(0,2).toUpperCase()}
                                                </span>
                                              </div>
                                        }
                                        <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontSize:'0.82rem', fontWeight:600, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                {row.nombre}
                                            </div>
                                            <div style={{ height:4, background:'rgba(255,255,255,0.07)', borderRadius:2, marginTop:4, overflow:'hidden' }}>
                                                <div style={{ height:'100%', width:`${Math.round((row.total / maxTotal) * 100)}%`, background: AGENT_COLORS[idx % 4], borderRadius:2, transition:'width 0.7s ease' }} />
                                            </div>
                                        </div>
                                        <div style={{ textAlign:'right', flexShrink:0 }}>
                                            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'white' }}>
                                                ${row.total >= 1000 ? (row.total / 1000).toFixed(1) + 'K' : row.total?.toFixed(0)}
                                            </div>
                                            <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.35)' }}>
                                                {topView === 'agentes' ? t('dashboard.ranking.inSales') : t('dashboard.ranking.inLoads')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* ── Channels status (compact) ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
                {[
                    { label:'WhatsApp', icon:'fa-whatsapp', connected:data.whatsappConectado, path:'/whatsapp-vincular', brandColor:'#25D366' },
                    { label:'Telegram', icon:'fa-telegram', connected:data.telegramConnected, path:'/telegram-vincular', brandColor:'#229ED9' },
                ].map(ch => (
                    <div key={ch.label} onClick={() => navigate(ch.path)} style={{ ...card, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
                        <div style={{
                            width:42, height:42, borderRadius:12, flexShrink:0,
                            background: ch.brandColor + '22',
                            border:`1px solid ${ch.brandColor}55`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                            <i className={`fab ${ch.icon}`} style={{ color: ch.brandColor, fontSize:'1.2rem' }} />
                        </div>
                        <div style={{ flex:1 }}>
                            <div style={{ fontSize:'0.92rem', fontWeight:600, color:'white' }}>{ch.label}</div>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                                <span style={{ width:7, height:7, borderRadius:'50%', background: ch.connected ? ch.brandColor : '#6b7280' }} />
                                <span style={{ fontSize:'0.75rem', color: ch.connected ? ch.brandColor : 'rgba(255,255,255,0.38)' }}>
                                    {ch.connected ? t('dashboard.channels.connected') : t('dashboard.channels.disconnected')}
                                </span>
                            </div>
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
                        <h3 style={{ marginTop:0, color:'#fff' }}>{t('dashboard.leaveTeam.title')}</h3>
                        <p style={{ color:'#9ca3af', fontSize:'0.92rem', lineHeight:1.6, marginBottom:24 }}>
                            {t('dashboard.leaveTeam.message')}
                        </p>
                        <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                            <button onClick={() => setModalAbandonar(false)} className="btn-secondary">{t('common.cancel')}</button>
                            <button onClick={abandonarEquipo} className="btn-danger">{t('common.leaveTeam')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
