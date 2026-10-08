import React from 'react';
import PropTypes from 'prop-types';
import { formatTime } from '../../utils/api';
import { useLanguage } from '../../context/LangContext';
import '../../assets/css/pages/KanbanCard.css';

export default function KanbanCard({ cliente, onOpen, etapas = [], onMove }) {
    const { t: tr } = useLanguage();
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

    return (
        <div
            id={`card-${cliente.id}`}
            className="card"
            data-telefono={String(cliente.telefono || '').replace(/\D/g, '')}
            draggable
            onDragStart={handleDragStart}
            onClick={handleClick}
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
                <div className="card-title kcard-1">
                    {/* El nombre es el botón real (teclado/lectores). La tarjeta entera sigue abriendo el chat con el mouse,
                        pero no es role="button": adentro está el selector "Mover a…" y no se pueden anidar controles. */}
                    <button type="button" className="name-text card-open" onClick={handleClick}>{nombre}</button>
                    <span className="card-time kcard-2">{time}</span>
                </div>
                <div className="card-preview-row kcard-3">
                    <div className="card-preview kcard-4">
                        {resumenIcon && (
                            <i className={`fa-solid ${resumenIcon.icon} kcard-5`}
                               title={resumenIcon.title}
                               style={{ color: resumenIcon.color }} />
                        )}
                        <span className="kcard-6">
                            {resumenTexto || 'Sin mensajes'}
                        </span>
                    </div>
                    {cliente.nombreInstancia && (
                        <span className={`card-instance-label ${platformClass}`}>{cliente.nombreInstancia}</span>
                    )}
                </div>
                {/* Alternativa táctil al drag & drop (solo visible en móvil / sin hover, ver .card-move) */}
                {onMove && etapas.length > 1 && (
                    <select
                        className="card-move"
                        aria-label={tr('kanban.moveTo')}
                        value=""
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => { if (e.target.value) onMove(cliente.id, Number(e.target.value)); }}
                    >
                        <option value="">{tr('kanban.moveTo')}</option>
                        {etapas.filter(et => et.id !== cliente.etapa?.id).map(et => (
                            <option key={et.id} value={et.id}>{et.nombre}</option>
                        ))}
                    </select>
                )}
                {/* Tags */}
                {cliente.etiquetas?.length > 0 && (
                    <div className="kcard-7">
                        {cliente.etiquetas.slice(0, 4).map(t => (
                            <span className="kcard-8" key={t.id} title={t.nombre} style={{ background: t.color || '#10b981' }}></span>
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
    etapas: PropTypes.array,
    onMove: PropTypes.func,
};