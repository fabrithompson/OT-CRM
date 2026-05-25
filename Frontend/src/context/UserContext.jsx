import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [loading, setLoading] = useState(true);

    const hasValidToken = useCallback(() => {
        const token = localStorage.getItem('token');
        return token && token !== 'undefined' && token !== 'null';
    }, []);

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
            if (err.response?.status === 401 || err.response?.status === 403) {
                localStorage.removeItem('token');
                setUsuario(null);
            }
        } finally {
            setLoading(false);
        }
    }, [clearUser, hasValidToken]);

    useEffect(() => {
        if (hasValidToken()) {
            refresh({ showLoading: true });
        } else {
            clearUser();
        }
<<<<<<< Updated upstream
    }, [refresh]);
=======
    }, [clearUser, hasValidToken, refresh]);
    /* eslint-enable react-hooks/set-state-in-effect */
>>>>>>> Stashed changes

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

export const useUser = () => useContext(UserContext);
