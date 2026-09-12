import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { getToken, clearTokens } from '../utils/api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [loading, setLoading] = useState(true);

    const hasValidToken = useCallback(() => Boolean(getToken()), []);

    const clearUser = useCallback(() => {
        setUsuario(null);
        setLoading(false);
    }, []);

    const refresh = useCallback(async ({ showLoading = false } = {}) => {
        if (!hasValidToken()) {
            clearUser();
            return;
        }

        if (showLoading) {
            setLoading(true);
        }

        try {
            const res = await api.get('/perfil');
            setUsuario(res.data);
        } catch (err) {
            console.error('Error cargando perfil', err);
            // Solo 401: el interceptor de api.js ya intentó refrescar la sesión
            // antes de que esto llegue acá, así que si sigue siendo 401 es que
            // no hay sesión que salvar. 403 es "autenticado pero sin permiso
            // para esto" — no corresponde desloguear a alguien por eso.
            if (err.response?.status === 401) {
                clearTokens();
                setUsuario(null);
            }
        } finally {
            setLoading(false);
        }
    }, [clearUser, hasValidToken]);

    // Bootstrap: cargar el perfil si hay token; si no, marcar loading=false.
    // El setState al montar es el patrón "load on mount" descrito por la regla: aceptable.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (hasValidToken()) {
            refresh({ showLoading: true });
        } else {
            clearUser();
        }
    }, [clearUser, hasValidToken, refresh]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        const syncSession = () => {
            if (hasValidToken()) {
                refresh({ showLoading: true });
            } else {
                clearUser();
            }
        };

        window.addEventListener('crm:auth-changed', syncSession);
        window.addEventListener('storage', syncSession);
        return () => {
            window.removeEventListener('crm:auth-changed', syncSession);
            window.removeEventListener('storage', syncSession);
        };
    }, [clearUser, hasValidToken, refresh]);

    // Listen for plan updates to refresh
    useEffect(() => {
        const handler = () => refresh();
        window.addEventListener('crm:plan-updated', handler);
        return () => window.removeEventListener('crm:plan-updated', handler);
    }, [refresh]);

    const agenciaId = usuario?.agencia?.id || null;

    return (
        <UserContext.Provider value={{ usuario, agenciaId, loading, refresh, clearUser }}>
            {children}
        </UserContext.Provider>
    );
}

// El hook vive junto a su Provider (patrón estándar de Context).
// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => useContext(UserContext);
