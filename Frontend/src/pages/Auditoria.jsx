import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import '../assets/css/dashboard.css';

const SEV_COLOR = { alta: '#ef4444', media: '#f59e0b', baja: '#94a3b8' };
const SEV_BG    = { alta: 'rgba(239,68,68,0.10)', media: 'rgba(245,158,11,0.10)', baja: 'rgba(148,163,184,0.08)' };

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

export default function Auditoria() {
    const { usuario, loading: userLoading } = useUser();
    const isEnterprise = usuario?.plan?.agenteIaHabilitado === true
        || usuario?.plan?.nombre === 'ENTERPRISE';

    const [reports, setReports]           = useState([]);
    const [selected, setSelected]         = useState(null);
    const [loadingList, setLoadingList]   = useState(true);
    const [runLoading, setRunLoading]     = useState(false);
    const [runError, setRunError]         = useState('');
    const [hideFP, setHideFP]             = useState(true);

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

    useEffect(() => {
        if (!isEnterprise || userLoading) return;
        loadReports();
    }, [isEnterprise, userLoading, loadReports]);

    const runAudit = async () => {
        setRunLoading(true);
        setRunError('');
        try {
            const res = await api.post('/audit/run-now');
            setReports(prev => [res.data, ...prev.filter(r => r.id !== res.data.id)]);
            setSelected(res.data);
        } catch (err) {
            setRunError(err?.response?.data?.error || 'Error al ejecutar la auditoría');
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

    if (userLoading || !usuario || !usuario.plan) {
        return (
            <div className="db-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Cargando...</span>
            </div>
        );
    }
    if (!isEnterprise) return <Navigate to="/planes" replace />;

    const hallazgos = (() => {
        if (!selected) return [];
        try { return JSON.parse(selected.hallazgosJson || '[]'); } catch { return []; }
    })();
    const visibles = hideFP ? hallazgos.filter(h => !h.false_positive) : hallazgos;
    const fpCount  = hallazgos.filter(h => h.false_positive).length;

    return (
        <div className="db-root" style={{ '--db-accent': '#a78bfa', height: '100%', overflow: 'hidden' }}>

            {/* Topbar */}
            <div className="db-topbar" style={{ flexShrink: 0 }}>
                <div>
                    <div className="db-greeting" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.45rem)' }}>
                        <i className="fa-solid fa-magnifying-glass-chart"
                           style={{ marginRight: 10, color: '#a78bfa' }} />
                        Auditoría IA
                    </div>
                    <div className="db-subtitle">
                        Historial de reportes — revisión de procedimientos de atención
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {runError && (
                        <span style={{ fontSize: '0.78rem', color: '#ef4444', maxWidth: 240 }}>{runError}</span>
                    )}
                    <button
                        onClick={runAudit}
                        disabled={runLoading}
                        className="btn-primary"
                        style={{ background: 'rgba(167,139,250,0.85)', color: '#fff', whiteSpace: 'nowrap' }}
                    >
                        <i className={`fa-solid ${runLoading ? 'fa-spinner fa-spin' : 'fa-microscope'}`}
                           style={{ marginRight: 6 }} />
                        {runLoading ? 'Analizando...' : 'Auditar ahora'}
                    </button>
                </div>
            </div>

            {/* Main */}
            <div style={{ display: 'flex', gap: 14, flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* LEFT: lista de reportes */}
                <div style={{
                    width: 260, flexShrink: 0, overflowY: 'auto', display: 'flex',
                    flexDirection: 'column', gap: 8,
                }}>
                    {loadingList ? (
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', padding: 12 }}>
                            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
                            Cargando reportes...
                        </div>
                    ) : reports.length === 0 ? (
                        <div style={{
                            color: 'rgba(255,255,255,0.30)', fontSize: '0.82rem',
                            padding: '20px 12px', textAlign: 'center', lineHeight: 1.7,
                        }}>
                            <i className="fa-solid fa-folder-open"
                               style={{ fontSize: '1.8rem', marginBottom: 8, display: 'block', opacity: 0.4 }} />
                            Aún no hay reportes.<br />
                            Hacé click en <strong>"Auditar ahora"</strong>.
                        </div>
                    ) : reports.map(r => {
                        const isSelected = selected?.id === r.id;
                        const color = r.incumplimientos === 0 ? '#10b981'
                            : r.incumplimientos <= 3 ? '#f59e0b' : '#ef4444';
                        return (
                            <div
                                key={r.id}
                                onClick={() => setSelected(r)}
                                style={{
                                    padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
                                    background: isSelected
                                        ? 'rgba(167,139,250,0.12)'
                                        : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isSelected
                                        ? 'rgba(167,139,250,0.35)'
                                        : 'rgba(255,255,255,0.07)'}`,
                                    transition: '0.15s',
                                }}
                            >
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    alignItems: 'center', marginBottom: 4,
                                }}>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.40)' }}>
                                        {fmtDate(r.createdAt)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.70rem', fontWeight: 700, padding: '1px 7px',
                                        borderRadius: 8, background: color + '1a', color,
                                        border: `1px solid ${color}40`,
                                    }}>
                                        {r.incumplimientos === 0 ? 'OK' : r.incumplimientos + ' ⚠'}
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {fmtPeriod(r.periodoInicio, r.periodoFin)}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* RIGHT: detalle del reporte seleccionado */}
                <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
                    {!selected ? (
                        <div style={{
                            height: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexDirection: 'column', gap: 12,
                            color: 'rgba(255,255,255,0.25)',
                        }}>
                            <i className="fa-solid fa-arrow-pointer"
                               style={{ fontSize: '2rem', opacity: 0.3 }} />
                            <span style={{ fontSize: '0.88rem' }}>
                                Seleccioná un reporte para ver el detalle
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                                            Reporte — {fmtDate(selected.createdAt)}
                                        </div>
                                        <div style={{
                                            fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)',
                                            marginTop: 4,
                                        }}>
                                            Período: {fmtPeriod(selected.periodoInicio, selected.periodoFin)}
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
                                                    ? `Mostrar ${fpCount} falso${fpCount > 1 ? 's' : ''} positivo${fpCount > 1 ? 's' : ''}`
                                                    : 'Ocultar falsos positivos'}
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
                                                ? 'Sin incumplimientos'
                                                : `${selected.incumplimientos} incumplimiento${selected.incumplimientos > 1 ? 's' : ''}`}
                                        </div>
                                    </div>
                                </div>

                                {selected.resumen && (
                                    <div style={{
                                        padding: '12px 16px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        fontSize: '0.87rem', color: 'rgba(255,255,255,0.72)',
                                        lineHeight: 1.65,
                                    }}>
                                        {selected.resumen}
                                    </div>
                                )}

                                <div style={{
                                    fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)',
                                    textAlign: 'right',
                                }}>
                                    Tokens usados: {selected.tokensUsados?.toLocaleString('es-AR')}
                                </div>
                            </div>

                            {/* Hallazgos */}
                            {visibles.length === 0 && hallazgos.length > 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '20px',
                                    color: 'rgba(255,255,255,0.30)', fontSize: '0.85rem',
                                }}>
                                    Todos los hallazgos están marcados como falsos positivos.
                                </div>
                            )}

                            {visibles.map((h, i) => {
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
                                        {/* Header */}
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'flex-start', gap: 8,
                                        }}>
                                            <div style={{
                                                fontSize: '0.90rem', fontWeight: 700,
                                                color: 'rgba(255,255,255,0.88)', flex: 1,
                                            }}>
                                                {h.regla_violada || 'Incumplimiento'}
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
                                                        advertencia
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Descripción */}
                                        {h.descripcion && (
                                            <div style={{
                                                fontSize: '0.83rem', color: 'rgba(255,255,255,0.58)',
                                                lineHeight: 1.6,
                                            }}>
                                                {h.descripcion}
                                            </div>
                                        )}

                                        {/* Cita textual */}
                                        {h.cita_textual && (
                                            <blockquote style={{
                                                margin: 0, padding: '10px 14px',
                                                background: 'rgba(0,0,0,0.30)',
                                                borderLeft: '3px solid rgba(167,139,250,0.45)',
                                                borderRadius: '0 8px 8px 0',
                                                fontSize: '0.82rem', fontStyle: 'italic',
                                                color: 'rgba(255,255,255,0.65)', lineHeight: 1.6,
                                            }}>
                                                "{h.cita_textual}"
                                            </blockquote>
                                        )}

                                        {/* Footer */}
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', flexWrap: 'wrap', gap: 8,
                                        }}>
                                            <div style={{
                                                fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)',
                                            }}>
                                                {h.vendedor && <span>Vendedor: <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{h.vendedor}</strong></span>}
                                                {h.confianza && <span style={{ marginLeft: 10 }}>Confianza: {h.confianza}</span>}
                                                {h.cliente_id && <span style={{ marginLeft: 10 }}>Cliente ID: {h.cliente_id}</span>}
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
                                                {isFP ? 'Restaurar' : 'Falso positivo'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {hallazgos.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '32px',
                                    color: '#10b981', fontSize: '0.92rem',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', gap: 10,
                                }}>
                                    <i className="fa-solid fa-circle-check"
                                       style={{ fontSize: '2rem', opacity: 0.7 }} />
                                    Sin incumplimientos detectados en este período.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
