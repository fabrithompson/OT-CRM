import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import { useUser } from '../context/UserContext';
import NotificationBell from '../components/kanban/NotificationBell';
import EmptyState from '../components/ui/EmptyState';
import { formatVencimiento } from '../utils/formatFecha';
import '../assets/css/pages/Tareas.css';

const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Agrupa las tareas pendientes en vencidas / hoy / próximas / sin fecha. */
function agrupar(tareas) {
    const hoy = new Date();
    const grupos = { vencidas: [], hoy: [], proximas: [], sinFecha: [], completadas: [] };
    tareas.forEach((t) => {
        if (t.completada) { grupos.completadas.push(t); return; }
        if (!t.vencimiento) { grupos.sinFecha.push(t); return; }
        const d = new Date(t.vencimiento);
        if (t.vencida) grupos.vencidas.push(t);
        else if (mismoDia(d, hoy)) grupos.hoy.push(t);
        else grupos.proximas.push(t);
    });
    return grupos;
}

function FilaTarea({ tarea, mostrarAsignado, onToggle, onDelete, onOpenContact }) {
    const { t, lang } = useLanguage();
    return (
        <li className={`tarea-fila${tarea.completada ? ' is-done' : ''}${tarea.vencida ? ' is-overdue' : ''}`}>
            <input type="checkbox" checked={tarea.completada} onChange={() => onToggle(tarea)}
                aria-label={tarea.completada ? t('tareas.markOpen') : t('tareas.markDone')} />
            <div className="tarea-fila__cuerpo">
                <span className="tarea-fila__titulo">{tarea.titulo}</span>
                <span className="tarea-fila__meta">
                    {tarea.vencimiento && <span><i className="far fa-clock" aria-hidden="true"></i> {formatVencimiento(tarea.vencimiento, lang)}</span>}
                    {tarea.clienteNombre && (
                        <button type="button" className="tarea-fila__contacto" onClick={() => onOpenContact(tarea.clienteId)}>
                            <i className="fas fa-user" aria-hidden="true"></i> {tarea.clienteNombre}
                        </button>
                    )}
                    {mostrarAsignado && tarea.usuarioNombre && (
                        <span>{t('tareas.assignedTo')}: {tarea.usuarioNombre}</span>
                    )}
                </span>
            </div>
            <button type="button" className="tarea-fila__borrar" onClick={() => onDelete(tarea)}
                aria-label={t('tareas.delete')} title={t('tareas.delete')}>
                <i className="fas fa-trash-alt" aria-hidden="true"></i>
            </button>
        </li>
    );
}

