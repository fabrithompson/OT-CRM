import React, { createContext, useContext, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast = useCallback((title, msg, color = '#3b82f6') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, title, msg, color }]);
        setTimeout(() => removeToast(id), 6000);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastList toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

ToastProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

function ToastList({ toasts, onRemove }) {
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <button
                    key={t.id}
                    type="button"
                    className="toast show"
                    style={{
                        borderLeftColor: t.color,
                        cursor: 'pointer',
                        background: 'none',
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderLeft: `4px solid ${t.color}`,
                    }}
                    onClick={() => onRemove(t.id)}
                >
                    <div style={{ padding: '15px' }}>
                        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>{t.title}</div>
                        <div style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.4 }}>{t.msg}</div>
                    </div>
                </button>
            ))}
        </div>
    );
}

ToastList.propTypes = {
    toasts: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number,
        title: PropTypes.string,
        msg: PropTypes.string,
        color: PropTypes.string,
    })).isRequired,
    onRemove: PropTypes.func.isRequired,
};

export const useToast = () => useContext(ToastContext);