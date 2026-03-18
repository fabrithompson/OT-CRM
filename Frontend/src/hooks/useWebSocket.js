import { useEffect, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { getAuthHeaders } from '../utils/api';

/**
 * @param {string|null} agenciaId  
 * @param {function} onEvent       
 * @param {function} onConnect     
 */
export default function useWebSocket(agenciaId, onEvent, onConnect) {
    const clientRef = useRef(null);

    const subscribe = useCallback((destination, cb) => {
        if (!clientRef.current?.connected) return () => {};
        const sub = clientRef.current.subscribe(destination, (msg) => {
            try { cb(JSON.parse(msg.body)); } catch { cb(msg.body); }
        });
        return () => sub.unsubscribe();
    }, []);

    const send = useCallback((destination, body) => {
        if (!clientRef.current?.connected) return;
        clientRef.current.publish({ destination, body: JSON.stringify(body) });
    }, []);

    useEffect(() => {
        if (!agenciaId) return;

        const BASE = import.meta.env.VITE_API_URL || '';
        // El token se pasa como query param para que PresenceHandshakeInterceptor
        // pueda autenticar al usuario durante el HTTP upgrade (antes del STOMP CONNECT)
        const token = localStorage.getItem('token') || '';
        const wsUrl = `${BASE}/ws-crm?agenciaId=${agenciaId}&token=${token}`;

        const client = new Client({
            webSocketFactory: () => new SockJS(wsUrl),
            connectHeaders: { ...getAuthHeaders(), agenciaId: String(agenciaId) },
            reconnectDelay: 5000,
            debug: () => {},
            onConnect: () => {
                // Alertas del sistema: conexión, desconexión, errores de dispositivo
                client.subscribe('/topic/global-notifications', (msg) => {
                    try {
                        const notif = JSON.parse(msg.body);
                        onEvent(notif);

                        // Puente → NotificationBell (React)
                        window.__crmNotifAdd?.({
                            title:     notif.title,
                            message:   notif.message,
                            type:      notif.type,
                            link:      null,
                            timestamp: Date.now(),
                        });
                    } catch {}
                });
                if (onConnect) onConnect(client);
            },
        });

        client.activate();
        clientRef.current = client;

        return () => { client.deactivate(); };
    }, [agenciaId]);

    return { subscribe, send, clientRef };
}