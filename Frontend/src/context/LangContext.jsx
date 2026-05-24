import React, { createContext, useContext, useState, useCallback } from 'react';
import { TRANSLATIONS } from '../i18n/translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem('crm_lang') || 'es');

    const toggleLang = useCallback(() => {
        setLang(prev => {
            const next = prev === 'es' ? 'en' : 'es';
            localStorage.setItem('crm_lang', next);
            return next;
        });
    }, []);

    /**
     * t('auth.panels.login.title') → resolves nested key path
     * Returns the key string itself if not found.
     */
    const t = useCallback((key) => {
        const parts = key.split('.');
        let val = TRANSLATIONS[lang];
        for (const part of parts) {
            if (val == null || typeof val !== 'object') return key;
            val = val[part];
        }
        return val != null ? val : key;
    }, [lang]);

    return (
        <LangContext.Provider value={{ lang, toggleLang, t, translations: TRANSLATIONS[lang] }}>
            {children}
        </LangContext.Provider>
    );
}

// El hook vive junto a su Provider (patrón estándar de Context). Separarlo a otro
// archivo solo para Fast Refresh obligaría a tocar imports en todo el proyecto.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
    const ctx = useContext(LangContext);
    if (!ctx) throw new Error('useLanguage must be used within LangProvider');
    return ctx;
}
