import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Hook simple para detectar viewport mobile (< 768px). Listener de resize
// con cleanup; suficiente para decisiones de layout en este módulo.
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

const SEV_COLOR = { alta: '#ef4444', media: '#f59e0b', baja: '#94a3b8' };
const SEV_BG    = { alta: 'rgba(239,68,68,0.10)', media: 'rgba(245,158,11,0.10)', baja: 'rgba(148,163,184,0.08)' };

// Esquema visual por estado de cumplimiento. El label se resuelve por i18n en
// tiempo de render (t('auditor.states.<estado>')), no se hardcodea acá.
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
            return { resumen_ejecutivo: '', procedimientos: [], hallazgos: parsed };
        }
        return {
            resumen_ejecutivo: parsed.resumen_ejecutivo || '',
            procedimientos: Array.isArray(parsed.procedimientos) ? parsed.procedimientos : [],
            hallazgos: Array.isArray(parsed.hallazgos) ? parsed.hallazgos : [],
        };
    } catch {
        return { resumen_ejecutivo: '', procedimientos: [], hallazgos: [] };
    }
}

// Modal genérico (overlay oscuro + card central)
function Modal({ children, onClose }) {
    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease-out', padding: 20,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#111118', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 14, maxWidth: 460, width: '100%', padding: 22,
                animation: 'slideUp 0.18s ease-out',
            }}>
                {children}
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

    // Tab actual: reportes | config
    const [tab, setTab] = useState('reportes');

    const [reports, setReports]           = useState([]);
    const [selected, setSelected]         = useState(null);
    const [loadingList, setLoadingList]   = useState(true);
    const [runLoading, setRunLoading]     = useState(false);
    const [runError, setRunError]         = useState('');
    const [hideFP, setHideFP]             = useState(true);
    // Estado por reporte: qué puntos de procedimiento están expandidos
    const [expandedProcs, setExpandedProcs] = useState({});
    // Estado por reporte: qué fila del historial está expandida inline
    const [rowExpanded, setRowExpanded] = useState({});

    // Edición inline de nombre/notas + confirmación de eliminación
    const [editingMeta, setEditingMeta] = useState(null);   // { id, nombre, notas } o null
    const [deleting, setDeleting]       = useState(null);   // reporte a eliminar o null

    // Estado de configuración del auditor (movido desde AgenteIA.jsx)
    const [cfg, setCfg] = useState({
        auditEnabled: false, auditProcedures: '', auditEmail: '',
        auditWhatsappPhone: '', auditDispositivoId: '',
        horarioInicio: '09:00', horarioFin: '18:00',
    });
    const [dispositivos, setDispositivos]   = useState([]);
    const [cfgSaving, setCfgSaving]         = useState(false);
    const [cfgSaved, setCfgSaved]           = useState(false);

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

    // Carga inicial: reportes + config + dispositivos (fetch-on-mount con setState es legítimo).
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isEnterprise || userLoading) return;
        loadReports();
        api.get('/agent-config/audit').then(res => {
            const d = res.data || {};
            setCfg({
                auditEnabled: d.auditEnabled || false,
                auditProcedures: d.auditProcedures || '',
                auditEmail: d.auditEmail || '',
                auditWhatsappPhone: d.auditWhatsappPhone || '',
                auditDispositivoId: d.auditDispositivoId ? String(d.auditDispositivoId) : '',
                horarioInicio: d.horarioInicio || '09:00',
                horarioFin: d.horarioFin || '18:00',
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

            // Feedback visual diferenciado según qué se haya enviado
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

    // Persistir orden manual del historial cuando el usuario mueve filas
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
            await api.put('/agent-config/audit', {
                ...cfg,
                auditDispositivoId: cfg.auditDispositivoId ? Number(cfg.auditDispositivoId) : null,
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

    // Al cambiar de reporte: expandimos por defecto los puntos no cumplidos.
    // Sólo nos interesa cuando cambia el id del reporte y su payload, no la referencia entera.
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
            <div className="db-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.loading')}</span>
            </div>
        );
    }
    if (!isEnterprise) return <Navigate to="/planes" replace />;

    const { resumen_ejecutivo, procedimientos, hallazgos } = payload;
    const visibles = hideFP ? hallazgos.filter(h => !h.false_positive) : hallazgos;
    const fpCount  = hallazgos.filter(h => h.false_positive).length;

    // Contadores agregados por estado para el header de la sección procedimientos
    const counts = procedimientos.reduce((acc, p) => {
        acc[p.estado] = (acc[p.estado] || 0) + 1;
        return acc;
    }, { cumplido: 0, parcial: 0, incumplido: 0 });

    return (
        <div className="db-root" style={{ '--db-accent': '#a78bfa', height: '100%', overflow: 'hidden' }}>

            {/* Topbar con tabs */}
            <div className="db-topbar" style={{ flexShrink: 0, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
                    <div>
                        <div className="db-greeting" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.45rem)' }}>
                            <i className="fa-solid fa-magnifying-glass-chart"
                               style={{ marginRight: 10, color: '#a78bfa' }} />
                            {t('auditor.title')}
                        </div>
                        <div className="db-subtitle">
                            {tab === 'reportes'
                                ? t('auditor.subtitleReports')
                                : t('auditor.subtitleConfig')}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <TabButton active={tab === 'reportes'} onClick={() => setTab('reportes')}
                                   icon="fa-list-ul" label={t('auditor.tabs.reports')} count={reports.length} />
                        <TabButton active={tab === 'config'} onClick={() => setTab('config')}
                                   icon="fa-gear" label={t('auditor.tabs.config')} />
                    </div>
                </div>
                {tab === 'reportes' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {runError && (
                            <span style={{ fontSize: '0.78rem', color: '#ef4444', maxWidth: 240 }}>{runError}</span>
                        )}
                        <button
                            onClick={runAudit}
                            disabled={runLoading || !cfg.auditEnabled || !cfg.auditProcedures.trim()}
                            title={!cfg.auditEnabled || !cfg.auditProcedures.trim() ? t('auditor.runDisabledTip') : ''}
                            className="btn-primary"
                            style={{
                                background: 'rgba(167,139,250,0.85)', color: '#fff', whiteSpace: 'nowrap',
                                opacity: (!cfg.auditEnabled || !cfg.auditProcedures.trim()) ? 0.5 : 1,
                                cursor: (!cfg.auditEnabled || !cfg.auditProcedures.trim()) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <i className={`fa-solid ${runLoading ? 'fa-spinner fa-spin' : 'fa-microscope'}`}
                               style={{ marginRight: 6 }} />
                            {runLoading ? t('auditor.analyzing') : t('auditor.runNow')}
                        </button>
                    </div>
                )}
            </div>

            {/* Tab Reportes */}
            {tab === 'reportes' && (
                <div style={{
                    display: 'flex', gap: 14, flex: 1, overflow: 'hidden', minHeight: 0,
                    // En mobile apilamos vertical y mostramos lista o detalle, no ambos
                    flexDirection: isMobile ? 'column' : 'row',
                }}>

                {/* LEFT: lista de reportes con acciones (oculta en mobile cuando hay detalle abierto) */}
                <div style={{
                    width: isMobile ? '100%' : 320,
                    flexShrink: 0, overflowY: 'auto', display: (isMobile && selected) ? 'none' : 'flex',
                    flexDirection: 'column', gap: 8,
                }}>
                    {loadingList ? (
                        <ReportListSkeleton />
                    ) : reports.length === 0 ? (
                        <div style={{
                            color: 'rgba(255,255,255,0.30)', fontSize: '0.82rem',
                            padding: '20px 12px', textAlign: 'center', lineHeight: 1.7,
                        }}>
                            <i className="fa-solid fa-folder-open"
                               style={{ fontSize: '1.8rem', marginBottom: 8, display: 'block', opacity: 0.4 }} />
                            {t('auditor.emptyState')}<br />
                            {t('auditor.emptyStateHint')} <strong>&quot;{t('auditor.runNow')}&quot;</strong>.
                        </div>
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

                {/* RIGHT: detalle del reporte seleccionado (oculto en mobile sin selección) */}
                <div style={{
                    flex: 1, overflowY: 'auto', minWidth: 0,
                    display: (isMobile && !selected) ? 'none' : 'block',
                }}>
                    {!selected ? (
                        <div style={{
                            height: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexDirection: 'column', gap: 12,
                            color: 'rgba(255,255,255,0.25)',
                        }}>
                            <i className="fa-solid fa-arrow-pointer"
                               style={{ fontSize: '2rem', opacity: 0.3 }} />
                            <span style={{ fontSize: '0.88rem' }}>
                                {t('auditor.selectReport')}
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Botón volver en mobile */}
                            {isMobile && (
                                <button
                                    onClick={() => setSelected(null)}
                                    style={{
                                        alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                                    {t('auditor.backToHistory')}
                                </button>
                            )}
                            {/* Resumen */}
                            <div className="db-card" style={{ gap: 12 }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'flex-start', flexWrap: 'wrap', gap: 10,
                                }}>
                                    <div>
                                        <div className="db-card-title" style={{ margin: 0 }}>
                                            <i className="fa-solid fa-file-contract"
                                               style={{ color: '#a78bfa' }} />
                                            {selected.nombre || `${t('auditor.tabs.reports')} — ${fmtDate(selected.createdAt)}`}
                                        </div>
                                        <div style={{
                                            fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)',
                                            marginTop: 4,
                                        }}>
                                            {t('auditor.period')}: {fmtPeriod(selected.periodoInicio, selected.periodoFin)}
                                            {selected.nombre && (
                                                <span style={{ marginLeft: 10, color: 'rgba(255,255,255,0.30)' }}>
                                                    · {fmtDate(selected.createdAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {fpCount > 0 && (
                                            <button
                                                onClick={() => setHideFP(v => !v)}
                                                style={{
                                                    fontSize: '0.73rem', padding: '4px 10px',
                                                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
                                                    background: hideFP ? 'rgba(255,255,255,0.05)' : 'rgba(167,139,250,0.12)',
                                                    color: hideFP ? 'rgba(255,255,255,0.45)' : '#c4b5fd',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <i className="fa-solid fa-eye-slash"
                                                   style={{ marginRight: 4 }} />
                                                {hideFP
                                                    ? `${t('auditor.showFP')} ${fpCount} ${fpCount > 1 ? t('auditor.falsePositives') : t('auditor.falsePositive')}`
                                                    : t('auditor.hideFP')}
                                            </button>
                                        )}
                                        <div style={{
                                            fontSize: '0.78rem', fontWeight: 700, padding: '4px 12px',
                                            borderRadius: 8,
                                            background: selected.incumplimientos === 0
                                                ? 'rgba(16,185,129,0.12)'
                                                : selected.incumplimientos <= 3
                                                    ? 'rgba(245,158,11,0.12)'
                                                    : 'rgba(239,68,68,0.12)',
                                            color: selected.incumplimientos === 0 ? '#10b981'
                                                : selected.incumplimientos <= 3 ? '#f59e0b' : '#ef4444',
                                            border: `1px solid ${selected.incumplimientos === 0
                                                ? 'rgba(16,185,129,0.25)'
                                                : selected.incumplimientos <= 3
                                                    ? 'rgba(245,158,11,0.25)'
                                                    : 'rgba(239,68,68,0.25)'}`,
                                        }}>
                                            {selected.incumplimientos === 0
                                                ? t('auditor.noIncidentsShort')
                                                : `${selected.incumplimientos} ${selected.incumplimientos > 1 ? t('auditor.incidents') : t('auditor.incident')}`}
                                        </div>
                                    </div>
                                </div>

                                {/* Resumen ejecutivo: prioriza el campo extendido (2-3 párrafos) */}
                                {(resumen_ejecutivo || selected.resumen) && (
                                    <div style={{
                                        padding: '14px 18px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        fontSize: '0.87rem', color: 'rgba(255,255,255,0.78)',
                                        lineHeight: 1.7, whiteSpace: 'pre-wrap',
                                    }}>
                                        <div style={{
                                            fontSize: '0.70rem', color: 'rgba(255,255,255,0.45)',
                                            textTransform: 'uppercase', letterSpacing: '0.08em',
                                            marginBottom: 8,
                                        }}>
                                            <i className="fa-solid fa-clipboard-list"
                                               style={{ marginRight: 6, color: '#a78bfa' }} />
                                            {t('auditor.executiveSummary')}
                                        </div>
                                        {resumen_ejecutivo || selected.resumen}
                                    </div>
                                )}

                                {selected.notas && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: 8,
                                        background: 'rgba(245,158,11,0.06)',
                                        border: '1px solid rgba(245,158,11,0.18)',
                                        fontSize: '0.82rem', color: 'rgba(255,255,255,0.72)',
                                        lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                    }}>
                                        <div style={{
                                            fontSize: '0.68rem', color: '#fbbf24',
                                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
                                        }}>
                                            <i className="fa-regular fa-note-sticky" style={{ marginRight: 5 }} />
                                            {t('auditor.notes')}
                                        </div>
                                        {selected.notas}
                                    </div>
                                )}

                                <div style={{
                                    fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)',
                                    textAlign: 'right',
                                }}>
                                    {t('auditor.tokensUsed')}: {selected.tokensUsados?.toLocaleString('es-AR')}
                                </div>
                            </div>

                            {/* Procedimientos auditados (punto por punto) */}
                            {procedimientos.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0 4px',
                                    }}>
                                        <div style={{
                                            fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)',
                                            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                                        }}>
                                            <i className="fa-solid fa-list-check"
                                               style={{ marginRight: 6, color: '#a78bfa' }} />
                                            {t('auditor.procedures')} ({procedimientos.length})
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, fontSize: '0.72rem' }}>
                                            {counts.cumplido > 0 && (
                                                <span style={{ color: '#10b981' }}>
                                                    <i className="fa-solid fa-circle-check" /> {counts.cumplido}
                                                </span>
                                            )}
                                            {counts.parcial > 0 && (
                                                <span style={{ color: '#f59e0b' }}>
                                                    <i className="fa-solid fa-circle-exclamation" /> {counts.parcial}
                                                </span>
                                            )}
                                            {counts.incumplido > 0 && (
                                                <span style={{ color: '#ef4444' }}>
                                                    <i className="fa-solid fa-circle-xmark" /> {counts.incumplido}
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
                                                className="db-card"
                                                style={{
                                                    gap: 8, padding: 0, overflow: 'hidden',
                                                    borderLeft: `3px solid ${meta.color}`,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedProcs(prev => ({ ...prev, [i]: !prev[i] }))}
                                                    style={{
                                                        all: 'unset', cursor: 'pointer',
                                                        padding: '12px 16px', display: 'flex',
                                                        justifyContent: 'space-between', alignItems: 'center',
                                                        gap: 10,
                                                    }}
                                                >
                                                    <div style={{
                                                        fontSize: '0.90rem', fontWeight: 700,
                                                        color: 'rgba(255,255,255,0.88)', flex: 1,
                                                        lineHeight: 1.4,
                                                    }}>
                                                        {p.punto || `${t('auditor.procedures')} ${i + 1}`}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                                        <span style={{
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                            padding: '3px 10px', borderRadius: 6,
                                                            background: meta.bg, color: meta.color,
                                                            border: `1px solid ${meta.border}`,
                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                        }}>
                                                            <i className={`fa-solid ${meta.icon}`} />
                                                            {t(`auditor.states.${p.estado}`)}
                                                        </span>
                                                        {evidencias.length > 0 && (
                                                            <span style={{
                                                                fontSize: '0.70rem', color: 'rgba(255,255,255,0.45)',
                                                            }}>
                                                                {evidencias.length} {evidencias.length > 1 ? t('auditor.evidences') : t('auditor.evidence')}
                                                            </span>
                                                        )}
                                                        <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                                                           style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }} />
                                                    </div>
                                                </button>

                                                {isOpen && (
                                                    <div style={{
                                                        padding: '0 16px 14px 16px',
                                                        display: 'flex', flexDirection: 'column', gap: 10,
                                                        animation: 'fadeIn 0.18s ease-out',
                                                    }}>
                                                        {p.justificacion && (
                                                            <div style={{
                                                                fontSize: '0.83rem', color: 'rgba(255,255,255,0.62)',
                                                                lineHeight: 1.6, padding: '8px 12px',
                                                                background: 'rgba(255,255,255,0.02)',
                                                                borderRadius: 6,
                                                                borderLeft: `2px solid ${meta.border}`,
                                                            }}>
                                                                {p.justificacion}
                                                            </div>
                                                        )}

                                                        {evidencias.length === 0 ? (
                                                            <div style={{
                                                                fontSize: '0.76rem', color: 'rgba(255,255,255,0.3)',
                                                                fontStyle: 'italic', textAlign: 'center', padding: 6,
                                                            }}>
                                                                {t('auditor.noEvidences')}
                                                            </div>
                                                        ) : evidencias.map((ev, j) => (
                                                            <div key={j} style={{
                                                                padding: '10px 12px', borderRadius: 8,
                                                                background: 'rgba(0,0,0,0.20)',
                                                                border: '1px solid rgba(255,255,255,0.05)',
                                                                display: 'flex', flexDirection: 'column', gap: 6,
                                                            }}>
                                                                <div style={{
                                                                    display: 'flex', justifyContent: 'space-between',
                                                                    alignItems: 'center', flexWrap: 'wrap', gap: 6,
                                                                    fontSize: '0.77rem',
                                                                }}>
                                                                    <span style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                    }}>
                                                                        <i className="fa-solid fa-user"
                                                                           style={{ color: '#a78bfa' }} />
                                                                        <strong style={{ color: '#c4b5fd' }}>
                                                                            {ev.vendedor || t('auditor.vendorUnknown')}
                                                                        </strong>
                                                                        {ev.cliente_id && (
                                                                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                                                · {t('auditor.client')} #{ev.cliente_id}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    {ev.cuando && (
                                                                        <span style={{
                                                                            color: 'rgba(255,255,255,0.45)',
                                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                        }}>
                                                                            <i className="fa-regular fa-clock" />
                                                                            {ev.cuando}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {ev.como && (
                                                                    <div style={{
                                                                        fontSize: '0.80rem', color: 'rgba(255,255,255,0.58)',
                                                                        lineHeight: 1.55,
                                                                    }}>
                                                                        <span style={{
                                                                            color: 'rgba(255,255,255,0.35)',
                                                                            fontSize: '0.72rem', marginRight: 6,
                                                                            textTransform: 'uppercase', letterSpacing: '0.06em',
                                                                        }}>
                                                                            {t('auditor.how')}:
                                                                        </span>
                                                                        {ev.como}
                                                                    </div>
                                                                )}

                                                                {ev.cita_textual && (
                                                                    <blockquote style={{
                                                                        margin: 0, padding: '8px 12px',
                                                                        background: 'rgba(0,0,0,0.30)',
                                                                        borderLeft: `3px solid ${meta.color}80`,
                                                                        borderRadius: '0 6px 6px 0',
                                                                        fontSize: '0.80rem', fontStyle: 'italic',
                                                                        color: 'rgba(255,255,255,0.70)', lineHeight: 1.55,
                                                                    }}>
                                                                        &quot;{ev.cita_textual}&quot;
                                                                    </blockquote>
                                                                )}

                                                                {(ev.esperado || ev.ocurrido) && (
                                                                    <div style={{
                                                                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                                                                        gap: 8, marginTop: 2,
                                                                    }}>
                                                                        <div style={{
                                                                            padding: '6px 10px', borderRadius: 6,
                                                                            background: 'rgba(16,185,129,0.06)',
                                                                            border: '1px solid rgba(16,185,129,0.15)',
                                                                            fontSize: '0.74rem', lineHeight: 1.5,
                                                                        }}>
                                                                            <div style={{
                                                                                color: '#34d399', fontWeight: 700,
                                                                                marginBottom: 3, fontSize: '0.68rem',
                                                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                                            }}>
                                                                                {t('auditor.expected')}
                                                                            </div>
                                                                            <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                                                {ev.esperado || '—'}
                                                                            </div>
                                                                        </div>
                                                                        <div style={{
                                                                            padding: '6px 10px', borderRadius: 6,
                                                                            background: 'rgba(239,68,68,0.06)',
                                                                            border: '1px solid rgba(239,68,68,0.15)',
                                                                            fontSize: '0.74rem', lineHeight: 1.5,
                                                                        }}>
                                                                            <div style={{
                                                                                color: '#f87171', fontWeight: 700,
                                                                                marginBottom: 3, fontSize: '0.68rem',
                                                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                                                            }}>
                                                                                {t('auditor.actual')}
                                                                            </div>
                                                                            <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                                                {ev.ocurrido || '—'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Hallazgos individuales */}
                            {hallazgos.length > 0 && (
                                <>
                                    <div style={{
                                        fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)',
                                        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                                        padding: '0 4px', marginTop: 6,
                                    }}>
                                        <i className="fa-solid fa-triangle-exclamation"
                                           style={{ marginRight: 6, color: '#f59e0b' }} />
                                        {t('auditor.findings')} ({visibles.length})
                                    </div>

                                    {visibles.length === 0 && hallazgos.length > 0 && (
                                        <div style={{
                                            textAlign: 'center', padding: '20px',
                                            color: 'rgba(255,255,255,0.30)', fontSize: '0.85rem',
                                        }}>
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
                                                className="db-card"
                                                style={{
                                                    gap: 10, opacity: isFP ? 0.5 : 1,
                                                    borderLeft: `3px solid ${SEV_COLOR[sev] || '#475569'}`,
                                                    paddingLeft: 16,
                                                }}
                                            >
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    alignItems: 'flex-start', gap: 8,
                                                }}>
                                                    <div style={{
                                                        fontSize: '0.90rem', fontWeight: 700,
                                                        color: 'rgba(255,255,255,0.88)', flex: 1,
                                                    }}>
                                                        {h.regla_violada || t('auditor.states.incumplido')}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                                                            borderRadius: 6, background: SEV_BG[sev] || SEV_BG.baja,
                                                            color: SEV_COLOR[sev] || SEV_COLOR.baja,
                                                            border: `1px solid ${(SEV_COLOR[sev] || SEV_COLOR.baja)}40`,
                                                            textTransform: 'uppercase', letterSpacing: '0.05em',
                                                        }}>
                                                            {sev}
                                                        </span>
                                                        {h.tipo === 'advertencia' && (
                                                            <span style={{
                                                                fontSize: '0.68rem', padding: '2px 8px',
                                                                borderRadius: 6, background: 'rgba(99,102,241,0.12)',
                                                                color: '#818cf8',
                                                                border: '1px solid rgba(99,102,241,0.25)',
                                                            }}>
                                                                {t('auditor.warning')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {h.descripcion && (
                                                    <div style={{
                                                        fontSize: '0.83rem', color: 'rgba(255,255,255,0.58)',
                                                        lineHeight: 1.6,
                                                    }}>
                                                        {h.descripcion}
                                                    </div>
                                                )}

                                                {h.cita_textual && (
                                                    <blockquote style={{
                                                        margin: 0, padding: '10px 14px',
                                                        background: 'rgba(0,0,0,0.30)',
                                                        borderLeft: '3px solid rgba(167,139,250,0.45)',
                                                        borderRadius: '0 8px 8px 0',
                                                        fontSize: '0.82rem', fontStyle: 'italic',
                                                        color: 'rgba(255,255,255,0.65)', lineHeight: 1.6,
                                                    }}>
                                                        &quot;{h.cita_textual}&quot;
                                                    </blockquote>
                                                )}

                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    alignItems: 'center', flexWrap: 'wrap', gap: 8,
                                                }}>
                                                    <div style={{
                                                        fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)',
                                                    }}>
                                                        {h.vendedor && (
                                                            <span>
                                                                <i className="fa-solid fa-user"
                                                                   style={{ marginRight: 4, color: '#a78bfa' }} />
                                                                <strong style={{ color: '#c4b5fd' }}>{h.vendedor}</strong>
                                                            </span>
                                                        )}
                                                        {h.cuando && <span style={{ marginLeft: 10 }}>
                                                            <i className="fa-regular fa-clock" style={{ marginRight: 4 }} />
                                                            {h.cuando}
                                                        </span>}
                                                        {h.confianza && <span style={{ marginLeft: 10 }}>{t('auditor.confidence')}: {h.confianza}</span>}
                                                        {h.cliente_id && <span style={{ marginLeft: 10 }}>{t('auditor.client')} ID: {h.cliente_id}</span>}
                                                    </div>
                                                    <button
                                                        onClick={() => toggleFP(selected.id, realIdx)}
                                                        style={{
                                                            fontSize: '0.72rem', padding: '3px 10px',
                                                            borderRadius: 7,
                                                            border: isFP
                                                                ? '1px solid rgba(167,139,250,0.40)'
                                                                : '1px solid rgba(255,255,255,0.12)',
                                                            background: isFP
                                                                ? 'rgba(167,139,250,0.12)'
                                                                : 'rgba(255,255,255,0.04)',
                                                            color: isFP ? '#c4b5fd' : 'rgba(255,255,255,0.38)',
                                                            cursor: 'pointer', transition: '0.15s',
                                                        }}
                                                    >
                                                        <i className={`fa-solid ${isFP ? 'fa-rotate-left' : 'fa-ban'}`}
                                                           style={{ marginRight: 4 }} />
                                                        {isFP ? t('auditor.restore') : t('auditor.markFP')}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {procedimientos.length === 0 && hallazgos.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '32px',
                                    color: '#10b981', fontSize: '0.92rem',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', gap: 10,
                                }}>
                                    <i className="fa-solid fa-circle-check"
                                       style={{ fontSize: '2rem', opacity: 0.7 }} />
                                    {t('auditor.noIncidents')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                </div>
            )}

            {/* Tab Configuración */}
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
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                        {t('auditor.modal.editTitle')}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>
                        {t('auditor.modal.editSubtitle')}
                    </div>

                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {t('auditor.modal.name')}
                    </label>
                    <input
                        type="text"
                        value={editingMeta.nombre}
                        onChange={e => setEditingMeta(m => ({ ...m, nombre: e.target.value }))}
                        placeholder={t('auditor.modal.namePlaceholder')}
                        style={inputStyle}
                    />

                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', margin: '14px 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {t('auditor.modal.notes')}
                    </label>
                    <textarea
                        value={editingMeta.notas}
                        onChange={e => setEditingMeta(m => ({ ...m, notas: e.target.value }))}
                        placeholder={t('auditor.modal.notesPlaceholder')}
                        style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                        <button onClick={() => setEditingMeta(null)} style={btnGhost}>{t('auditor.modal.cancel')}</button>
                        <button onClick={saveMeta} className="btn-primary" style={{ background: 'rgba(167,139,250,0.85)' }}>
                            <i className="fa-solid fa-floppy-disk" style={{ marginRight: 5 }} />
                            {t('auditor.modal.save')}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Modal confirmación eliminación */}
            {deleting && (
                <Modal onClose={() => setDeleting(null)}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                        <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444', marginRight: 6 }} />
                        {t('auditor.modal.deleteTitle')}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                        {t('auditor.modal.deleteConfirm')}
                        {deleting.nombre ? <strong style={{ color: '#fff' }}> &quot;{deleting.nombre}&quot;</strong> : <span> {fmtDate(deleting.createdAt)}</span>}?
                        {' '}{t('auditor.modal.deleteIrreversible')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                        <button onClick={() => setDeleting(null)} style={btnGhost}>{t('auditor.modal.cancel')}</button>
                        <button onClick={confirmDelete} style={{
                            ...btnGhost, background: 'rgba(239,68,68,0.18)',
                            border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5',
                        }}>
                            <i className="fa-solid fa-trash" style={{ marginRight: 5 }} />
                            {t('auditor.row.delete')}
                        </button>
                    </div>
                </Modal>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label, count }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '7px 14px', borderRadius: '8px 8px 0 0',
                border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                background: active ? 'rgba(167,139,250,0.14)' : 'transparent',
                color: active ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
                borderBottom: active ? '2px solid #a78bfa' : '2px solid transparent',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                transition: '0.15s',
            }}
        >
            <i className={`fa-solid ${icon}`} />
            {label}
            {typeof count === 'number' && (
                <span style={{
                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

// Fila del historial: card con metadata, acciones en hover y expansión inline
function ReportRow({ r, idx, total, selected, expanded, onSelect, onToggleExpand, onEdit, onDelete, onMoveUp, onMoveDown, t }) {
    const color = r.incumplimientos === 0 ? '#10b981'
        : r.incumplimientos <= 3 ? '#f59e0b' : '#ef4444';

    return (
        <div
            style={{
                padding: '10px 12px', borderRadius: 10,
                background: selected ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.07)'}`,
                transition: '0.15s', display: 'flex', flexDirection: 'column', gap: 6,
            }}
        >
            <button
                type="button"
                onClick={onSelect}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                        {r.nombre || fmtDate(r.createdAt)}
                    </span>
                    <span style={{
                        fontSize: '0.70rem', fontWeight: 700, padding: '1px 7px',
                        borderRadius: 8, background: color + '1a', color,
                        border: `1px solid ${color}40`,
                    }}>
                        {r.incumplimientos === 0 ? 'OK' : r.incumplimientos + ' ⚠'}
                    </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.40)' }}>
                    {r.nombre ? fmtDate(r.createdAt) : fmtPeriod(r.periodoInicio, r.periodoFin)}
                </div>
            </button>

            {/* Acciones de fila */}
            <div style={{
                display: 'flex', gap: 4, justifyContent: 'space-between',
                borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6,
            }}>
                <div style={{ display: 'flex', gap: 3 }}>
                    <IconButton onClick={onMoveUp} disabled={idx === 0} icon="fa-arrow-up" title={t('auditor.row.moveUp')} />
                    <IconButton onClick={onMoveDown} disabled={idx === total - 1} icon="fa-arrow-down" title={t('auditor.row.moveDown')} />
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                    <IconButton onClick={onToggleExpand} icon={expanded ? 'fa-chevron-up' : 'fa-chevron-down'}
                                title={expanded ? t('auditor.row.collapse') : t('auditor.row.expand')} />
                    <IconButton onClick={onEdit} icon="fa-pen" title={t('auditor.row.edit')} />
                    <IconButton onClick={onDelete} icon="fa-trash" title={t('auditor.row.delete')} danger />
                </div>
            </div>

            {/* Preview inline */}
            {expanded && (
                <div style={{
                    padding: '8px 10px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.18)',
                    fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1.55, animation: 'fadeIn 0.18s ease-out',
                    whiteSpace: 'pre-wrap',
                }}>
                    {r.resumen || t('auditor.row.noSummary')}
                    {r.notas && (
                        <div style={{
                            marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(255,255,255,0.08)',
                            color: '#fbbf24', fontSize: '0.72rem',
                        }}>
                            <i className="fa-regular fa-note-sticky" style={{ marginRight: 4 }} />
                            {r.notas}
                        </div>
                    )}
                </div>
            )}
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
                    : danger ? '#fca5a5' : 'rgba(255,255,255,0.55)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '0.72rem', transition: '0.12s',
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
            <i className={`fa-solid ${icon}`} />
        </button>
    );
}

// Skeleton mientras carga la lista de reportes
function ReportListSkeleton() {
    return (
        <>
            {[1, 2, 3, 4].map(k => (
                <div key={k} style={{
                    padding: 12, borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={skel(120, 10)} />
                        <div style={skel(40, 14)} />
                    </div>
                    <div style={skel(160, 9)} />
                </div>
            ))}
        </>
    );
}

function skel(w, h) {
    return {
        width: w, height: h, borderRadius: 4,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
    };
}

// Formulario de configuración (movido desde AgenteIA.jsx)
function ConfigForm({ cfg, setCfg, dispositivos, saving, saved, onSave, isMobile }) {
    const { t } = useLanguage();
    const update = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));

    // Validación: rango de horario coherente
    const horarioOk = !cfg.horarioInicio || !cfg.horarioFin || cfg.horarioInicio < cfg.horarioFin;

    // En mobile aumentamos el font-size y padding de los inputs para que sean cómodos al touch
    const baseInput = isMobile
        ? { ...inputStyle, fontSize: '1rem', padding: '12px 14px' }
        : inputStyle;

    return (
        <div style={{
            flex: 1, overflowY: 'auto', maxWidth: 780, width: '100%', margin: '0 auto',
            padding: isMobile ? '6px 0 32px' : '6px 4px 24px',
        }}>
            <div className="db-card" style={{ gap: 16 }}>
                <div className="db-card-title" style={{ margin: 0 }}>
                    <i className="fa-solid fa-magnifying-glass-chart" style={{ color: '#a78bfa' }} />
                    {t('auditor.config.cardTitle')}
                </div>

                {/* Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{
                        position: 'relative', display: 'inline-block',
                        width: 46, height: 26, cursor: 'pointer', flexShrink: 0,
                    }}>
                        <input
                            type="checkbox"
                            checked={cfg.auditEnabled}
                            onChange={e => update('auditEnabled', e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{
                            position: 'absolute', inset: 0, borderRadius: 13,
                            background: cfg.auditEnabled ? '#a78bfa' : 'rgba(255,255,255,0.15)',
                            transition: '0.2s',
                        }}>
                            <span style={{
                                position: 'absolute', top: 3, left: cfg.auditEnabled ? 23 : 3,
                                width: 20, height: 20, borderRadius: '50%',
                                background: '#fff', transition: '0.2s',
                            }} />
                        </span>
                    </label>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                            {t('auditor.config.enableLabel')}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>
                            {t('auditor.config.enableHint')}
                        </div>
                    </div>
                </div>

                <Field
                    label={t('auditor.config.proceduresLabel')}
                    hint={t('auditor.config.proceduresHint')}
                >
                    <textarea
                        value={cfg.auditProcedures}
                        onChange={e => update('auditProcedures', e.target.value)}
                        placeholder={t('auditor.config.proceduresPlaceholder')}
                        style={{ ...baseInput, minHeight: 130, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                </Field>

                <Field
                    label={t('auditor.config.scheduleLabel')}
                    hint={t('auditor.config.scheduleHint')}
                >
                    <TimeRangePicker
                        inicio={cfg.horarioInicio}
                        fin={cfg.horarioFin}
                        onChange={(ini, fin) => setCfg(prev => ({ ...prev, horarioInicio: ini, horarioFin: fin }))}
                        baseInput={baseInput}
                        t={t}
                    />
                    {!horarioOk && (
                        <div style={{
                            marginTop: 6, fontSize: '0.74rem', color: '#fca5a5',
                            display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <i className="fa-solid fa-triangle-exclamation" />
                            {t('auditor.config.scheduleError')}
                        </div>
                    )}
                </Field>

                <Field
                    label={t('auditor.config.emailLabel')}
                    hint={t('auditor.config.emailHint')}
                >
                    <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={cfg.auditEmail}
                        onChange={e => update('auditEmail', e.target.value)}
                        placeholder="gerente@empresa.com"
                        style={baseInput}
                    />
                </Field>

                <Field
                    label={t('auditor.config.whatsappLabel')}
                    hint={t('auditor.config.whatsappHint')}
                >
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

                <Field
                    label={t('auditor.config.deviceLabel')}
                    hint={t('auditor.config.deviceHint')}
                >
                    <select
                        value={cfg.auditDispositivoId}
                        onChange={e => update('auditDispositivoId', e.target.value)}
                        style={{ ...baseInput, color: cfg.auditDispositivoId ? '#fff' : 'rgba(255,255,255,0.35)' }}
                    >
                        <option value="">{t('auditor.config.deviceNone')}</option>
                        {dispositivos.map(d => (
                            <option key={d.id} value={String(d.id)}>
                                {d.alias || d.sessionId} {d.estado === 'CONNECTED' ? '●' : '○'}
                            </option>
                        ))}
                    </select>
                </Field>

                <button
                    onClick={onSave}
                    disabled={saving || !horarioOk}
                    className="btn-primary"
                    style={{
                        width: '100%', marginTop: 6,
                        background: saved ? '#10b981' : 'rgba(167,139,250,0.85)',
                        padding: isMobile ? '13px 0' : undefined,
                        fontSize: isMobile ? '0.95rem' : undefined,
                        opacity: !horarioOk ? 0.5 : 1,
                        cursor: !horarioOk ? 'not-allowed' : 'pointer',
                    }}
                >
                    <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : saved ? 'fa-check' : 'fa-floppy-disk'}`}
                       style={{ marginRight: 6 }} />
                    {saving ? t('auditor.config.savingBtn') : saved ? t('auditor.config.savedBtn') : t('auditor.config.saveBtn')}
                </button>
            </div>
        </div>
    );
}

// Time picker con presets rápidos. Cubre los rangos más usados (mañana, tarde,
// día completo, 24 hs). El usuario sigue pudiendo ajustar manualmente con los
// inputs nativos de tiempo.
function TimeRangePicker({ inicio, fin, onChange, baseInput, t }) {
    const presets = [
        { label: t('auditor.config.presets.morning'),   inicio: '08:00', fin: '13:00' },
        { label: t('auditor.config.presets.afternoon'), inicio: '14:00', fin: '18:00' },
        { label: t('auditor.config.presets.allDay'),    inicio: '09:00', fin: '18:00' },
        { label: t('auditor.config.presets.all24'),     inicio: '00:00', fin: '23:59' },
    ];
    const activePreset = presets.findIndex(p => p.inicio === inicio && p.fin === fin);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                    type="time"
                    value={inicio}
                    onChange={e => onChange(e.target.value, fin)}
                    style={{ ...baseInput, flex: 1 }}
                />
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>a</span>
                <input
                    type="time"
                    value={fin}
                    onChange={e => onChange(inicio, e.target.value)}
                    style={{ ...baseInput, flex: 1 }}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {presets.map((p, i) => {
                    const active = i === activePreset;
                    return (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => onChange(p.inicio, p.fin)}
                            style={{
                                padding: '5px 11px', borderRadius: 16,
                                border: `1px solid ${active ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.10)'}`,
                                background: active ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.03)',
                                color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
                                fontSize: '0.74rem', cursor: 'pointer', transition: '0.15s',
                            }}
                        >
                            {p.label} <span style={{ opacity: 0.55, marginLeft: 4 }}>{p.inicio}–{p.fin}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// Campo de formulario con label + hint tooltip
function Field({ label, hint, children }) {
    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6,
                fontSize: '0.74rem', color: 'rgba(255,255,255,0.62)',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
            }}>
                {label}
                {hint && (
                    <i className="fa-regular fa-circle-question"
                       title={hint}
                       style={{ color: 'rgba(255,255,255,0.30)', cursor: 'help' }} />
                )}
            </div>
            {children}
            {hint && (
                <div style={{
                    fontSize: '0.72rem', color: 'rgba(255,255,255,0.32)',
                    marginTop: 4, lineHeight: 1.5,
                }}>
                    {hint}
                </div>
            )}
        </div>
    );
}

// Estilos compartidos para inputs del formulario de config
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
