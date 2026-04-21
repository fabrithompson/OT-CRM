import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';

export default function useSlashCommands(msgInput, setMsgInput) {
    const [commands, setCommands]     = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [activeIdx, setActiveIdx]   = useState(0);
    const loaded = useRef(false);

    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        api.get('/respuestas-rapidas')
            .then(res => setCommands(res.data || []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!msgInput.startsWith('/') || msgInput.length < 2) {
            setSuggestions([]);
            return;
        }
        const query = msgInput.slice(1).toLowerCase();
        setSuggestions(
            commands.filter(c => c.atajo.toLowerCase().startsWith(query)).slice(0, 6)
        );
        setActiveIdx(0);
    }, [msgInput, commands]);

    const apply = useCallback((cmd) => {
        setMsgInput(cmd.respuesta);
        setSuggestions([]);
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
            setSuggestions([]);
        }
    }, [suggestions, activeIdx, apply]);

    return { suggestions, activeIdx, apply, handleKeyDown };
}

export function SlashMenu({ suggestions, activeIdx, onSelect }) {
    if (suggestions.length === 0) return null;

    return (
        <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: 'linear-gradient(135deg, #0e0e1c 0%, #13131f 55%, #0a0a14 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
            zIndex: 2000,
            marginBottom: 6,
        }}>
            <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.68rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Respuestas rápidas
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
                    <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }}>
                        /{cmd.atajo}
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {cmd.respuesta}
                    </span>
                </button>
            ))}
            <div style={{ padding: '5px 12px', fontSize: '0.68rem', color: '#4b5563', display: 'flex', gap: 12 }}>
                <span><kbd style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.7rem' }}>↑↓</kbd> navegar</span>
                <span><kbd style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.7rem' }}>Tab</kbd> aplicar</span>
                <span><kbd style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.7rem' }}>Esc</kbd> cerrar</span>
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