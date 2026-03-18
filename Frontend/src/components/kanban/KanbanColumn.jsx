import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import KanbanCard from './KanbanCard';
import api from '../../utils/api';

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#ffffff', '#a855f7'];

// Icon button wrapper — replaces <i role="button"> with a real <button>
function IconBtn({ icon, title, onClick, style, className, id }) {
    return (
        <button
            type="button"
            id={id}
            className={`icon-action-btn${className ? ` ${className}` : ''}`}
            title={title}
            onClick={onClick}
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '0.9rem',
                ...style,
            }}
        >
            <i className={icon}></i>
        </button>
    );
}

IconBtn.propTypes = {
    icon: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    style: PropTypes.object,
    className: PropTypes.string,
    id: PropTypes.string,
};
IconBtn.defaultProps = { style: {}, className: '', id: undefined };

export default function KanbanColumn({
    etapa, clientes, onOpenChat, onEditStage, onDeleteStage,
    onDropCard, onDropColumn, mutedStages, onToggleMute, onMakeMain,
}) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [isDragOver, setIsDragOver]           = useState(false);
    const [isDraggingCol, setIsDraggingCol]     = useState(false);
    const colRef   = useRef(null);
    const colorRef = useRef(null);

    const isMuted = mutedStages.has(etapa.id);

    useEffect(() => {
        const handler = (e) => {
            if (colorRef.current && !colorRef.current.contains(e.target)) setShowColorPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const changeColor = async (color) => {
        setShowColorPicker(false);
        try { await api.patch(`/etapas/${etapa.id}/color?color=${encodeURIComponent(color)}`); }
        catch (e) { console.error(e); }
    };

    const makeMain = async () => {
        try {
            await api.put(`/etapas/${etapa.id}/hacer-principal`);
            onMakeMain?.();
        } catch (e) { console.error(e); }
    };

    // ─── Drag & drop – COLUMN ─────────────────────────────────────────────
    const onDragStart = (e) => {
        if (e.target !== colRef.current && !e.target.closest('.col-header')) return;
        e.dataTransfer.setData('colId', String(etapa.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setIsDraggingCol(true), 0);
    };
    const onDragEnd   = () => setIsDraggingCol(false);
    const onDragOver  = (e) => {
        e.preventDefault();
        const isCol = e.dataTransfer.types.includes('colid') || e.dataTransfer.getData('colId');
        if (!isCol) setIsDragOver(true);
    };
    const onDragLeave = () => setIsDragOver(false);
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const cardId   = e.dataTransfer.getData('cardId');
        const srcColId = e.dataTransfer.getData('colId');
        if (cardId) onDropCard(cardId, etapa.id);
        else if (srcColId) onDropColumn(srcColId, etapa.id);
    };

    const color = etapa.color || '#6366f1';

    return (
        <div
            ref={colRef}
            id={`col-${etapa.id}`}
            aria-label={`Columna: ${etapa.nombre}`}
            className={`column ${isDraggingCol ? 'dragging-column' : ''}`}
            style={{ borderTopColor: color }}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Column Header */}
            <div className="col-header" style={{ position: 'relative', overflow: 'visible' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="stage-name">{etapa.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '1px 7px' }}>
                        {clientes.length}
                    </span>
                </div>

                <div className="column-header-actions" style={{ overflow: 'visible', position: 'relative' }}>
                    {/* Mute */}
                    <IconBtn
                        id={`mute-icon-${etapa.id}`}
                        icon={`fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}`}
                        title="Silenciar"
                        onClick={(e) => { e.stopPropagation(); onToggleMute(etapa.id); }}
                        style={{ color: isMuted ? '#ef4444' : '#6b7280' }}
                    />

                    {/* Color dot */}
                    <div ref={colorRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="stage-color-dot"
                            style={{ background: color, border: 'none', cursor: 'pointer', padding: 0 }}
                            onClick={(e) => { e.stopPropagation(); setShowColorPicker(prev => !prev); }}
                            title="Cambiar color"
                            aria-label="Cambiar color de etapa"
                        />
                        {showColorPicker && (
                            <div
                                className="color-picker-menu show"
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 6px)',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    display: 'flex',
                                    gap: 8,
                                    padding: '8px 12px',
                                    zIndex: 9999,
                                    borderRadius: 12,
                                    background: '#1e2a33',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                    whiteSpace: 'nowrap',
                                    minWidth: '150px',
                                }}
                            >
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        className="color-option"
                                        style={{ background: c, border: 'none', cursor: 'pointer', padding: 0 }}
                                        onClick={() => changeColor(c)}
                                        aria-label={`Color ${c}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Make principal */}
                    <IconBtn
                        icon={`fas fa-inbox${etapa.esInicial ? ' active' : ''}`}
                        title="Principal"
                        onClick={(e) => { e.stopPropagation(); makeMain(); }}
                        style={{ color: etapa.esInicial ? '#10b981' : '#6b7280' }}
                    />

                    {/* Edit */}
                    <IconBtn
                        icon="fas fa-pencil-alt"
                        title="Editar"
                        onClick={(e) => { e.stopPropagation(); onEditStage(etapa); }}
                        style={{ color: '#837878' }}
                    />

                    {/* Delete */}
                    <IconBtn
                        icon="fas fa-trash-alt"
                        title="Eliminar"
                        onClick={(e) => { e.stopPropagation(); onDeleteStage(etapa); }}
                        style={{ color: '#ef4444' }}
                    />
                </div>
            </div>

            {/* Column Body */}
            <div
                className="col-body"
                id={`col-body-${etapa.id}`}
                style={{ minHeight: 50, background: isDragOver ? 'rgba(16,185,129,0.05)' : undefined, transition: 'background 0.2s' }}
            >
                {clientes.map(c => (
                    <KanbanCard key={c.id} cliente={c} onOpen={onOpenChat} />
                ))}
            </div>
        </div>
    );
}

KanbanColumn.propTypes = {
    etapa: PropTypes.shape({
        id: PropTypes.number.isRequired,
        nombre: PropTypes.string,
        color: PropTypes.string,
        esInicial: PropTypes.bool,
    }).isRequired,
    clientes: PropTypes.array.isRequired,
    onOpenChat: PropTypes.func.isRequired,
    onEditStage: PropTypes.func.isRequired,
    onDeleteStage: PropTypes.func.isRequired,
    onDropCard: PropTypes.func.isRequired,
    onDropColumn: PropTypes.func.isRequired,
    mutedStages: PropTypes.instanceOf(Set).isRequired,
    onToggleMute: PropTypes.func.isRequired,
    onMakeMain: PropTypes.func,
};