import React from 'react';
import PropTypes from 'prop-types';
import { formatTime } from '../../utils/api';

export default function KanbanCard({ cliente, onOpen }) {
    const nombre = (cliente.nombre && !cliente.nombre.includes('@'))
        ? cliente.nombre
        : (cliente.telefono || '?');
    const initial = nombre.charAt(0).toUpperCase();
    const time = formatTime(cliente.ultimoMensajeFecha);
    const isWhatsApp = (cliente.origen || '').toUpperCase() !== 'TELEGRAM';
    const platformClass = isWhatsApp ? 'whatsapp' : 'telegram';
    const platformIcon = isWhatsApp ? 'fab fa-whatsapp' : 'fab fa-telegram-plane';

    // Detecta el origen del último mensaje a partir del resumen guardado en backend
    // (formato "{autor}: {contenido}"). Si fue desde el celular del vendedor,
    // reemplazamos el prefijo crudo "EXTERNO_WSP:" por un ícono visible en la tarjeta.
    const resumenRaw = cliente.ultimoMensajeResumen || '';
    let resumenIcon = null;
    let resumenTexto = resumenRaw;
    if (resumenRaw.startsWith('EXTERNO_WSP:')) {
        resumenIcon = { icon: 'fa-mobile-screen-button', color: '#fbbf24', title: 'Enviado desde celular del vendedor' };
        resumenTexto = resumenRaw.slice('EXTERNO_WSP:'.length).trim();
    } else if (resumenRaw.startsWith('AGENTE_IA:') || resumenRaw.startsWith('IA_')) {
        resumenIcon = { icon: 'fa-robot', color: '#a78bfa', title: 'Enviado por el Agente IA' };
        resumenTexto = resumenRaw.replace(/^(AGENTE_IA|IA_[^:]*):\s*/, '');
    }

    const handleDragStart = (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('cardId', String(cliente.id));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleClick = (e) => { e.stopPropagation(); onOpen(cliente.id); };
    const handleKeyDown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onOpen(cliente.id); } };

    return (
        <div
            id={`card-${cliente.id}`}
            className="card"
            role="button"
            tabIndex={0}
            data-telefono={String(cliente.telefono || '').replace(/\D/g, '')}
            draggable
            onDragStart={handleDragStart}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            {/* Avatar */}
            <div className="card-avatar">
                {(cliente.fotoUrl || cliente.avatarUrl) ? (
                    <img src={cliente.fotoUrl || cliente.avatarUrl} className="avatar-img" alt="" />
                ) : (
                    <div className="avatar-initial">{initial}</div>
                )}
                <div className={`platform-badge ${platformClass}`}>
                    <i className={platformIcon}></i>
                </div>
                {cliente.mensajesSinLeer > 0 && (
                    <div className="card-badge">{cliente.mensajesSinLeer}</div>
                )}
            </div>

            {/* Info */}
            <div className="card-info">
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span className="name-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</span>
                    <span className="card-time" style={{ fontSize: '0.75rem', opacity: 0.6, flexShrink: 0 }}>{time}</span>
                </div>
                <div className="card-preview-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div className="card-preview" style={{ flex: 1, fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {resumenIcon && (
                            <i className={`fa-solid ${resumenIcon.icon}`}
                               title={resumenIcon.title}
                               style={{ color: resumenIcon.color, fontSize: '0.78rem', flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {resumenTexto || 'Sin mensajes'}
                        </span>
                    </div>
                    {cliente.nombreInstancia && (
                        <span className={`card-instance-label ${platformClass}`}>{cliente.nombreInstancia}</span>
                    )}
                </div>
                {/* Tags */}
                {cliente.etiquetas?.length > 0 && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
                        {cliente.etiquetas.slice(0, 4).map(t => (
                            <span key={t.id} title={t.nombre} style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#10b981', display: 'inline-block' }}></span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

KanbanCard.propTypes = {
    cliente: PropTypes.shape({
        id: PropTypes.number.isRequired,
        nombre: PropTypes.string,
        telefono: PropTypes.string,
        origen: PropTypes.string,
        fotoUrl: PropTypes.string,
        avatarUrl: PropTypes.string,
        mensajesSinLeer: PropTypes.number,
        ultimoMensajeFecha: PropTypes.string,
        ultimoMensajeResumen: PropTypes.string,
        nombreInstancia: PropTypes.string,
        etiquetas: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.number,
            nombre: PropTypes.string,
            color: PropTypes.string,
        })),
    }).isRequired,
    onOpen: PropTypes.func.isRequired,
};