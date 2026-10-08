import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Hook simple para detectar viewport mobile (< 768px).
function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
    );
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < breakpoint);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [breakpoint]);
    return isMobile;
}

import { Navigate } from 'react-router-dom';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import '../assets/css/dashboard.css';
import useDialog from '../hooks/useDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import '../assets/css/pages/Auditoria.css';

const SEV_COLOR = { alta: '#ef4444', media: '#f59e0b', baja: '#94a3b8' };
const SEV_BG    = { alta: 'rgba(239,68,68,0.10)', media: 'rgba(245,158,11,0.10)', baja: 'rgba(148,163,184,0.08)' };

// Gradientes de las stat cards — mismos tonos que los KPI del Dashboard.
const STAT_GRAD = {
    violet: 'linear-gradient(135deg,#4a1d96 0%,#6d28d9 45%,#7c3aed 100%)',
    blue:   'linear-gradient(135deg,#0c4a6e 0%,#0369a1 50%,#0284c7 100%)',
    green:  'linear-gradient(135deg,#064e3b 0%,#065f46 45%,#059669 100%)',
    amber:  'linear-gradient(135deg,#78350f 0%,#b45309 45%,#d97706 100%)',
    red:    'linear-gradient(135deg,#7f1d1d 0%,#b91c1c 45%,#dc2626 100%)',
};

const ESTADO_META = {
    cumplido:    { icon: 'fa-circle-check',        color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.30)' },
    parcial:     { icon: 'fa-circle-exclamation',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.30)' },
    incumplido:  { icon: 'fa-circle-xmark',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.30)' },
};

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function fmtPeriod(ini, fin) {
    if (!ini || !fin) return '—';
    const a = new Date(ini), b = new Date(fin);
    const fmt = d => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return fmt(a) + ' → ' + fmt(b);
}

// Parseo defensivo: soporta el formato legacy (array directo de hallazgos)
// y el formato nuevo ({ resumen_ejecutivo, procedimientos[], hallazgos[] }).
function parseReportPayload(json) {
    try {
        const parsed = JSON.parse(json || '[]');
        if (Array.isArray(parsed)) {
            return { resumen_ejecutivo: '', procedimientos: [], hallazgos: parsed, conversaciones: [], estadisticas: null };
        }
        return {
            resumen_ejecutivo: parsed.resumen_ejecutivo || '',
            procedimientos: Array.isArray(parsed.procedimientos) ? parsed.procedimientos : [],
            hallazgos: Array.isArray(parsed.hallazgos) ? parsed.hallazgos : [],
            conversaciones: Array.isArray(parsed.conversaciones) ? parsed.conversaciones : [],
            estadisticas: parsed.estadisticas || null,
        };
    } catch {
        return { resumen_ejecutivo: '', procedimientos: [], hallazgos: [], conversaciones: [], estadisticas: null };
    }
}

// Modal usando las clases CSS del dashboard (backdrop blur, border-radius 18px)
function Modal({ children, onClose }) {
    const dialog = useDialog(true, onClose);
    return (
        <div className="db-modal-overlay" onClick={onClose} style={{ animation: 'fadeIn 0.15s ease-out' }}>
            <div
                className="db-modal"
                {...dialog}
                onClick={e => e.stopPropagation()}
                style={{ animation: 'slideUp 0.18s ease-out', maxWidth: 460, width: '100%' }}
            >
                {children}
            </div>
        </div>
    );
}

// Tarjeta de métrica para el header de la pestaña Reportes — gradiente full color
// con el mismo look que los KPI del Dashboard.
function AuditStatCard({ icon, label, value, gradient, small }) {
    return (
        <div className="aud-1" style={{ background: gradient || STAT_GRAD.violet }}>
            <div className="aud-2">
                <i className={`fa-solid ${icon} aud-3`} />
            </div>
            <div>
                <div className="aud-4">
                    {label}
                </div>
                <div className="aud-5" style={{ fontSize: small ? '1.05rem' : '2.2rem', lineHeight: small ? 1.25 : 1 }}>
                    {value}
                </div>
            </div>
        </div>
    );
}

