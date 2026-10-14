import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LangContext';
import { formatVencimiento } from '../../utils/formatFecha';

/**
 * Tareas de un contacto dentro de la ficha del chat: lista, alta rápida y
 * completar. Se actualiza solo cuando llega un evento TAREAS_ACTUALIZADAS.
 */
export default function ContactoTareas({ clienteId }) {
    const { t, lang } = useLanguage();
    const toast = useToast();
    const [tareas, setTareas] = useState([]);
    const [titulo, setTitulo] = useState('');
    const [vencimiento, setVencimiento] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const res = await api.get('/tareas', { params: { clienteId } });
            setTareas(Array.isArray(res.data) ? res.data : []);
        } catch {
            /* informativo: si falla, la sección queda vacía */
        }
    }, [clienteId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        const alCambiar = (e) => {
            const id = e.detail?.clienteId;
            if (id == null || Number(id) === Number(clienteId)) cargar();
        };
        window.addEventListener('crm:tareas', alCambiar);
        return () => window.removeEventListener('crm:tareas', alCambiar);
    }, [clienteId, cargar]);

    const agregar = async (e) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        setGuardando(true);
        try {
            await api.post('/tareas', {
                titulo: titulo.trim(),
                clienteId,
                vencimiento: vencimiento || null,
            });
            setTitulo('');
            setVencimiento('');
            await cargar();
        } catch (err) {
            toast(t('common.errorTitle'), err.response?.data?.error || t('tareas.errSave'), '#ef4444');
        } finally {
            setGuardando(false);
        }
    };

    const alternar = async (tarea) => {
        try {
            await api.patch(`/tareas/${tarea.id}/completada`, null, { params: { valor: !tarea.completada } });
            await cargar();
        } catch {
            toast(t('common.errorTitle'), t('tareas.errSave'), '#ef4444');
        }
    };

    const borrar = async (tarea) => {
        try {
            await api.delete(`/tareas/${tarea.id}`);
            await cargar();
        } catch {
            toast(t('common.errorTitle'), t('tareas.errSave'), '#ef4444');
        }
    };

    return (
        <div className="contacto-tareas">
            <form className="contacto-tareas__form" onSubmit={agregar}>
                <input
                    type="text"
                    aria-label={t('tareas.titleLabel')}
                    placeholder={t('tareas.newTask')}
                    value={titulo}
                    maxLength={200}
                    onChange={(e) => setTitulo(e.target.value)}
                />
                <input
                    type="datetime-local"
                    aria-label={t('tareas.dueLabel')}
                    value={vencimiento}
                    onChange={(e) => setVencimiento(e.target.value)}
                />
                <button type="submit" className="btn-modal btn-confirm" disabled={guardando || !titulo.trim()}>
                    {t('tareas.add')}
                </button>
            </form>

            {tareas.length === 0 ? (
                <p className="contacto-tareas__empty">{t('tareas.empty')}</p>
            ) : (
                <ul className="contacto-tareas__lista">
                    {tareas.map((tarea) => (
                        <li key={tarea.id} className={`contacto-tareas__item${tarea.completada ? ' is-done' : ''}${tarea.vencida ? ' is-overdue' : ''}`}>
                            <label>
                                <input type="checkbox" checked={tarea.completada} onChange={() => alternar(tarea)}
                                    aria-label={tarea.completada ? t('tareas.markOpen') : t('tareas.markDone')} />
                                <span className="contacto-tareas__titulo">{tarea.titulo}</span>
                            </label>
                            {tarea.vencimiento && (
                                <span className="contacto-tareas__fecha">{formatVencimiento(tarea.vencimiento, lang)}</span>
                            )}
                            <button type="button" className="contacto-tareas__borrar" onClick={() => borrar(tarea)}
                                aria-label={t('tareas.delete')} title={t('tareas.delete')}>
                                <i className="fas fa-trash-alt" aria-hidden="true"></i>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

ContactoTareas.propTypes = {
    clienteId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};
