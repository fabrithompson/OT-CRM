import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { getAuthHeaders } from '../utils/api';

// Reconexión con backoff exponencial
const INITIAL_DELAY = 2000;
const MAX_DELAY = 30000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Hook de WebSocket STOMP con reconexión automática y backoff exponencial.
 *
 * @param {string|null} agenciaId
 * @param {function} onEvent       - callback para eventos globales
 * @param {function} onConnect     - callback al conectar (recibe el client)
 * @returns {{ subscribe, send, clientRef, connectionStatus }}
 *   connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
 */
export default function useWebSocket(agenciaId, onEvent, onConnect) {
    const clientRef = useRef(null);
    const intentionalClose = useRef(false);
    const currentDelay = useRef(INITIAL_DELAY);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

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

    // onEvent/onConnect se guardan en ref para que el efecto se ate sólo a agenciaId.
    // Si los pusiéramos en deps el WebSocket se reconectaría con cada render del padre
    // (las funciones inline cambian de identidad), lo cual rompe el patrón.
    const onEventRef = useRef(onEvent);
    const onConnectRef = useRef(onConnect);
    /* eslint-disable react-hooks/refs */
    onEventRef.current = onEvent;
    onConnectRef.current = onConnect;
    /* eslint-enable react-hooks/refs */

    useEffect(() => {
        if (!agenciaId) return;

        intentionalClose.current = false;
        currentDelay.current = INITIAL_DELAY;

        const BASE = import.meta.env.VITE_API_URL || '';
        const wsUrl = `${BASE}/ws-crm?agenciaId=${agenciaId}`;

        // Reflejar el estado del socket externo en el state local es exactamente
        // el caso de uso descrito por la regla: aceptable.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConnectionStatus('connecting');

        const client = new Client({
            webSocketFactory: () => new SockJS(wsUrl),
            connectHeaders: { ...getAuthHeaders(), agenciaId: String(agenciaId) },
            // Backoff dinámico: el getter se evalúa antes de cada reconexión
            reconnectDelay: INITIAL_DELAY,
            debug: () => {},

            onConnect: () => {
                // Conexión exitosa: resetear backoff
                currentDelay.current = INITIAL_DELAY;
                client.reconnectDelay = INITIAL_DELAY;
                setConnectionStatus('connected');

                // Suscribir a alertas del sistema
                client.subscribe('/topic/global-notifications', (msg) => {
                    try {
                        const notif = JSON.parse(msg.body);
                        onEventRef.current?.(notif);
                        window.__crmNotifAdd?.({
                            title:     notif.title,
                            message:   notif.message,
                            type:      notif.type,
                            link:      null,
                            timestamp: Date.now(),
                        });
                    } catch { /* payload no JSON, ignorar */ }
                });

                onConnectRef.current?.(client);
            },

            onWebSocketClose: () => {
                // Si el usuario cerró sesión, no reconectar
                if (intentionalClose.current) {
                    setConnectionStatus('disconnected');
                    return;
                }

                setConnectionStatus('reconnecting');

                // Incrementar delay con backoff exponencial para el próximo intento
                currentDelay.current = Math.min(
                    currentDelay.current * BACKOFF_MULTIPLIER,
                    MAX_DELAY
                );
                client.reconnectDelay = currentDelay.current;
            },

            onStompError: (frame) => {
                console.error('STOMP error:', frame.headers?.message || frame.body);
                if (!intentionalClose.current) {
                    setConnectionStatus('reconnecting');
                }
            },
        });

        client.activate();
        clientRef.current = client;

        return () => {
            // Cleanup: marcar como cierre intencional para no reconectar
            intentionalClose.current = true;
            client.deactivate();
            setConnectionStatus('disconnected');
        };
    }, [agenciaId]);

    return { subscribe, send, clientRef, connectionStatus };
}