export default function Auditoria() {
    const { usuario, loading: userLoading } = useUser();
    const toast = useToast();
    const { t } = useLanguage();
    const isMobile = useIsMobile();
    const isEnterprise = usuario?.plan?.agenteIaHabilitado === true
        || usuario?.plan?.nombre === 'ENTERPRISE';

    const [tab, setTab] = useState('reportes');

    const [reports, setReports]           = useState([]);
    const [selected, setSelected]         = useState(null);
    const [loadingList, setLoadingList]   = useState(true);
    const [runLoading, setRunLoading]     = useState(false);
    const [runError, setRunError]         = useState('');
    const [hideFP, setHideFP]             = useState(true);
    const [expandedProcs, setExpandedProcs] = useState({});
    const [rowExpanded, setRowExpanded]   = useState({});
    const [editingMeta, setEditingMeta]   = useState(null);
    const [deleting, setDeleting]         = useState(null);

    const [cfg, setCfg] = useState({
        auditEnabled: false, auditEmail: '',
        auditWhatsappPhone: '', auditDispositivoId: '',
        horarioInicio: '09:00', horarioFin: '18:00',
        respuestaMaxMinutos: 30, respuestaPicoMaxMinutos: 15,
        horasPico: [{ inicio: '11:00', fin: '12:30' }, { inicio: '17:00', fin: '18:15' }],
    });
    const [dispositivos, setDispositivos] = useState([]);
    const [cfgSaving, setCfgSaving]       = useState(false);
    const [cfgSaved, setCfgSaved]         = useState(false);

    const loadReports = useCallback(async () => {
        try {
            const res = await api.get('/audit/reports');
            const list = res.data || [];
            setReports(list);
            if (selected) {
                const refreshed = list.find(r => r.id === selected.id);
                if (refreshed) setSelected(refreshed);
            }
        } catch { /* silencioso */ }
        finally { setLoadingList(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isEnterprise || userLoading) return;
        loadReports();
        api.get('/agent-config/audit').then(res => {
            const d = res.data || {};
            setCfg({
                auditEnabled: d.auditEnabled || false,
                auditEmail: d.auditEmail || '',
                auditWhatsappPhone: d.auditWhatsappPhone || '',
                auditDispositivoId: d.auditDispositivoId ? String(d.auditDispositivoId) : '',
                horarioInicio: d.horarioInicio || '09:00',
                horarioFin: d.horarioFin || '18:00',
                respuestaMaxMinutos: d.respuestaMaxMinutos ?? 30,
                respuestaPicoMaxMinutos: d.respuestaPicoMaxMinutos ?? 15,
                horasPico: (() => {
                    try {
                        const p = JSON.parse(d.horasPicoConfig || '[]');
                        return Array.isArray(p) ? p : [];
                    } catch { return []; }
                })(),
            });
        }).catch(() => { /* silencioso */ });
        api.get('/whatsapp').then(res => {
            setDispositivos(Array.isArray(res.data) ? res.data : []);
        }).catch(() => { /* silencioso */ });
    }, [isEnterprise, userLoading, loadReports]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const runAudit = async () => {
        setRunLoading(true);
        setRunError('');
        try {
            const res = await api.post('/audit/run-now');
            setReports(prev => [res.data, ...prev.filter(r => r.id !== res.data.id)]);
            setSelected(res.data);
            const sentEmail = res.data?.sentEmail === true;
            const sentWa    = res.data?.sentWhatsapp === true;
            if (sentEmail && sentWa) {
                toast(t('auditor.toasts.sentTitle'), t('auditor.toasts.sentBoth'), '#10b981');
            } else if (sentEmail) {
                toast(t('auditor.toasts.sentTitle'), t('auditor.toasts.sentEmailOnly'), '#3b82f6');
            } else if (sentWa) {
                toast(t('auditor.toasts.sentTitle'), t('auditor.toasts.sentWhatsappOnly'), '#3b82f6');
            } else {
                toast(t('auditor.toasts.readyTitle'), t('auditor.toasts.sentNone'), '#f59e0b');
            }
        } catch (err) {
            const msg = err?.response?.data?.error || t('auditor.toasts.runError');
            setRunError(msg);
            toast('Error', msg, '#ef4444');
        } finally {
            setRunLoading(false);
        }
    };

    const toggleFP = async (reportId, idx) => {
        try {
            const res = await api.patch(`/audit/reports/${reportId}/hallazgo/${idx}/false-positive`);
            setReports(prev => prev.map(r => r.id === reportId ? res.data : r));
            if (selected?.id === reportId) setSelected(res.data);
        } catch { /* silencioso */ }
    };

    const persistOrden = useCallback(async (lista) => {
        try {
            await api.post('/audit/reports/reorder', { orden: lista.map(r => r.id) });
        } catch {
            toast('Error', t('auditor.toasts.reorderError'), '#ef4444');
        }
    }, [toast, t]);

    const moveReport = (id, delta) => {
        setReports(prev => {
            const idx = prev.findIndex(r => r.id === id);
            if (idx < 0) return prev;
            const target = idx + delta;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[target]] = [next[target], next[idx]];
            persistOrden(next);
            return next;
        });
    };

    const saveMeta = async () => {
        if (!editingMeta) return;
        try {
            const res = await api.patch(`/audit/reports/${editingMeta.id}`, {
                nombre: editingMeta.nombre, notas: editingMeta.notas,
            });
            setReports(prev => prev.map(r => r.id === editingMeta.id ? res.data : r));
            if (selected?.id === editingMeta.id) setSelected(res.data);
            setEditingMeta(null);
            toast(t('auditor.toasts.updateSuccessTitle'), t('auditor.toasts.updateSuccess'), '#10b981');
        } catch {
            toast('Error', t('auditor.toasts.updateError'), '#ef4444');
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        const id = deleting.id;
        try {
            await api.delete(`/audit/reports/${id}`);
            setReports(prev => prev.filter(r => r.id !== id));
            if (selected?.id === id) setSelected(null);
            setDeleting(null);
            toast(t('auditor.toasts.deleteSuccessTitle'), t('auditor.toasts.deleteSuccess'), '#10b981');
        } catch {
            toast('Error', t('auditor.toasts.deleteError'), '#ef4444');
        }
    };

    const saveConfig = async () => {
        setCfgSaving(true);
        try {
            const { auditDispositivoId, horasPico, ...rest } = cfg;
            await api.put('/agent-config/audit', {
                ...rest,
                auditDispositivoId: auditDispositivoId ? Number(auditDispositivoId) : null,
                horasPicoConfig: JSON.stringify(horasPico || []),
            });
            setCfgSaved(true);
            setTimeout(() => setCfgSaved(false), 2200);
            toast(t('auditor.toasts.configSavedTitle'), t('auditor.toasts.configSaved'), '#10b981');
        } catch (err) {
            const msg = err?.response?.data?.error || t('auditor.toasts.configError');
            toast('Error', msg, '#ef4444');
        } finally {
            setCfgSaving(false);
        }
    };

    const payload = useMemo(
        () => selected ? parseReportPayload(selected.hallazgosJson) : { resumen_ejecutivo: '', procedimientos: [], hallazgos: [] },
        [selected]
    );

    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    useEffect(() => {
        if (!selected) return;
        const next = {};
        payload.procedimientos.forEach((p, i) => {
            next[i] = p.estado === 'incumplido' || p.estado === 'parcial';
        });
        setExpandedProcs(next);
    }, [selected?.id, payload.procedimientos]);
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

    if (userLoading || !usuario || !usuario.plan) {
        return (
            <div className="db-root aud-6">
                <span className="aud-7">{t('common.loading')}</span>
            </div>
        );
    }
    if (!isEnterprise) return <Navigate to="/planes" replace />;

    const { resumen_ejecutivo, procedimientos, hallazgos, conversaciones, estadisticas } = payload;
    const visibles = hideFP ? hallazgos.filter(h => !h.false_positive) : hallazgos;
    const fpCount  = hallazgos.filter(h => h.false_positive).length;

    const counts = procedimientos.reduce((acc, p) => {
        acc[p.estado] = (acc[p.estado] || 0) + 1;
        return acc;
    }, { cumplido: 0, parcial: 0, incumplido: 0 });

    // Métricas agregadas para el stats row
    const totalIncumplimientos = reports.reduce((s, r) => s + (r.incumplimientos || 0), 0);
    const incGrad = totalIncumplimientos === 0 ? STAT_GRAD.green
        : totalIncumplimientos <= 5 ? STAT_GRAD.amber : STAT_GRAD.red;

    return (
        <div className="db-root audit-scope aud-8" style={{ '--db-accent': '#a78bfa' }}>

            {/* Topbar con tabs */}
            <div className="db-topbar aud-9">
                <div className="aud-10">
                    <div>
                        <div className="db-greeting aud-11">
                            <i className="fa-solid fa-magnifying-glass-chart aud-12" />
                            {t('auditor.title')}
                        </div>
                        <div className="db-subtitle">
                            {tab === 'reportes'
                                ? t('auditor.subtitleReports')
                                : t('auditor.subtitleConfig')}
                        </div>
                    </div>
                    <div className="aud-13">
                        <TabButton active={tab === 'reportes'} onClick={() => setTab('reportes')}
                                   icon="fa-list-ul" label={t('auditor.tabs.reports')} count={reports.length} />
                        <TabButton active={tab === 'config'} onClick={() => setTab('config')}
                                   icon="fa-gear" label={t('auditor.tabs.config')}
                                   dot={cfg.auditEnabled} />
                    </div>
                </div>
                {tab === 'reportes' && (
                    <div className="aud-14">
                        {runError && (
                            <span className="aud-15">{runError}</span>
                        )}
                        <button
                            onClick={runAudit}
                            disabled={runLoading || !cfg.auditEnabled}
                            title={!cfg.auditEnabled ? t('auditor.runDisabledTip') : ''}
                            className="btn-primary aud-16"
                            style={{ opacity: !cfg.auditEnabled ? 0.5 : 1, cursor: !cfg.auditEnabled ? 'not-allowed' : 'pointer' }}
                        >
                            <i className={`fa-solid ${runLoading ? 'fa-spinner fa-spin' : 'fa-microscope'} aud-17`} />
                            {runLoading ? t('auditor.analyzing') : t('auditor.runNow')}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Tab Reportes ── */}
            {tab === 'reportes' && (
                <div className="aud-18">
                    {/* Stats row — sólo cuando ya hay datos */}
                    {!loadingList && reports.length > 0 && (
                        <div className="db-metrics-row aud-19">
                            <AuditStatCard
                                icon="fa-file-contract"
                                label={t('auditor.stats.total')}
                                value={reports.length}
                                gradient={STAT_GRAD.violet}
                            />
                            <AuditStatCard
                                icon="fa-triangle-exclamation"
                                label={t('auditor.stats.incumplimientos')}
                                value={totalIncumplimientos}
                                gradient={incGrad}
                            />
                            <AuditStatCard
                                icon="fa-star-half-stroke"
                                label={t('auditor.x.avgScore')}
                                value={reports.length > 0
                                    ? Math.round(reports.reduce((s, r) => s + (r.score || 0), 0) / reports.length) + '%'
                                    : '—'}
                                gradient={STAT_GRAD.blue}
                                small
                            />
                        </div>
                    )}

                    {/* Split panel: lista izquierda / detalle derecha */}
                    <div className="aud-206" style={{ flex: '1', flexDirection: isMobile ? 'column' : 'row' }}>
                        {/* LEFT: historial de reportes */}
                        <div className="aud-21" style={{ width: isMobile ? '100%' : 308, display: (isMobile && selected) ? 'none' : 'flex' }}>
                            {loadingList ? (
                                <ReportListSkeleton />
                            ) : reports.length === 0 ? (
                                <EmptyHistory t={t} />
                            ) : reports.map((r, idx) => (
                                <ReportRow
                                    key={r.id} r={r} idx={idx} total={reports.length} t={t}
                                    selected={selected?.id === r.id}
                                    expanded={!!rowExpanded[r.id]}
                                    onSelect={() => setSelected(r)}
                                    onToggleExpand={() => setRowExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                                    onEdit={() => setEditingMeta({ id: r.id, nombre: r.nombre || '', notas: r.notas || '' })}
                                    onDelete={() => setDeleting(r)}
                                    onMoveUp={() => moveReport(r.id, -1)}
                                    onMoveDown={() => moveReport(r.id, +1)}
                                />
                            ))}
                        </div>

                        {/* RIGHT: detalle del reporte seleccionado */}
                        <div className="aud-22" style={{ display: (isMobile && !selected) ? 'none' : 'block' }}>
                            {!selected ? (
                                <SelectPrompt t={t} />
                            ) : (
                                <div className="aud-23">
                                    {/* Volver en mobile */}
                                    {isMobile && (
                                        <button className="aud-24"
                                            onClick={() => setSelected(null)}
                                        >
                                            <i className="fa-solid fa-arrow-left aud-17" />
                                            {t('auditor.backToHistory')}
                                        </button>
                                    )}

                                    {/* ── Cabecera del reporte ── */}
                                    <div className="db-card aud-25">
                                        {/* Chip de título — mismo patrón que ReportRow */}
                                        <div className="aud-26">
                                            <ReportChip r={selected} />
                                            <div className="aud-27">
                                                {fpCount > 0 && (
                                                    <button className="aud-28"
                                                        onClick={() => setHideFP(v => !v)}
                                                        style={{ background: hideFP ? 'rgba(255,255,255,0.05)' : 'rgba(167,139,250,0.12)', color: hideFP ? 'rgba(255,255,255,0.45)' : '#c4b5fd' }}
                                                    >
                                                        <i className="fa-solid fa-eye-slash aud-29" />
                                                        {hideFP
                                                            ? `${t('auditor.showFP')} ${fpCount} ${fpCount > 1 ? t('auditor.falsePositives') : t('auditor.falsePositive')}`
                                                            : t('auditor.hideFP')}
                                                    </button>
                                                )}
                                                <IncumplimientosBadge n={selected.incumplimientos} t={t} />
                                                <ScoreBar score={selected.score || 0} />
                                                {estadisticas?.respuesta_tiempo_score != null && (
                                                    <TiempoRespuestaBar
                                                        score={estadisticas.respuesta_tiempo_score}
                                                        avgMin={estadisticas.tiempo_respuesta_promedio_minutos}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <div className="aud-30">
                                            {t('auditor.period')}: {fmtPeriod(selected.periodoInicio, selected.periodoFin)}
                                            {selected.nombre && (
                                                <span className="aud-31">· {fmtDate(selected.createdAt)}</span>
                                            )}
                                        </div>

                                        {/* Resumen ejecutivo */}
                                        {(resumen_ejecutivo || selected.resumen) && (
                                            <div className="aud-32">
                                                <div className="aud-33">
                                                    <i className="fa-solid fa-clipboard-list aud-17" />
                                                    {t('auditor.executiveSummary')}
                                                </div>
                                                {resumen_ejecutivo || selected.resumen}
                                            </div>
                                        )}

                                        {selected.notas && (
                                            <div className="aud-34">
                                                <div className="aud-35">
                                                    <i className="fa-regular fa-note-sticky aud-36" />
                                                    {t('auditor.notes')}
                                                </div>
                                                {selected.notas}
                                            </div>
                                        )}

                                        <div className="aud-37">
                                            {t('auditor.tokensUsed')}: {selected.tokensUsados?.toLocaleString('es-AR')}
                                        </div>
                                    </div>

                                    {/* ── Procedimientos auditados ── */}
                                    {procedimientos.length > 0 && (
                                        <div className="aud-38">
                                            <div className="aud-39">
                                                <div className="aud-40">
                                                    <i className="fa-solid fa-list-check aud-41" />
                                                    {t('auditor.procedures')} ({procedimientos.length})
                                                </div>
                                                <div className="aud-42">
                                                    {counts.cumplido > 0 && (
                                                        <span className="aud-43">
                                                            <i className="fa-solid fa-circle-check aud-44" />
                                                            {counts.cumplido}
                                                        </span>
                                                    )}
                                                    {counts.parcial > 0 && (
                                                        <span className="aud-45">
                                                            <i className="fa-solid fa-circle-exclamation aud-44" />
                                                            {counts.parcial}
                                                        </span>
                                                    )}
                                                    {counts.incumplido > 0 && (
                                                        <span className="aud-46">
                                                            <i className="fa-solid fa-circle-xmark aud-44" />
                                                            {counts.incumplido}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {procedimientos.map((p, i) => {
                                                const meta = ESTADO_META[p.estado] || ESTADO_META.parcial;
                                                const isOpen = !!expandedProcs[i];
                                                const evidencias = Array.isArray(p.evidencias) ? p.evidencias : [];
                                                return (
                                                    <div
                                                        key={i}
                                                        className="db-card aud-47"
                                                        style={{ borderLeft: `3px solid ${meta.color}` }}
                                                    >
                                                        <button className="aud-48"
                                                            type="button"
                                                            onClick={() => setExpandedProcs(prev => ({ ...prev, [i]: !prev[i] }))}
                                                        >
                                                            <div className="aud-49">
                                                                {p.punto || `${t('auditor.procedures')} ${i + 1}`}
                                                            </div>
                                                            <div className="aud-50">
                                                                <span className="aud-207" style={{ borderRadius: '6px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                                                    <i className={`fa-solid ${meta.icon}`} />
                                                                    {t(`auditor.states.${p.estado}`)}
                                                                </span>
                                                                {evidencias.length > 0 && (
                                                                    <span className="aud-52">
                                                                        {evidencias.length} {evidencias.length > 1 ? t('auditor.evidences') : t('auditor.evidence')}
                                                                    </span>
                                                                )}
                                                                <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} aud-53`} />
                                                            </div>
                                                        </button>

                                                        {isOpen && (
                                                            <div style={{
                                                                padding: '0 16px 14px 16px',
                                                                display: 'flex', flexDirection: 'column', gap: 10,
                                                                animation: 'fadeIn 0.18s ease-out',
                                                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                                            }}>
                                                                {p.justificacion && (
                                                                    <div className="aud-54" style={{ borderLeft: `2px solid ${meta.border}` }}>
                                                                        {p.justificacion}
                                                                    </div>
                                                                )}

                                                                {evidencias.length === 0 ? (
                                                                    <div className="aud-55">
                                                                        {t('auditor.noEvidences')}
                                                                    </div>
                                                                ) : evidencias.map((ev, j) => (
                                                                    <EvidenciaCard key={j} ev={ev} meta={meta} t={t} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ── Hallazgos individuales ── */}
                                    {hallazgos.length > 0 && (
                                        <>
                                            <div className="aud-56">
                                                <i className="fa-solid fa-triangle-exclamation aud-57" />
                                                {t('auditor.findings')} ({visibles.length})
                                            </div>

                                            {visibles.length === 0 && hallazgos.length > 0 && (
                                                <div className="aud-58">
                                                    {t('auditor.allFP')}
                                                </div>
                                            )}

                                            {visibles.map((h) => {
                                                const realIdx = hallazgos.indexOf(h);
                                                const sev  = h.severidad || 'baja';
                                                const isFP = h.false_positive === true;
                                                return (
                                                    <div
                                                        key={realIdx}
                                                        className="db-card aud-59"
                                                        style={{ opacity: isFP ? 0.5 : 1, borderLeft: `3px solid ${SEV_COLOR[sev] || '#475569'}` }}
                                                    >
                                                        <div className="aud-60">
                                                            <div className="aud-61">
                                                                {h.regla_violada || t('auditor.states.incumplido')}
                                                            </div>
                                                            <div className="aud-62">
                                                                <span className="aud-208" style={{ borderRadius: '6px', background: SEV_BG[sev] || SEV_BG.baja, color: SEV_COLOR[sev] || SEV_COLOR.baja, border: `1px solid ${(SEV_COLOR[sev] || SEV_COLOR.baja)}40` }}>
                                                                    {sev}
                                                                </span>
                                                                {h.tipo === 'advertencia' && (
                                                                    <span className="aud-64">
                                                                        {t('auditor.warning')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {h.descripcion && (
                                                            <div className="aud-65">
                                                                {h.descripcion}
                                                            </div>
                                                        )}

                                                        {h.cita_textual && (
                                                            <blockquote className="aud-66">
                                                                &quot;{h.cita_textual}&quot;
                                                            </blockquote>
                                                        )}

                                                        <div className="aud-67">
                                                            <div className="aud-68">
                                                                {h.vendedor && (
                                                                    <span>
                                                                        <i className="fa-solid fa-user aud-69" />
                                                                        <strong className="aud-70">{h.vendedor}</strong>
                                                                    </span>
                                                                )}
                                                                {h.cuando && (
                                                                    <span className="aud-31">
                                                                        <i className="fa-regular fa-clock aud-29" />
                                                                        {h.cuando}
                                                                    </span>
                                                                )}
                                                                {h.confianza && <span className="aud-31">{t('auditor.confidence')}: {h.confianza}</span>}
                                                                {h.cliente_id && <span className="aud-31">{t('auditor.client')} ID: {h.cliente_id}</span>}
                                                            </div>
                                                            <button className="aud-209"
                                                                onClick={() => toggleFP(selected.id, realIdx)}
                                                                style={{ borderRadius: '7px', border: isFP
                                                                        ? '1px solid rgba(167,139,250,0.40)'
                                                                        : '1px solid rgba(255,255,255,0.12)', background: isFP
                                                                        ? 'rgba(167,139,250,0.12)'
                                                                        : 'rgba(255,255,255,0.04)', color: isFP ? '#c4b5fd' : 'var(--color-text-3)' }}
                                                            >
                                                                <i className={`fa-solid ${isFP ? 'fa-rotate-left' : 'fa-ban'} aud-29`} />
                                                                {isFP ? t('auditor.restore') : t('auditor.markFP')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {conversaciones.length > 0 && (
                                        <ConversacionesSection conversaciones={conversaciones} />
                                    )}

                                    {procedimientos.length === 0 && hallazgos.length === 0 && (
                                        <div className="aud-72">
                                            <i className="fa-solid fa-circle-check aud-73" />
                                            {t('auditor.noIncidents')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab Configuración ── */}
            {tab === 'config' && (
                <ConfigForm
                    cfg={cfg} setCfg={setCfg}
                    dispositivos={dispositivos}
                    saving={cfgSaving} saved={cfgSaved}
                    onSave={saveConfig}
                    isMobile={isMobile}
                />
            )}

            {/* Modal edición de metadatos */}
            {editingMeta && (
                <Modal onClose={() => setEditingMeta(null)}>
                    <h3 className="aud-74">{t('auditor.modal.editTitle')}</h3>
                    <p className="aud-75">
                        {t('auditor.modal.editSubtitle')}
                    </p>

                    <div className="db-metric-label aud-76">{t('auditor.modal.name')}</div>
                    <input aria-label={t('auditor.modal.name')}
                        type="text"
                        value={editingMeta.nombre}
                        onChange={e => setEditingMeta(m => ({ ...m, nombre: e.target.value }))}
                        placeholder={t('auditor.modal.namePlaceholder')}
                        style={inputStyle}
                    />

                    <div className="db-metric-label aud-77">{t('auditor.modal.notes')}</div>
                    <AutoTextarea
                        value={editingMeta.notas}
                        onChange={e => setEditingMeta(m => ({ ...m, notas: e.target.value }))}
                        placeholder={t('auditor.modal.notesPlaceholder')}
                        minHeight={90}
                        style={inputStyle}
                    />

                    <div className="db-modal-actions aud-78">
                        <button onClick={() => setEditingMeta(null)} style={btnGhost}>{t('auditor.modal.cancel')}</button>
                        <button onClick={saveMeta} className="btn-primary aud-79">
                            <i className="fa-solid fa-floppy-disk aud-36" />
                            {t('auditor.modal.save')}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Modal confirmación eliminación */}
            {deleting && (
                <Modal onClose={() => setDeleting(null)}>
                    <h3 className="aud-80">
                        <i className="fa-solid fa-triangle-exclamation aud-81" />
                        {t('auditor.modal.deleteTitle')}
                    </h3>
                    <p className="aud-82">
                        {t('auditor.modal.deleteConfirm')}
                        {deleting.nombre
                            ? <strong className="aud-83"> &quot;{deleting.nombre}&quot;</strong>
                            : <span> {fmtDate(deleting.createdAt)}</span>}?
                        {' '}{t('auditor.modal.deleteIrreversible')}
                    </p>
                    <div className="db-modal-actions">
                        <button onClick={() => setDeleting(null)} style={btnGhost}>{t('auditor.modal.cancel')}</button>
                        <button onClick={confirmDelete} style={{
                            ...btnGhost, background: 'rgba(239,68,68,0.18)',
                            border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5',
                        }}>
                            <i className="fa-solid fa-trash aud-36" />
                            {t('auditor.row.delete')}
                        </button>
                    </div>
                </Modal>
            )}

            <style>{`
                @keyframes fadeIn  { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:translateY(0); } }
                @keyframes slideUp { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
                @keyframes shimmer { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }

                /* Cards normales de Auditoría con tinte morado oscuro (scoped) */
                .audit-scope .db-card,
                .audit-scope .db-metric-card {
                    background: linear-gradient(135deg, #181226 0%, #15111f 55%, #100c1a 100%);
                    border-color: rgba(167,139,250,0.12);
                }
                .audit-scope .db-card:hover,
                .audit-scope .db-metric-card:hover {
                    border-color: rgba(167,139,250,0.28);
                }

                /* Scrollbar de la lista de etapas — siempre visible */
                .stages-scroll { scrollbar-width: thin; scrollbar-color: #a78bfa rgba(255,255,255,0.06); }
                .stages-scroll::-webkit-scrollbar { width: 6px; display: block; }
                .stages-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.06); border-radius: 4px; }
                .stages-scroll::-webkit-scrollbar-thumb { background: #a78bfa; border-radius: 4px; min-height: 40px; }
                .stages-scroll::-webkit-scrollbar-thumb:hover { background: #c4b5fd; }
            `}</style>
        </div>
    );
}

// ─── Subcomponentes auxiliares ──────────────────────────────────────────────

// Chip coloreado con el estado de cumplimiento — reutilizado en lista y detalle
function ReportChip({ r }) {
    const n = r.incumplimientos || 0;
    const chipColor = n === 0 ? '#10b981' : n <= 3 ? '#f59e0b' : '#ef4444';
    const chipBg    = n === 0 ? 'rgba(16,185,129,0.14)' : n <= 3 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)';
    const chipIcon  = n === 0 ? 'fa-circle-check' : n <= 3 ? 'fa-circle-exclamation' : 'fa-circle-xmark';
    const label     = r.nombre || fmtDateShort(r.createdAt);
    return (
        <span className="aud-210" style={{ borderRadius: '20px', background: chipBg, color: chipColor, border: `1px solid ${chipColor}28` }}>
            <i className={`fa-solid ${chipIcon} aud-85`} />
            {label}
        </span>
    );
}

function IncumplimientosBadge({ n, t }) {
    const color = n === 0 ? '#10b981' : n <= 3 ? '#f59e0b' : '#ef4444';
    const bg    = n === 0 ? 'rgba(16,185,129,0.12)' : n <= 3 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
    const bord  = n === 0 ? 'rgba(16,185,129,0.25)' : n <= 3 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';
    return (
        <div className="aud-211" style={{ borderRadius: '8px', background: bg, color, border: `1px solid ${bord}` }}>
            {n === 0
                ? t('auditor.noIncidentsShort')
                : `${n} ${n > 1 ? t('auditor.incidents') : t('auditor.incident')}`}
        </div>
    );
}

function EvidenciaCard({ ev, meta, t }) {
    return (
        <div className="aud-87">
            <div className="aud-88">
                <span className="aud-89">
                    <i className="fa-solid fa-user aud-41" />
                    <strong className="aud-70">{ev.vendedor || t('auditor.vendorUnknown')}</strong>
                    {ev.cliente_id && (
                        <span className="aud-90">
                            · {t('auditor.client')} #{ev.cliente_id}
                        </span>
                    )}
                </span>
                {ev.cuando && (
                    <span className="aud-91">
                        <i className="fa-regular fa-clock" />
                        {ev.cuando}
                    </span>
                )}
            </div>

            {ev.como && (
                <div className="aud-92">
                    <span className="aud-93">
                        {t('auditor.how')}:
                    </span>
                    {ev.como}
                </div>
            )}

            {ev.cita_textual && (
                <blockquote className="aud-94" style={{ borderLeft: `3px solid ${meta.color}80` }}>
                    &quot;{ev.cita_textual}&quot;
                </blockquote>
            )}

            {(ev.esperado || ev.ocurrido) && (
                <div className="aud-95">
                    <div className="aud-96">
                        <div className="aud-97">
                            {t('auditor.expected')}
                        </div>
                        <div className="aud-98">{ev.esperado || '—'}</div>
                    </div>
                    <div className="aud-99">
                        <div className="aud-100">
                            {t('auditor.actual')}
                        </div>
                        <div className="aud-98">{ev.ocurrido || '—'}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SelectPrompt({ t }) {
    return (
        <div className="aud-101">
            <div className="aud-102">
                <i className="fa-solid fa-file-contract" />
            </div>
            <span className="aud-103">{t('auditor.selectReport')}</span>
        </div>
    );
}

function EmptyHistory({ t }) {
    return (
        <div className="aud-104">
            <div className="aud-105">
                <i className="fa-solid fa-folder-open" />
            </div>
            <div className="aud-106">
                {t('auditor.emptyState')}<br />
                {t('auditor.emptyStateHint')} <strong className="aud-7">&quot;{t('auditor.runNow')}&quot;</strong>.
            </div>
        </div>
    );
}

// ─── TabButton ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label, count, dot }) {
    return (
        <button className="aud-212"
            onClick={onClick}
            style={{ border: 'none', background: active ? 'rgba(167,139,250,0.14)' : 'transparent', color: active ? '#c4b5fd' : 'rgba(255,255,255,0.5)', borderBottom: active ? '2px solid #a78bfa' : '2px solid transparent' }}
        >
            <i className={`fa-solid ${icon}`} />
            {label}
            {typeof count === 'number' && (
                <span className="aud-108">
                    {count}
                </span>
            )}
            {dot && (
                <span className="aud-109" />
            )}
        </button>
    );
}

// ─── ReportRow ──────────────────────────────────────────────────────────────

function ReportRow({ r, idx, total, selected, expanded, onSelect, onToggleExpand, onEdit, onDelete, onMoveUp, onMoveDown, t }) {
    const sub = r.nombre ? fmtDate(r.createdAt) : fmtPeriod(r.periodoInicio, r.periodoFin);

    return (
        <div className="aud-213" style={{ borderRadius: '14px', background: selected ? 'rgba(167,139,250,0.16)' : 'linear-gradient(135deg, #181226 0%, #15111f 55%, #100c1a 100%)', border: `1px solid ${selected ? 'rgba(167,139,250,0.38)' : 'rgba(167,139,250,0.12)'}` }}>
            {/* Área principal clickeable */}
            <button className="aud-111"
                type="button"
                onClick={onSelect}
            >
                <ReportChip r={r} />

                {/* Fecha / período en muted */}
                <div className="aud-112">
                    {sub}
                </div>

                {/* Preview expandido inline */}
                {expanded && (
                    <div style={{
                        fontSize: '0.78rem', color: 'rgba(255,255,255,0.58)',
                        lineHeight: 1.55, whiteSpace: 'pre-wrap',
                        animation: 'fadeIn 0.18s ease-out',
                        paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        {r.resumen || t('auditor.row.noSummary')}
                        {r.notas && (
                            <div className="aud-113">
                                <i className="fa-regular fa-note-sticky aud-29" />
                                {r.notas}
                            </div>
                        )}
                    </div>
                )}
            </button>

            {/* Footer con acciones */}
            <div className="aud-114">
                <div className="aud-115">
                    <IconButton onClick={onMoveUp} disabled={idx === 0} icon="fa-arrow-up" title={t('auditor.row.moveUp')} />
                    <IconButton onClick={onMoveDown} disabled={idx === total - 1} icon="fa-arrow-down" title={t('auditor.row.moveDown')} />
                    {r.score > 0 && <ScoreBar score={r.score} size="sm" />}
                </div>
                <div className="aud-116">
                    <IconButton onClick={onToggleExpand} icon={expanded ? 'fa-chevron-up' : 'fa-chevron-down'}
                                title={expanded ? t('auditor.row.collapse') : t('auditor.row.expand')} />
                    <IconButton onClick={onEdit} icon="fa-pen" title={t('auditor.row.edit')} />
                    <IconButton onClick={onDelete} icon="fa-trash" title={t('auditor.row.delete')} danger />
                </div>
            </div>
        </div>
    );
}

function IconButton({ onClick, icon, title, disabled, danger }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            disabled={disabled}
            title={title}
            style={{
                padding: '4px 7px', borderRadius: 5, border: 'none',
                background: 'transparent',
                color: disabled
                    ? 'rgba(255,255,255,0.15)'
                    : danger ? '#fca5a5' : 'rgba(255,255,255,0.50)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '0.72rem', transition: '0.12s',
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
            <i className={`fa-solid ${icon}`} />
        </button>
    );
}

function ReportListSkeleton() {
    return (
        <>
            {[1, 2, 3, 4].map(k => (
                <div key={k} className="db-card aud-117">
                    <div className="aud-118">
                        <div style={skel(120, 10)} />
                        <div style={skel(40, 14)} />
                    </div>
                    <div style={skel(160, 9)} />
                </div>
            ))}
        </>
    );
}

// Textarea que se expande automáticamente hasta maxHeight; luego activa scroll.
function AutoTextarea({ value, onChange, placeholder, style, minHeight = 130, maxHeight }) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        const desired = Math.max(el.scrollHeight, minHeight);
        if (maxHeight && desired > maxHeight) {
            el.style.height = maxHeight + 'px';
            el.style.overflowY = 'auto';
        } else {
            el.style.height = desired + 'px';
            el.style.overflowY = 'hidden';
        }
    }, [value, minHeight, maxHeight]);
    return (
        <textarea aria-label={placeholder}
            ref={ref}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            style={{ ...style, resize: 'none', overflow: 'hidden' }}
        />
    );
}

function skel(w, h) {
    return {
        width: w, height: h, borderRadius: 4,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
    };
}

// ─── ScoreBar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, size = 'md' }) {
    const pct = Math.max(0, Math.min(100, score || 0));
    const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const bg    = pct >= 80 ? 'rgba(16,185,129,0.12)' : pct >= 60 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
    const bord  = pct >= 80 ? 'rgba(16,185,129,0.25)' : pct >= 60 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';

    if (size === 'sm') {
        return (
            <div className="aud-214" style={{ borderRadius: '6px', background: bg, border: `1px solid ${bord}`, color }}>
                <i className="fa-solid fa-star-half-stroke aud-120" />
                {pct}%
            </div>
        );
    }

    return (
        <div className="aud-121">
            <div className="aud-122">
                <span className="aud-123">
                    Score
                </span>
                <span className="aud-124" style={{ color }}>{pct}%</span>
            </div>
            <div className="aud-125">
                <div className="aud-126" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

// ─── helpers de color para tiempo de respuesta ───────────────────────────────

function tiempoScoreStyle(score) {
    if (score >= 80) return { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)' };
    if (score >= 50) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' };
    return             { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' };
}

// ─── TiempoRespuestaBar ──────────────────────────────────────────────────────

function TiempoRespuestaBar({ score, avgMin }) {
    const { t } = useLanguage();
    const pct   = Math.max(0, Math.min(100, score || 0));
    const { color } = tiempoScoreStyle(pct);

    return (
        <div className="aud-127">
            <div className="aud-128">
                <span className="aud-129">
                    <i className="fa-solid fa-stopwatch aud-41" />
                    {t('auditor.x.respTimeShort')}
                </span>
                <div className="aud-130">
                    {avgMin != null && (
                        <span className="aud-131">
                            ~{avgMin}min
                        </span>
                    )}
                    <span className="aud-124" style={{ color }}>{pct}%</span>
                </div>
            </div>
            <div className="aud-125">
                <div className="aud-126" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

// ─── ConversacionesSection ────────────────────────────────────────────────────

const ESTADO_CONV = {
    cerrado:       { icon: 'fa-circle-check',       color: '#10b981', label: 'Cerrado' },
    presupuestado: { icon: 'fa-file-invoice-dollar', color: '#3b82f6', label: 'Presupuestado' },
    sin_responder: { icon: 'fa-circle-xmark',        color: '#ef4444', label: 'Sin responder' },
    incompleto:    { icon: 'fa-circle-half-stroke',  color: '#f59e0b', label: 'Incompleto' },
    seguimiento:   { icon: 'fa-rotate-right',        color: '#a78bfa', label: 'Seguimiento' },
};

function ConversacionesSection({ conversaciones }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(true);
    if (!conversaciones || conversaciones.length === 0) return null;

    return (
        <div className="aud-38">
            <button className="aud-132"
                type="button"
                onClick={() => setOpen(v => !v)}
            >
                <i className="fa-solid fa-comments aud-41" />
                {t('auditor.x.convAnalyzed')} ({conversaciones.length})
                <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'} aud-133`} />
            </button>

            {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeIn 0.18s ease-out' }}>
                    {conversaciones.map((conv, i) => {
                        const estadoMeta = ESTADO_CONV[conv.estado] || { icon: 'fa-circle', color: '#94a3b8', label: conv.estado };
                        const tsStyle    = conv.tiempo_score != null ? tiempoScoreStyle(conv.tiempo_score) : null;
                        return (
                            <div key={i} className="db-card aud-134" style={{ borderLeft: `3px solid ${estadoMeta.color}` }}>
                                {/* Fila cabecera: vendedor + badges */}
                                <div className="aud-135">
                                    <div className="aud-136">
                                        <i className="fa-solid fa-user aud-137" />
                                        {conv.vendedor || 'Vendedor desconocido'}
                                        {conv.cliente_id && (
                                            <span className="aud-138">
                                                · {t('auditor.client')} #{conv.cliente_id}
                                            </span>
                                        )}
                                    </div>
                                    <div className="aud-139">
                                        <span className="aud-215" style={{ borderRadius: '6px', background: `${estadoMeta.color}18`, color: estadoMeta.color, border: `1px solid ${estadoMeta.color}40` }}>
                                            <i className={`fa-solid ${estadoMeta.icon} aud-141`} />
                                            {estadoMeta.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Fila de tiempo de respuesta */}
                                {(conv.tiempo_respuesta_minutos != null || conv.tiempo_score != null) && (
                                    <div className="aud-142">
                                        <i className="fa-solid fa-stopwatch aud-143" />
                                        <span className="aud-144">
                                            {t('auditor.x.respTimeLabel')}
                                        </span>
                                        {conv.tiempo_respuesta_minutos != null ? (
                                            <span className="aud-145" style={{ color: conv.tiempo_ok ? '#10b981' : '#ef4444' }}>
                                                <i className="fa-regular fa-clock aud-29" />
                                                {conv.tiempo_respuesta_minutos} min
                                                {conv.tiempo_ok
                                                    ? <i className="fa-solid fa-check aud-146" />
                                                    : <i className="fa-solid fa-triangle-exclamation aud-147" />
                                                }
                                            </span>
                                        ) : (
                                            <span className="aud-148">
                                                {conv.estado === 'sin_responder' ? 'Sin respuesta' : 'No medido'}
                                            </span>
                                        )}
                                        {tsStyle && (
                                            <div className="aud-149">
                                                <div className="aud-122">
                                                    <span className="aud-150">
                                                        {t('auditor.x.points')}
                                                    </span>
                                                    <span className="aud-151" style={{ color: tsStyle.color }}>
                                                        {conv.tiempo_score}%
                                                    </span>
                                                </div>
                                                <div className="aud-152">
                                                    <div className="aud-126" style={{ width: `${conv.tiempo_score}%`, background: tsStyle.color }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {conv.resumen && (
                                    <div className="aud-153">
                                        {conv.resumen}
                                    </div>
                                )}

                                {conv.analisis && (
                                    <div className="aud-154">
                                        {conv.analisis}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── StagesManager ────────────────────────────────────────────────────────────

function StagesManager({ isMobile }) {
    const { t } = useLanguage();
    const toast = useToast();
    const [stages, setStages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    // Confirmación de borrado (antes window.confirm: no accesible ni con el estilo de la app)
    const [stageToDelete, setStageToDelete] = useState(null);
    const [deletingStage, setDeletingStage] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/agent-config/audit/stages');
            setStages(Array.isArray(res.data) ? res.data : []);
        } catch { /* silencioso */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateStage = async (id, patch) => {
        setStages(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
        try {
            await api.patch(`/agent-config/audit/stages/${id}`, patch);
        } catch { toast(t('common.errorTitle'), t('auditor.x.errSaveStage'), '#ef4444'); }
    };

    const confirmDeleteStage = async () => {
        const { id } = stageToDelete;
        setDeletingStage(true);
        try {
            await api.delete(`/agent-config/audit/stages/${id}`);
            setStages(prev => prev.filter(s => s.id !== id));
            setStageToDelete(null);
        } catch { toast(t('common.errorTitle'), t('common.errDelete'), '#ef4444'); }
        finally { setDeletingStage(false); }
    };

    const addStage = async () => {
        setAdding(true);
        try {
            const res = await api.post('/agent-config/audit/stages', {
                nombre: 'Nueva etapa', descripcion: '',
                peso: 10, orden: stages.length, activa: true,
            });
            setStages(prev => [...prev, res.data]);
        } catch { toast(t('common.errorTitle'), t('auditor.x.errAddStage'), '#ef4444'); }
        finally { setAdding(false); }
    };

    const moveStage = async (id, delta) => {
        const idx = stages.findIndex(s => s.id === id);
        if (idx < 0) return;
        const target = idx + delta;
        if (target < 0 || target >= stages.length) return;
        const next = [...stages];
        [next[idx], next[target]] = [next[target], next[idx]];
        setStages(next);
        try {
            await api.post('/agent-config/audit/stages/reorder', { orden: next.map(s => s.id) });
        } catch { toast(t('common.errorTitle'), t('auditor.x.errReorder'), '#ef4444'); }
    };

    const pesoTotal = stages.reduce((s, st) => s + (st.activa ? st.peso : 0), 0);

    return (
        <div className="db-card aud-25">
            <div className="aud-155">
                <div className="db-card-title aud-156">
                    <i className="fa-solid fa-list-check aud-41" />
                    {t('auditor.x.processStages')} ({stages.length})
                </div>
                <div className="aud-157">
                    <span>{t('auditor.x.totalWeight')}</span>
                    <strong className="aud-70">{pesoTotal}</strong>
                </div>
            </div>

            <div className="aud-158">
                {t('auditor.x.stagesIntro')}
            </div>

            {loading ? (
                <div className="aud-159">
                    {t('auditor.x.loadingStages')}
                </div>
            ) : stages.length === 0 ? (
                <div className="aud-160">
                    {t('auditor.x.noStages')}<br />
                    {t('auditor.x.noStagesHint')}
                </div>
            ) : (
                <div className="stages-scroll aud-161" style={{ maxHeight: isMobile ? 'none' : 380 }}>
                    {stages.map((s, i) => (
                        <StageCard
                            key={s.id} stage={s}
                            isFirst={i === 0} isLast={i === stages.length - 1}
                            onUpdate={(patch) => updateStage(s.id, patch)}
                            onDelete={() => setStageToDelete({ id: s.id, nombre: s.nombre })}
                            onMoveUp={() => moveStage(s.id, -1)}
                            onMoveDown={() => moveStage(s.id, +1)}
                        />
                    ))}
                </div>
            )}

            <button className="aud-162"
                onClick={addStage}
                disabled={adding}
                style={{ cursor: adding ? 'not-allowed' : 'pointer' }}
            >
                <i className={`fa-solid ${adding ? 'fa-spinner fa-spin' : 'fa-plus'} aud-17`} />
                {adding ? 'Agregando...' : 'Agregar etapa'}
            </button>
            <ConfirmDialog
                open={!!stageToDelete}
                danger
                title={t('auditor.x.deleteStageTitle')}
                message={`La etapa "${stageToDelete?.nombre || ''}" deja de evaluarse en las próximas auditorías.`}
                confirmLabel={t('common.delete')}
                loading={deletingStage}
                onConfirm={confirmDeleteStage}
                onCancel={() => setStageToDelete(null)}
            />
        </div>
    );
}

function StageCard({ stage, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [localNombre, setLocalNombre] = useState(stage.nombre);
    const [localDesc, setLocalDesc] = useState(stage.descripcion || '');
    const [localPeso, setLocalPeso] = useState(stage.peso);

    useEffect(() => {
        setLocalNombre(stage.nombre);
        setLocalDesc(stage.descripcion || '');
        setLocalPeso(stage.peso);
    }, [stage.nombre, stage.descripcion, stage.peso]);

    const commit = () => {
        const patch = {};
        if (localNombre !== stage.nombre) patch.nombre = localNombre;
        if (localDesc !== stage.descripcion) patch.descripcion = localDesc;
        if (localPeso !== stage.peso) patch.peso = localPeso;
        if (Object.keys(patch).length > 0) onUpdate(patch);
    };

    return (
        <div className="aud-216" style={{ borderRadius: '10px', background: stage.activa
                ? 'linear-gradient(135deg, #181226 0%, #15111f 100%)'
                : 'rgba(255,255,255,0.02)', border: `1px solid ${stage.activa ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.05)'}`, opacity: stage.activa ? 1 : 0.55 }}>
            <div className="aud-164">
                <div className="aud-165">
                    <button onClick={onMoveUp} disabled={isFirst} style={miniBtn(isFirst)}>
                        <i className="fa-solid fa-chevron-up aud-166" />
                    </button>
                    <button onClick={onMoveDown} disabled={isLast} style={miniBtn(isLast)}>
                        <i className="fa-solid fa-chevron-down aud-166" />
                    </button>
                </div>
                <input className="aud-167"
                    aria-label={t('kanban.stageName')}
                    type="text"
                    value={localNombre}
                    onChange={e => setLocalNombre(e.target.value)}
                    onBlur={commit}
                />
                <div className="aud-168">
                    <input className="aud-169"
                        aria-label={t('auditor.x.stageWeight')}
                        type="number" min="1" max="100"
                        value={localPeso}
                        onChange={e => setLocalPeso(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                        onBlur={commit}
                    />
                    <span className="aud-170">pts</span>
                </div>
                <button onClick={() => setExpanded(v => !v)} style={miniBtn(false)}
                        title={expanded ? 'Colapsar' : 'Editar descripción'}>
                    <i className={`fa-solid ${expanded ? 'fa-chevron-up' : 'fa-pen'} aud-171`} />
                </button>
                <button onClick={() => onUpdate({ activa: !stage.activa })} style={miniBtn(false)}
                        title={stage.activa ? 'Desactivar' : 'Activar'}>
                    <i className={`fa-solid ${stage.activa ? 'fa-eye' : 'fa-eye-slash'} aud-171`} />
                </button>
                <button onClick={onDelete} style={{ ...miniBtn(false), color: '#fca5a5' }} title={t('common.delete')}>
                    <i className="fa-solid fa-trash aud-171" />
                </button>
            </div>

            {expanded && (
                <div style={{ padding: '0 11px 10px 40px', animation: 'fadeIn 0.18s ease-out' }}>
                    <textarea className="aud-172"
                        aria-label={t('auditor.x.stageDesc')}
                        value={localDesc}
                        onChange={e => setLocalDesc(e.target.value)}
                        onBlur={commit}
                        placeholder={t('auditor.x.stageDescPh')}
                        rows={3}
                    />
                </div>
            )}
        </div>
    );
}

const miniBtn = (disabled) => ({
    padding: '4px 6px', borderRadius: 4, border: 'none',
    background: 'transparent',
    color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.50)',
    cursor: disabled ? 'not-allowed' : 'pointer',
});

// ─── ConfigForm ─────────────────────────────────────────────────────────────

function ConfigForm({ cfg, setCfg, dispositivos, saving, saved, onSave, isMobile }) {
    const { t } = useLanguage();
    const update = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));
    const horarioOk = !cfg.horarioInicio || !cfg.horarioFin || cfg.horarioInicio < cfg.horarioFin;

    const baseInput = isMobile
        ? { ...inputStyle, fontSize: '1rem', padding: '12px 14px' }
        : inputStyle;

    return (
        <div className="aud-173" style={{ padding: isMobile ? '6px 0 32px' : '8px 2px 24px' }}>
            {/* ── Habilitación del auditor (db-metric-card horizontal, igual que AgenteIA) ── */}
            <div className="db-metric-card aud-174">
                <div className="db-metric-icon">
                    <i className="fa-solid fa-magnifying-glass-chart" />
                </div>
                <div className="aud-175">
                    <div className="db-metric-label">{t('auditor.config.enableLabel')}</div>
                    <div className="aud-176">
                        {t('auditor.config.enableHint')}
                    </div>
                </div>
                <label className="aud-177">
                    <input className="aud-178"
                        type="checkbox"
                        checked={cfg.auditEnabled}
                        onChange={e => update('auditEnabled', e.target.checked)}
                    />
                    <span className="aud-179" style={{ background: cfg.auditEnabled ? '#a78bfa' : 'rgba(255,255,255,0.15)' }}>
                        <span className="aud-180" style={{ left: cfg.auditEnabled ? 23 : 3 }} />
                    </span>
                </label>
            </div>

            <div className="aud-181" style={{ gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr 1fr' }}>
            <StagesManager isMobile={isMobile} />

            {/* ── Horario de análisis ── */}
            <div className="db-card aud-182">
                <div className="db-card-title aud-156">
                    <i className="fa-solid fa-clock aud-41" />
                    {t('auditor.config.scheduleLabel')}
                </div>
                <div className="aud-183">
                    {t('auditor.config.scheduleHint')}
                </div>
                <TimeRangePicker
                    inicio={cfg.horarioInicio}
                    fin={cfg.horarioFin}
                    onChange={(ini, fin) => setCfg(prev => ({ ...prev, horarioInicio: ini, horarioFin: fin }))}
                    baseInput={baseInput}
                    t={t}
                />
                {!horarioOk && (
                    <div className="aud-184">
                        <i className="fa-solid fa-triangle-exclamation" />
                        {t('auditor.config.scheduleError')}
                    </div>
                )}
            </div>

            {/* ── Notificaciones ── */}
            <div className="db-card aud-182">
                <div className="db-card-title aud-156">
                    <i className="fa-solid fa-bell aud-41" />
                    {t('auditor.config.notificationsTitle')}
                </div>

                <Field label={t('auditor.config.emailLabel')} hint={t('auditor.config.emailHint')}>
                    <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={cfg.auditEmail}
                        onChange={e => update('auditEmail', e.target.value)}
                        placeholder={t('auditor.x.emailPh')}
                        style={baseInput}
                    />
                </Field>

                <Field label={t('auditor.config.whatsappLabel')} hint={t('auditor.config.whatsappHint')}>
                    <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={cfg.auditWhatsappPhone}
                        onChange={e => update('auditWhatsappPhone', e.target.value)}
                        placeholder="5491112345678"
                        style={baseInput}
                    />
                </Field>

                <Field label={t('auditor.config.deviceLabel')} hint={t('auditor.config.deviceHint')}>
                    <select
                        value={cfg.auditDispositivoId}
                        onChange={e => update('auditDispositivoId', e.target.value)}
                        style={{ ...baseInput, color: cfg.auditDispositivoId ? '#fff' : 'var(--color-text-3)' }}
                    >
                        <option value="">{t('auditor.config.deviceNone')}</option>
                        {dispositivos.map(d => (
                            <option key={d.id} value={String(d.id)}>
                                {d.alias || d.sessionId} {d.estado === 'CONNECTED' ? '●' : '○'}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            </div>

            {/* ── Tiempo de respuesta ── */}
            <ResponseTimeCard cfg={cfg} setCfg={setCfg} />

            <button
                onClick={onSave}
                disabled={saving || !horarioOk}
                className="btn-primary aud-185"
                style={{ background: saved ? '#10b981' : 'rgba(167,139,250,0.85)', padding: isMobile ? '13px 0' : undefined, fontSize: isMobile ? '0.95rem' : undefined, opacity: !horarioOk ? 0.5 : 1, cursor: !horarioOk ? 'not-allowed' : 'pointer' }}
            >
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : saved ? 'fa-check' : 'fa-floppy-disk'} aud-17`} />
                {saving ? t('auditor.config.savingBtn') : saved ? t('auditor.config.savedBtn') : t('auditor.config.saveBtn')}
            </button>
        </div>
    );
}

// ─── ResponseTimeCard ────────────────────────────────────────────────────────

function ResponseTimeCard({ cfg, setCfg }) {
    const { t } = useLanguage();
    const update = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));
    const horasPico  = cfg.horasPico || [];
    const hayPico    = horasPico.length > 0;

    const updateRango = (i, campo, valor) => {
        const nuevos = horasPico.map((r, idx) => idx === i ? { ...r, [campo]: valor } : r);
        update('horasPico', nuevos);
    };

    const removeRango = (i) => update('horasPico', horasPico.filter((_, idx) => idx !== i));

    const addRango = () => {
        if (horasPico.length >= 4) return;
        update('horasPico', [...horasPico, { inicio: '08:00', fin: '09:00' }]);
    };

    return (
        <div className="db-card aud-182">
            <div className="db-card-title aud-156">
                <i className="fa-solid fa-stopwatch aud-41" />
                {t('auditor.x.respTitle')}
            </div>
            <div className="aud-183">
                {t('auditor.x.respDesc')}
            </div>

            {/* Umbral normal */}
            <Field
                label={t('auditor.x.slowFrom')}
                hint={t('auditor.x.slowHint')}
            >
                <div className="aud-186">
                    <input
                        type="number" min="1" max="240"
                        value={cfg.respuestaMaxMinutos}
                        onChange={e => update('respuestaMaxMinutos', Math.max(1, Math.min(240, Number(e.target.value) || 30)))}
                        style={{ ...inputStyle, width: 76, textAlign: 'center' }}
                    />
                    <span className="aud-187">{t('auditor.x.minutes')}</span>
                </div>
            </Field>

            {/* Toggle horarios pico */}
            <div className="aud-188">
                <div>
                    <div className="db-metric-label">{t('auditor.x.peakTitle')}</div>
                    <div className="aud-189">
                        {t('auditor.x.peakDesc')}
                    </div>
                </div>
                <label className="aud-190">
                    <input className="aud-178"
                        type="checkbox"
                        checked={hayPico}
                        onChange={e => update('horasPico', e.target.checked
                            ? [{ inicio: '11:00', fin: '12:30' }, { inicio: '17:00', fin: '18:15' }]
                            : []
                        )}
                    />
                    <span className="aud-179" style={{ background: hayPico ? '#a78bfa' : 'rgba(255,255,255,0.15)' }}>
                        <span className="aud-180" style={{ left: hayPico ? 23 : 3 }} />
                    </span>
                </label>
            </div>

            {hayPico && (
                <>
                    <Field
                        label={t('auditor.x.peakTolerance')}
                        hint={t('auditor.x.peakHint')}
                    >
                        <div className="aud-186">
                            <input
                                type="number" min="1" max="120"
                                value={cfg.respuestaPicoMaxMinutos}
                                onChange={e => update('respuestaPicoMaxMinutos', Math.max(1, Math.min(120, Number(e.target.value) || 15)))}
                                style={{ ...inputStyle, width: 76, textAlign: 'center' }}
                            />
                            <span className="aud-187">{t('auditor.x.minutes')}</span>
                        </div>
                    </Field>

                    <div>
                        <div className="db-metric-label aud-191">{t('auditor.x.peakRanges')}</div>
                        <div className="aud-192">
                            {horasPico.map((r, i) => (
                                <div className="aud-186" key={i}>
                                    <input
                                        aria-label={`Rango pico ${i + 1}: desde`}
                                        type="time" value={r.inicio}
                                        onChange={e => updateRango(i, 'inicio', e.target.value)}
                                        style={{ ...inputStyle, flex: 1, padding: '6px 10px' }}
                                    />
                                    <span className="aud-193">→</span>
                                    <input
                                        aria-label={`Rango pico ${i + 1}: hasta`}
                                        type="time" value={r.fin}
                                        onChange={e => updateRango(i, 'fin', e.target.value)}
                                        style={{ ...inputStyle, flex: 1, padding: '6px 10px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeRango(i)}
                                        style={{ ...miniBtn(false), color: '#fca5a5', padding: '6px 9px' }}
                                        title={t('auditor.x.removeRange')}
                                    >
                                        <i className="fa-solid fa-xmark aud-194" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {horasPico.length < 4 && (
                            <button className="aud-195"
                                type="button"
                                onClick={addRango}
                            >
                                <i className="fa-solid fa-plus aud-17" />
                                {t('auditor.x.addPeak')}
                            </button>
                        )}
                    </div>

                    <div className="aud-196">
                        <i className="fa-solid fa-circle-info aud-197" />
                        {t('auditor.x.outsideA')} <strong className="aud-198">{t('auditor.x.outsideB')}</strong> {t('auditor.x.outsideC')}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── TimeRangePicker ─────────────────────────────────────────────────────────

function TimeRangePicker({ inicio, fin, onChange, baseInput, t }) {
    const presets = [
        { label: t('auditor.config.presets.morning'),   inicio: '08:00', fin: '13:00' },
        { label: t('auditor.config.presets.afternoon'), inicio: '14:00', fin: '18:00' },
        { label: t('auditor.config.presets.allDay'),    inicio: '09:00', fin: '18:00' },
        { label: t('auditor.config.presets.all24'),     inicio: '00:00', fin: '23:59' },
    ];
    const activePreset = presets.findIndex(p => p.inicio === inicio && p.fin === fin);

    return (
        <div className="aud-38">
            <div className="aud-199">
                <input
                    aria-label={t('dashboard.picker.from')}
                    type="time"
                    value={inicio}
                    onChange={e => onChange(e.target.value, fin)}
                    style={{ ...baseInput, flex: 1 }}
                />
                <span className="aud-193">→</span>
                <input
                    aria-label={t('dashboard.picker.to')}
                    type="time"
                    value={fin}
                    onChange={e => onChange(inicio, e.target.value)}
                    style={{ ...baseInput, flex: 1 }}
                />
            </div>
            <div className="aud-200">
                {presets.map((p, i) => {
                    const active = i === activePreset;
                    return (
                        <button className="aud-217"
                            key={p.label}
                            type="button"
                            onClick={() => onChange(p.inicio, p.fin)}
                            style={{ borderRadius: '16px', border: `1px solid ${active ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.10)'}`, background: active ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.03)', color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)' }}
                        >
                            {p.label}
                            <span className="aud-202">{p.inicio}–{p.fin}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
    // <label> como contenedor: asocia el texto con el primer control de adentro
    return (
        <label className="aud-203">
            <div className="db-metric-label aud-204">
                {label}
                {hint && (
                    <i className="fa-regular fa-circle-question aud-205"
                       title={hint} />
                )}
            </div>
            {children}
        </label>
    );
}

// ─── Estilos compartidos ─────────────────────────────────────────────────────

const inputStyle = {
    width: '100%', fontSize: '0.85rem', padding: '8px 11px',
    background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8, color: '#fff', outline: 'none', boxSizing: 'border-box',
};

const btnGhost = {
    padding: '7px 14px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)',
    cursor: 'pointer', fontSize: '0.82rem',
};
