import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';
import '../../assets/css/pages/SlashCommandMenu.css';
import { useLanguage } from '../../context/LangContext';

// Este archivo exporta el hook useSlashCommands + el componente SlashMenu, que están
// acoplados por diseño (el hook produce las suggestions que el menú renderiza).
// eslint-disable-next-line react-refresh/only-export-components
export default function useSlashCommands(msgInput, setMsgInput) {
    const [commands, setCommands]       = useState([]);
    const [rawActiveIdx, setActiveIdx]  = useState(0);
    const loaded = useRef(false);

    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        api.get('/respuestas-rapidas')
            .then(res => setCommands(res.data || []))
            .catch((err) => { console.warn('Slash commands: no se pudieron cargar:', err); });
    }, []);

    // Derivado puro: sugerencias = commands filtradas por el query actual.
    // useMemo evita el ciclo setState→render→useEffect→setState.
    const suggestions = useMemo(() => {
        if (!msgInput.startsWith('/') || msgInput.length < 2) return [];
        const query = msgInput.slice(1).toLowerCase();
        return commands.filter(c => c.atajo.toLowerCase().startsWith(query)).slice(0, 6);
    }, [msgInput, commands]);

    // Clamp en render para que activeIdx siempre apunte a una sugerencia válida,
    // sin tener que sincronizar con useEffect+setState.
    const activeIdx = suggestions.length > 0
        ? Math.min(rawActiveIdx, suggestions.length - 1)
        : 0;

    const apply = useCallback((cmd) => {
        // Al setear msgInput sin slash inicial, useMemo recomputa suggestions = [].
        setMsgInput(cmd.respuesta);
    }, [setMsgInput]);

    const handleKeyDown = useCallback((e) => {
        if (suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(i => (i + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (suggestions[activeIdx]) {
                e.preventDefault();
                apply(suggestions[activeIdx]);
            }
        } else if (e.key === 'Escape') {
            // Limpiar el input para que useMemo recompute suggestions = [].
            // preventDefault: marca el Esc como usado para que useDialog no cierre el chat.
            e.preventDefault();
            setMsgInput('');
        }
    }, [suggestions, activeIdx, apply, setMsgInput]);

    return { suggestions, activeIdx, apply, handleKeyDown };
}

export function SlashMenu({ suggestions, activeIdx, onSelect }) {
    const { t } = useLanguage();
    if (suggestions.length === 0) return null;

    return (
        <div className="slash-1">
            <div className="slash-2">
                {t('slash.title')}
            </div>
            {suggestions.map((cmd, i) => (
                <button
                    key={cmd.id}
                    type="button"
                    onClick={() => onSelect(cmd)}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        width: '100%',
                        padding: '9px 12px',
                        background: i === activeIdx ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = i === activeIdx ? 'rgba(99,102,241,0.15)' : 'transparent'; }}
                >
                    <span className="slash-3">
                        /{cmd.atajo}
                    </span>
                    <span className="slash-4">
                        {cmd.respuesta}
                    </span>
                </button>
            ))}
            <div className="slash-5">
                <span><kbd className="slash-6">↑↓</kbd> {t('slash.navigate')}</span>
                <span><kbd className="slash-6">Tab</kbd> {t('slash.apply')}</span>
                <span><kbd className="slash-6">Esc</kbd> {t('slash.close')}</span>
            </div>
        </div>
    );
}

SlashMenu.propTypes = {
    suggestions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number,
        atajo: PropTypes.string,
        respuesta: PropTypes.string,
    })).isRequired,
    activeIdx: PropTypes.number.isRequired,
    onSelect: PropTypes.func.isRequired,
};