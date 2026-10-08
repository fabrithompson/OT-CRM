import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import KanbanCard from './KanbanCard';
import api from '../../utils/api';
import '../../assets/css/pages/KanbanColumn.css';
import { useLanguage } from '../../context/LangContext';

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
    etapa, etapas, clientes, onOpenChat, onEditStage, onDeleteStage,
    onDropCard, onDropColumn, mutedStages, onToggleMute, onMakeMain, onColorChange,
}) {
    const { t } = useLanguage();
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [pickerClosing, setPickerClosing]     = useState(false);
    const [isDragOver, setIsDragOver]           = useState(false);
    const [isDraggingCol, setIsDraggingCol]     = useState(false);
    const colRef         = useRef(null);
    const colorRef       = useRef(null);
    const pickerTimerRef = useRef(null);

    const isMuted = mutedStages.has(etapa.id);

    const closePicker = useCallback(() => {
        setPickerClosing(true);
        if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
        pickerTimerRef.current = setTimeout(() => {
            setShowColorPicker(false);
            setPickerClosing(false);
        }, 220);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (colorRef.current && !colorRef.current.contains(e.target)) closePicker();
        };
        document.addEventListener('mousedown', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
        };
    }, [closePicker]);

    const changeColor = async (color) => {
        closePicker();
        onColorChange?.(etapa.id, color);
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
            <div className="col-header kcol-1">
                <div className="kcol-2">
                    <span className="stage-name">{etapa.nombre}</span>
                    <span className="kcol-3">
                        {clientes.length}
                    </span>
                </div>

                <div className="column-header-actions kcol-4">
                    {/* Mute */}
                    <IconBtn
                        id={`mute-icon-${etapa.id}`}
                        icon={`fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}`}
                        title={t('kanban.mute')}
                        onClick={(e) => { e.stopPropagation(); onToggleMute(etapa.id); }}
                        style={{ color: isMuted ? '#ef4444' : 'var(--color-text-3)' }}
                    />

                    {/* Color dot */}
                    <div ref={colorRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="stage-color-dot kcol-5"
                            style={{ background: color }}
                            onClick={(e) => { e.stopPropagation(); showColorPicker ? closePicker() : setShowColorPicker(true); }}
                            title={t('kanban.changeColor')}
                            aria-label={t('kanban.changeStageColor')}
                        />
                        {showColorPicker && (
                            <div
                                className={`color-picker-menu ${pickerClosing ? 'exiting' : 'entering'} kcol-6`}
                            >
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        className="color-option kcol-5"
                                        style={{ background: c }}
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
                        title={t('kanban.main')}
                        onClick={(e) => { e.stopPropagation(); makeMain(); }}
                        style={{ color: etapa.esInicial ? '#10b981' : 'var(--color-text-3)' }}
                    />

                    {/* Edit */}
                    <IconBtn
                        icon="fas fa-pencil-alt"
                        title={t('common.edit')}
                        onClick={(e) => { e.stopPropagation(); onEditStage(etapa); }}
                        style={{ color: '#837878' }}
                    />

                    {/* Delete */}
                    <IconBtn
                        icon="fas fa-trash-alt"
                        title={t('common.delete')}
                        onClick={(e) => { e.stopPropagation(); onDeleteStage(etapa); }}
                        style={{ color: '#ef4444' }}
                    />
                </div>
            </div>

            {/* Column Body */}
            <div
                className="col-body kcol-7"
                id={`col-body-${etapa.id}`}
                style={{ background: isDragOver ? 'rgba(16,185,129,0.05)' : undefined }}
            >
                {clientes.map(c => (
                    <KanbanCard key={c.id} cliente={c} onOpen={onOpenChat} etapas={etapas} onMove={onDropCard} />
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
    etapas: PropTypes.array,
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