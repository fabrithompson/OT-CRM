import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from './LangContext';

const ToastContext = createContext(null);

const MAX_VISIBLE = 3;

// La API histórica es toast(título, mensaje, color): el tipo se deduce del color
// para no tocar las ~50 llamadas existentes.
const TYPE_BY_COLOR = { '#ef4444': 'error', '#10b981': 'success', '#f59e0b': 'warning' };
const ICONS = { error: 'fa-circle-exclamation', success: 'fa-circle-check', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };

// Tiempo de lectura: ~4s + 60ms por carácter (entre 4 y 10s). Los errores, al menos 7s.
function durationFor(type, title, msg) {
    const chars = `${title || ''} ${msg || ''}`.length;
    const ms = Math.min(10000, Math.max(4000, 4000 + chars * 60));
    return type === 'error' ? Math.max(ms, 7000) : ms;
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    // Copia en ref para decidir (duplicado, tope) fuera del updater de setState, que debe ser puro
    const toastsRef = useRef([]);
    const timers = useRef(new Map());

    const commit = useCallback((next) => { toastsRef.current = next; setToasts(next); }, []);

    const removeToast = useCallback((id) => {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        commit(toastsRef.current.filter(t => t.id !== id));
    }, [commit]);

    const schedule = useCallback((id, ms) => {
        clearTimeout(timers.current.get(id));
        timers.current.set(id, setTimeout(() => removeToast(id), ms));
    }, [removeToast]);

    const toast = useCallback((title, msg, color = '#3b82f6') => {
        const type = TYPE_BY_COLOR[String(color).toLowerCase()] || 'info';
        const duration = durationFor(type, title, msg);
        const prev = toastsRef.current;
        // Mismo mensaje ya visible (p. ej. un error que se dispara dos veces): se renueva, no se apila
        const dup = prev.find(t => t.title === title && t.msg === msg);
        if (dup) { schedule(dup.id, duration); return; }
        const id = Date.now() + Math.random();
        schedule(id, duration);
        const next = [...prev, { id, title, msg, type, duration }];
        // Máximo 3 a la vez: se descarta el más viejo
        next.slice(0, Math.max(0, next.length - MAX_VISIBLE)).forEach(t => clearTimeout(timers.current.get(t.id)));
        commit(next.slice(-MAX_VISIBLE));
    }, [schedule, commit]);

    useEffect(() => {
        const map = timers.current;
        return () => map.forEach(clearTimeout);
    }, []);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastList
                toasts={toasts}
                onRemove={removeToast}
                onPause={(id) => clearTimeout(timers.current.get(id))}
                onResume={(t) => schedule(t.id, t.duration)}
            />
        </ToastContext.Provider>
    );
}

ToastProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

function ToastList({ toasts, onRemove, onPause, onResume }) {
    const { t } = useLanguage();
    // La región existe siempre (vacía) para que los lectores de pantalla anuncien lo que entra
    return (
        <div className="ui-toasts" aria-live="polite" aria-relevant="additions">
            {toasts.map(item => (
                <div
                    key={item.id}
                    className={`ui-toast ui-toast--${item.type}`}
                    role={item.type === 'error' ? 'alert' : 'status'}
                    onMouseEnter={() => onPause(item.id)}
                    onMouseLeave={() => onResume(item)}
                    onFocus={() => onPause(item.id)}
                    onBlur={() => onResume(item)}
                >
                    <i className={`fas ${ICONS[item.type]} ui-toast__icon`} aria-hidden="true" />
                    <div className="ui-toast__body">
                        <div className="ui-toast__title">{item.title}</div>
                        {item.msg && <div className="ui-toast__msg">{item.msg}</div>}
                    </div>
                    <button type="button" className="ui-toast__close" onClick={() => onRemove(item.id)} aria-label={t('ui.close')}>
                        <i className="fas fa-times" aria-hidden="true" />
                    </button>
                </div>
            ))}
        </div>
    );
}

ToastList.propTypes = {
    toasts: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number,
        title: PropTypes.string,
        msg: PropTypes.string,
        type: PropTypes.string,
        duration: PropTypes.number,
    })).isRequired,
    onRemove: PropTypes.func.isRequired,
    onPause: PropTypes.func.isRequired,
    onResume: PropTypes.func.isRequired,
};

// El hook vive junto a su Provider (patrón estándar de Context).
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);