export default function Tareas() {
    const { t } = useLanguage();
    const toast = useToast();
    const navigate = useNavigate();
    const { usuario } = useUser();
    const esAdmin = ['ADMIN', 'OWNER'].includes((usuario?.rol || '').toUpperCase());

    const [pestana, setPestana] = useState('mias');
    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [verCompletadas, setVerCompletadas] = useState(false);

    const [titulo, setTitulo] = useState('');
    const [vencimiento, setVencimiento] = useState('');
    const [asignado, setAsignado] = useState('');
    const [guardando, setGuardando] = useState(false);

    const [equipo, setEquipo] = useState([]);
    const [etapas, setEtapas] = useState([]);
    const [reglas, setReglas] = useState([]);
    const [regla, setRegla] = useState({ nombre: '', etapaId: '', accion: 'CREAR_TAREA', tituloTarea: '', diasVencimiento: 1, usuarioId: '' });

    const cargarTareas = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tareas', { params: { alcance: pestana === 'equipo' ? 'equipo' : 'mias', completadas: verCompletadas } });
            setTareas(Array.isArray(res.data) ? res.data : []);
        } catch {
            toast(t('common.errorTitle'), t('tareas.errLoad'), '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [pestana, verCompletadas, toast, t]);

    const cargarReglas = useCallback(async () => {
        try {
            const res = await api.get('/reglas');
            setReglas(Array.isArray(res.data) ? res.data : []);
        } catch { /* informativo */ }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (pestana !== 'reglas') cargarTareas(); }, [pestana, cargarTareas]);

    useEffect(() => {
        if (pestana !== 'reglas') return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        cargarReglas();
        api.get('/etapas').then((r) => setEtapas(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }, [pestana, cargarReglas]);

    useEffect(() => {
        api.get('/dashboard/equipo').then((r) => setEquipo(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }, []);

    // Refresco en vivo cuando alguien del equipo cambia una tarea
    useEffect(() => {
        const alCambiar = () => { if (pestana !== 'reglas') cargarTareas(); };
        window.addEventListener('crm:tareas', alCambiar);
        return () => window.removeEventListener('crm:tareas', alCambiar);
    }, [pestana, cargarTareas]);

    const grupos = useMemo(() => agrupar(tareas), [tareas]);

    const crear = async (e) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        setGuardando(true);
        try {
            await api.post('/tareas', {
                titulo: titulo.trim(),
                vencimiento: vencimiento || null,
                usuarioId: asignado ? Number(asignado) : null,
            });
            setTitulo(''); setVencimiento(''); setAsignado('');
            await cargarTareas();
        } catch (err) {
            toast(t('common.errorTitle'), err.response?.data?.error || t('tareas.errSave'), '#ef4444');
        } finally {
            setGuardando(false);
        }
    };

    const alternar = async (tarea) => {
        try {
            await api.patch(`/tareas/${tarea.id}/completada`, null, { params: { valor: !tarea.completada } });
            await cargarTareas();
        } catch { toast(t('common.errorTitle'), t('tareas.errSave'), '#ef4444'); }
    };

    const borrar = async (tarea) => {
        try {
            await api.delete(`/tareas/${tarea.id}`);
            await cargarTareas();
        } catch { toast(t('common.errorTitle'), t('tareas.errSave'), '#ef4444'); }
    };

    const abrirContacto = (clienteId) => navigate(`/kanban?openChat=${clienteId}`);

    const crearRegla = async (e) => {
        e.preventDefault();
        try {
            await api.post('/reglas', {
                nombre: regla.nombre,
                etapaId: Number(regla.etapaId),
                accion: regla.accion,
                tituloTarea: regla.accion === 'CREAR_TAREA' ? regla.tituloTarea : null,
                diasVencimiento: regla.accion === 'CREAR_TAREA' ? Number(regla.diasVencimiento) : null,
                usuarioId: regla.accion === 'ASIGNAR_RESPONSABLE' ? Number(regla.usuarioId) : null,
            });
            setRegla({ nombre: '', etapaId: '', accion: 'CREAR_TAREA', tituloTarea: '', diasVencimiento: 1, usuarioId: '' });
            await cargarReglas();
        } catch (err) {
            toast(t('common.errorTitle'), err.response?.data?.error || t('tareas.errRule'), '#ef4444');
        }
    };

    const alternarRegla = async (r) => {
        try {
            await api.patch(`/reglas/${r.id}/activa`, null, { params: { valor: !r.activa } });
            await cargarReglas();
        } catch { toast(t('common.errorTitle'), t('tareas.errRule'), '#ef4444'); }
    };

    const borrarRegla = async (r) => {
        try {
            await api.delete(`/reglas/${r.id}`);
            await cargarReglas();
        } catch { toast(t('common.errorTitle'), t('tareas.errRule'), '#ef4444'); }
    };

    const nombreEtapa = (id) => etapas.find((e) => e.id === id)?.nombre || `#${id}`;
    const nombreMiembro = (id) => equipo.find((m) => Number(m.id) === Number(id))?.nombre || `#${id}`;

    const renderGrupo = (clave, items) => items.length > 0 && (
        <section className={`tareas-grupo tareas-grupo--${clave}`} key={clave}>
            <h3>{t(`tareas.${clave === 'sinFecha' ? 'noDate' : clave === 'proximas' ? 'upcoming' : clave === 'vencidas' ? 'overdue' : clave}`)} <span>{items.length}</span></h3>
            <ul>
                {items.map((tarea) => (
                    <FilaTarea key={tarea.id} tarea={tarea} mostrarAsignado={pestana === 'equipo'}
                        onToggle={alternar} onDelete={borrar} onOpenContact={abrirContacto} />
                ))}
            </ul>
        </section>
    );

    return (
        <section className="page-wrapper tareas-page">
            <div className="header-top tareas-head">
                <div className="tareas-head__title">
                    <i className="fas fa-list-check" aria-hidden="true"></i>
                    <h2>{t('tareas.title')}</h2>
                </div>
                <NotificationBell />
            </div>

            <div className="tareas-tabs" role="tablist">
                {[['mias', t('tareas.mine')], ['equipo', t('tareas.team')], ['reglas', t('tareas.automations')]].map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={pestana === id}
                        className={`tareas-tab${pestana === id ? ' is-active' : ''}`} onClick={() => setPestana(id)}>
                        {label}
                    </button>
                ))}
            </div>

            {pestana !== 'reglas' && (
                <div className="tareas-body">
                    <form className="tareas-form" onSubmit={crear}>
                        <input type="text" aria-label={t('tareas.titleLabel')} placeholder={t('tareas.newTask')}
                            value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
                        <input type="datetime-local" aria-label={t('tareas.dueLabel')} value={vencimiento}
                            onChange={(e) => setVencimiento(e.target.value)} />
                        <select aria-label={t('tareas.assignedTo')} value={asignado} onChange={(e) => setAsignado(e.target.value)}>
                            <option value="">{t('tareas.assignedTo')}…</option>
                            {equipo.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                        <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando || !titulo.trim()}>{t('tareas.add')}</button>
                    </form>

                    <label className="tareas-toggle">
                        <input type="checkbox" checked={verCompletadas} onChange={(e) => setVerCompletadas(e.target.checked)} />
                        {t('tareas.showCompleted')}
                    </label>

                    {!loading && tareas.length === 0 ? (
                        <EmptyState icon="fas fa-check-double" title={t('tareas.empty')} />
                    ) : (
                        <>
                            {renderGrupo('vencidas', grupos.vencidas)}
                            {renderGrupo('hoy', grupos.hoy)}
                            {renderGrupo('proximas', grupos.proximas)}
                            {renderGrupo('sinFecha', grupos.sinFecha)}
                            {verCompletadas && renderGrupo('completadas', grupos.completadas)}
                        </>
                    )}
                </div>
            )}

            {pestana === 'reglas' && (
                <div className="tareas-body">
                    <p className="text-muted">{t('tareas.rulesIntro')}</p>
                    {!esAdmin && <p className="tareas-aviso">{t('tareas.onlyAdmins')}</p>}

                    {esAdmin && (
                        <form className="regla-form" onSubmit={crearRegla}>
                            <input type="text" aria-label={t('tareas.ruleName')} placeholder={t('tareas.ruleName')} required maxLength={120}
                                value={regla.nombre} onChange={(e) => setRegla({ ...regla, nombre: e.target.value })} />
                            <select aria-label={t('tareas.ruleStage')} required value={regla.etapaId}
                                onChange={(e) => setRegla({ ...regla, etapaId: e.target.value })}>
                                <option value="">{t('tareas.pickStage')}</option>
                                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                            <select aria-label={t('tareas.ruleAction')} value={regla.accion}
                                onChange={(e) => setRegla({ ...regla, accion: e.target.value })}>
                                <option value="CREAR_TAREA">{t('tareas.actionTask')}</option>
                                <option value="ASIGNAR_RESPONSABLE">{t('tareas.actionOwner')}</option>
                            </select>
                            {regla.accion === 'CREAR_TAREA' ? (
                                <>
                                    <input type="text" aria-label={t('tareas.taskTitle')} placeholder={t('tareas.taskTitle')} required maxLength={200}
                                        value={regla.tituloTarea} onChange={(e) => setRegla({ ...regla, tituloTarea: e.target.value })} />
                                    <input type="number" aria-label={t('tareas.dueDays')} min="0" max="365" required
                                        value={regla.diasVencimiento} onChange={(e) => setRegla({ ...regla, diasVencimiento: e.target.value })} />
                                </>
                            ) : (
                                <select aria-label={t('tareas.owner')} required value={regla.usuarioId}
                                    onChange={(e) => setRegla({ ...regla, usuarioId: e.target.value })}>
                                    <option value="">{t('tareas.pickOwner')}</option>
                                    {equipo.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                                </select>
                            )}
                            <button type="submit" className="ui-btn ui-btn--primary">{t('tareas.createRule')}</button>
                        </form>
                    )}

                    {reglas.length === 0 ? (
                        <EmptyState icon="fas fa-wand-magic-sparkles" title={t('tareas.noRules')} />
                    ) : (
                        <ul className="reglas-lista">
                            {reglas.map((r) => (
                                <li key={r.id} className={r.activa ? '' : 'is-off'}>
                                    <div>
                                        <strong>{r.nombre}</strong>
                                        <span>
                                            {t('tareas.ruleStage')} «{nombreEtapa(r.etapaId)}» →{' '}
                                            {r.accion === 'CREAR_TAREA'
                                                ? `${t('tareas.actionTask')}: ${r.tituloTarea} (${r.diasVencimiento} d)`
                                                : `${t('tareas.actionOwner')}: ${nombreMiembro(r.usuarioId)}`}
                                        </span>
                                    </div>
                                    {esAdmin && (
                                        <div className="reglas-lista__acciones">
                                            <label>
                                                <input type="checkbox" checked={r.activa} onChange={() => alternarRegla(r)} />
                                                {t('tareas.active')}
                                            </label>
                                            <button type="button" className="tarea-fila__borrar" onClick={() => borrarRegla(r)}
                                                aria-label={t('tareas.delete')} title={t('tareas.delete')}>
                                                <i className="fas fa-trash-alt" aria-hidden="true"></i>
                                            </button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}
