import React, { useEffect, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import useWebSocket from '../hooks/useWebSocket';
import useAudio from '../hooks/useAudio';
import api from '../utils/api';
import { requestNotifPermission, pushBrowserNotif } from '../utils/notifications';
import { useUser } from '../context/UserContext';

export default function MainLayout() {
    const token = localStorage.getItem('token');
    const { agenciaId, loading } = useUser();
    const { playConnect, playDisconnect } = useAudio();

    // Cache sessionId → alias para mostrar el nombre real del dispositivo
    const deviceCacheRef = useRef({});

    useEffect(() => {
        requestNotifPermission();
    }, []);

    // Cargar dispositivos (WhatsApp + Telegram) para el cache sessionId → alias
    useEffect(() => {
        if (!agenciaId) return;
        Promise.allSettled([
            api.get('/whatsapp'),
            api.get('/telegram-devices'),
        ]).then(([waResult, tgResult]) => {
            const cache = {};
            if (waResult.status === 'fulfilled') {
                waResult.value.data.forEach(d => {
                    if (d.sessionId) cache[d.sessionId] = d.alias || d.sessionId;
                });
            }
            if (tgResult.status === 'fulfilled') {
                tgResult.value.data.forEach(d => {
                    if (d.sessionId) cache[d.sessionId] = d.alias || d.sessionId;
                });
            }
            deviceCacheRef.current = cache;
        });
    }, [agenciaId]);

    // Suscripción global a presencia + heartbeat periódico
    // connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
    const { connectionStatus } = useWebSocket(agenciaId, () => {}, (client) => {
        // Suscribirse a presencia para registrar al usuario como online
        client.subscribe(`/topic/presence/${agenciaId}`, (msg) => {
            try {
                const users = JSON.parse(msg.body);
                if (Array.isArray(users)) {
                    window.__crmOnlineUsers = new Set(users);
                    window.dispatchEvent(new CustomEvent('crm:presence-updated', { detail: users }));
                }
            } catch {}
        });

        // Enviar heartbeat periódico para mantener la presencia activa
        const heartbeat = setInterval(() => {
            if (client.connected) {
                client.publish({
                    destination: '/app/presence',
                    body: JSON.stringify({ agenciaId }),
                });
            }
        }, 30000); // cada 30 segundos

        // Enviar heartbeat inicial
        if (client.connected) {
            client.publish({
                destination: '/app/presence',
                body: JSON.stringify({ agenciaId }),
            });
        }

        // Limpiar interval cuando se desconecte
        const originalDeactivate = client.deactivate.bind(client);
        client.deactivate = () => {
            clearInterval(heartbeat);
            return originalDeactivate();
        };

        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const ev = JSON.parse(msg.body);
                if (ev.tipo === 'CONNECTED' || ev.tipo === 'DISCONNECTED') {
                    const isConnected = ev.tipo === 'CONNECTED';

                    // Siempre refrescar cache antes de mostrar la notificación
                    // para asegurarse de tener el alias actualizado
                    const refreshAndNotify = (cache) => {
                        const deviceName = cache[ev.sessionId] || ev.alias || ev.sessionId || 'Desconocido';
                        const title   = isConnected ? 'Dispositivo conectado' : 'Dispositivo desconectado';
                        const message = isConnected
                            ? `Se conectó el dispositivo "${deviceName}"`
                            : `Se desconectó el dispositivo "${deviceName}"`;

                        if (isConnected) playConnect();
                        else             playDisconnect();

                        window.__crmNotifAdd?.({ title, message, type: ev.tipo, link: null, timestamp: Date.now() });
                        pushBrowserNotif(title, message);
                    };

                    Promise.allSettled([
                        api.get('/whatsapp'),
                        api.get('/telegram-devices'),
                    ]).then(([waResult, tgResult]) => {
                        const cache = {};
                        if (waResult.status === 'fulfilled') {
                            waResult.value.data.forEach(d => {
                                if (d.sessionId) cache[d.sessionId] = d.alias || d.sessionId;
                            });
                        }
                        if (tgResult.status === 'fulfilled') {
                            tgResult.value.data.forEach(d => {
                                if (d.sessionId) cache[d.sessionId] = d.alias || d.sessionId;
                            });
                        }
                        deviceCacheRef.current = cache;
                        refreshAndNotify(cache);
                    }).catch(() => {
                        // Si falla el refresh, usar cache existente
                        refreshAndNotify(deviceCacheRef.current);
                    });
                }
            } catch {}
        });
    });

    if (!token) return <Navigate to="/login" replace />;
    if (loading) return <div className="app-loading" />;

    return (
        <>
            <div className="ambient-bg"><div className="orb"></div></div>
            <div className="glass-overlay"></div>
            {/* Badge de reconexión — se muestra solo cuando la conexión WebSocket se perdió */}
            {connectionStatus === 'reconnecting' && (
                <div style={{
                    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    background: '#f59e0b', color: '#000', padding: '8px 20px',
                    borderRadius: 8, fontWeight: 600, fontSize: 14, zIndex: 9999,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex',
                    alignItems: 'center', gap: 8
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#000', animation: 'pulse 1.5s infinite'
                    }} />
                    Reconectando...
                </div>
            )}
            <div className="app-container">
                <Sidebar />
                <div className="content-area">
                    <Outlet />
                </div>
            </div>
        </>
    );
}