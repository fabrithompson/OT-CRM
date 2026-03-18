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
                    <div className="card-preview" style={{ flex: 1, fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cliente.ultimoMensajeResumen || 'Sin mensajes'}
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