import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await api.get('/perfil');
            setUsuario(res.data);
        } catch (err) {
            console.error('Error cargando perfil', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && token !== 'undefined') {
            refresh();
        } else {
            setLoading(false);
        }
    }, [refresh]);

    // Listen for plan updates to refresh
    useEffect(() => {
        const handler = () => refresh();
        window.addEventListener('crm:plan-updated', handler);
        return () => window.removeEventListener('crm:plan-updated', handler);
    }, [refresh]);

    const agenciaId = usuario?.agencia?.id || null;

    return (
        <UserContext.Provider value={{ usuario, agenciaId, loading, refresh }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => useContext(UserContext);
