import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LangContext';
import { formatVencimiento } from '../../utils/formatFecha';

const ICONOS = {
    NOTA: 'fa-note-sticky',
    CAMBIO_ETAPA: 'fa-arrows-left-right',
    TRANSACCION: 'fa-coins',
    TAREA: 'fa-list-check',
    RESPONSABLE: 'fa-user-tag',
    AUTOMATIZACION: 'fa-wand-magic-sparkles',
};

/**
 * Línea de tiempo del contacto: notas, cambios de etapa, movimientos de saldo,
 * tareas y automatizaciones. Las notas se agregan y se borran desde acá; el
 * resto es el registro del sistema.
 */
export default function ContactoActividad({ clienteId }) {
    const { t, lang } = useLanguage();
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const res = await api.get(`/clientes/${clienteId}/actividades`, { params: { limite: 50 } });
            setItems(Array.isArray(res.data) ? res.data : []);
        } catch {
            /* informativo */
        }
    }, [clienteId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { cargar(); }, [cargar]);

    // Se actualiza cuando cambia algo del contacto (tareas, movimientos, etapa…)
    useEffect(() => {
        const alCambiar = (e) => {
            const id = e.detail?.clienteId;
            if (id == null || Number(id) === Number(clienteId)) cargar();
        };
        window.addEventListener('crm:tareas', alCambiar);
        window.addEventListener('crm:actividad', alCambiar);
        return () => {
            window.removeEventListener('crm:tareas', alCambiar);
            window.removeEventListener('crm:actividad', alCambiar);
        };
    }, [clienteId, cargar]);

    const agregar = async (e) => {
        e.preventDefault();
        if (!nota.trim()) return;
        setGuardando(true);
        try {
            await api.post(`/clientes/${clienteId}/actividades`, { texto: nota.trim() });
            setNota('');
            await cargar();
        } catch (err) {
            toast(t('common.errorTitle'), err.response?.data?.error || t('tareas.errSave'), '#ef4444');
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async (id) => {
        try {
            await api.delete(`/clientes/${clienteId}/actividades/${id}`);
            await cargar();
        } catch {
            toast(t('common.errorTitle'), t('tareas.errSave'), '#ef4444');
        }
    };

    return (
        <div className="contacto-actividad">
            <form className="contacto-actividad__form" onSubmit={agregar}>
                <textarea
                    aria-label={t('tareas.addNote')}
                    placeholder={t('tareas.notePlaceholder')}
                    value={nota}
                    maxLength={2000}
                    rows={2}
                    onChange={(e) => setNota(e.target.value)}
                />
                <button type="submit" className="btn-modal btn-confirm" disabled={guardando || !nota.trim()}>
                    {t('tareas.addNote')}
                </button>
            </form>

            {items.length === 0 ? (
                <p className="contacto-tareas__empty">{t('tareas.noActivity')}</p>
            ) : (
                <ol className="contacto-actividad__lista">
                    {items.map((a) => (
                        <li key={a.id} className={`contacto-actividad__item tipo-${a.tipo}`}>
                            <i className={`fas ${ICONOS[a.tipo] || 'fa-circle'}`} aria-hidden="true"></i>
                            <div>
                                <p>{a.texto}</p>
                                <small>
                                    {a.usuarioNombre ? `${a.usuarioNombre} · ` : ''}{formatVencimiento(a.fecha, lang)}
                                </small>
                            </div>
                            {a.tipo === 'NOTA' && (
                                <button type="button" className="contacto-tareas__borrar" onClick={() => borrar(a.id)}
                                    aria-label={t('tareas.deleteNote')} title={t('tareas.deleteNote')}>
                                    <i className="fas fa-times" aria-hidden="true"></i>
                                </button>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

ContactoActividad.propTypes = {
    clienteId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};
