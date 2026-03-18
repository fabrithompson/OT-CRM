import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const STORAGE_KEY_HISTORY = 'crm_notif_history';
const STORAGE_KEY_UNREAD  = 'crm_notif_unread';

export default function NotificationBell({ onOpenChat }) {
    const [open, setOpen]       = useState(false);
    const [history, setHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]'); } catch { return []; }
    });
    const [unread, setUnread] = useState(() =>
        Number.parseInt(localStorage.getItem(STORAGE_KEY_UNREAD) || '0', 10) || 0
    );
    const menuRef = useRef(null);

    // Ref para deduplicar notificaciones iguales en ventana de 5 segundos
    const lastNotifRef = useRef({});

    useEffect(() => {
        window.__crmNotifAdd = (entry) => {
            // Dedup key: título + mensaje (ignora timestamp)
            const dedupKey = `${entry.title}|${entry.message}`;
            const now = Date.now();
            const last = lastNotifRef.current[dedupKey] || 0;
            if (now - last < 5000) return; // misma notif en menos de 5s → ignorar
            lastNotifRef.current[dedupKey] = now;

            setHistory(prev => {
                const next = [entry, ...prev].slice(0, 20);
                localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
                return next;
            });
            setUnread(prev => {
                const next = prev + 1;
                localStorage.setItem(STORAGE_KEY_UNREAD, String(next));
                return next;
            });
        };
        return () => { delete window.__crmNotifAdd; };
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (e) => {
        e.stopPropagation();
        setOpen(prev => {
            if (!prev) {
                setUnread(0);
                localStorage.setItem(STORAGE_KEY_UNREAD, '0');
            }
            return !prev;
        });
    };

    const clearAll = () => {
        setHistory([]);
        setUnread(0);
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        localStorage.setItem(STORAGE_KEY_UNREAD, '0');
    };

    const iconFor = (type) => {
        if (type === 'ERROR' || type === 'DISCONNECTED') return { icon: 'fa-wifi', color: '#ef4444' };
        if (type === 'SUCCESS' || type === 'CONNECTED')  return { icon: 'fa-check', color: '#10b981' };
        return { icon: 'fa-comment-dots', color: '#6366f1' };
    };

    return (
        <div
            className="notification-wrapper-integrated"
            ref={menuRef}
            style={{ position: 'relative', overflow: 'visible', zIndex: 1000 }}
        >
            <button
                type="button"
                className="btn-header-notif"
                onClick={toggle}
            >
                <i className="fas fa-bell"></i>
                {unread > 0 && (
                    <span className="badge-dot">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            <div className={`dropdown-menu-custom${open ? ' show' : ''}`}>
                <div className="dd-header">
                    <span>Novedades</span>
                    <button
                        type="button"
                        className="btn-clear-all"
                        onClick={clearAll}
                        title="Limpiar todo"
                    >
                        <i className="fas fa-trash-alt"></i>
                    </button>
                </div>

                <div className="dd-body">
                    {history.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-bell-slash"></i>
                            <span>Sin novedades</span>
                        </div>
                    ) : history.map((n) => {
                        const { icon, color } = iconFor(n.type);
                        const timeStr = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const handleClick = () => {
                            if (n.type === 'chat' && n.link) { onOpenChat?.(n.link); setOpen(false); }
                        };
                        return (
                            <div
                                key={`${n.timestamp}-${n.title}`}
                                className="notif-item"
                                onClick={handleClick}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && handleClick()}
                            >
                                <div
                                    className="notif-icon-box"
                                    style={{ background: `${color}20`, color }}
                                >
                                    <i className={`fas ${icon}`}></i>
                                </div>
                                <div className="notif-content-box">
                                    <div className="notif-header-row">
                                        <span className="notif-title">{n.title}</span>
                                        <span className="notif-time">{timeStr}</span>
                                    </div>
                                    <p className="notif-msg">{n.message}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

NotificationBell.propTypes = {
    onOpenChat: PropTypes.func,
};
NotificationBell.defaultProps = {
    onOpenChat: undefined,
};