import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LangContext';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import { useToast } from '../context/ToastContext';
import KanbanColumn from '../components/kanban/KanbanColumn';
import ChatModal from '../components/kanban/ChatModal';
import { CreateStageModal, EditStageModal, DeleteStageModal } from '../components/kanban/StageModals';
import useAudio from '../hooks/useAudio';
import NotificationBell from '../components/kanban/NotificationBell';
import { pushBrowserNotif } from '../utils/notifications';
import { useUser } from '../context/UserContext';
const PAGE_SIZE = 40;

export default function Kanban() {
    const { t } = useLanguage();
    const toast = useToast();
    const {playNotification } = useAudio();
    const [searchParams] = useSearchParams();
    const { usuario: userCtx, agenciaId } = useUser();

    useEffect(() => {
        const id = Number.parseInt(searchParams.get('openChat'), 10);
        if (id) setOpenChatId(id);
    }, [searchParams]);

    const [etapas, setEtapas]       = useState([]);
    const [clientes, setClientes]   = useState([]);
    const [usuario, setUsuario]     = useState('Agente');
    const [loading, setLoading]     = useState(true);

    const [etiquetas, setEtiquetas]               = useState([]);
    const [filterLabel, setFilterLabel]           = useState('');
    const [filterEtiquetaId, setFilterEtiquetaId] = useState('');
    const [showFilterMenu, setShowFilterMenu]     = useState(false);
    const [searchQuery, setSearchQuery]           = useState('');
    const [debouncedSearch, setDebouncedSearch]   = useState('');

    const [createOpen, setCreateOpen]   = useState(false);
    const [editStage, setEditStage]     = useState(null);
    const [deleteStage, setDeleteStage] = useState(null);

    const [openChatId, setOpenChatId] = useState(null);
    const [mutedStages, setMutedStages] = useState(() => {
        const s = JSON.parse(localStorage.getItem('crm_muted_stages') || '[]');
        return new Set(s.map(Number));
    });

    const filterRef    = useRef(null);
    const wsEventRef   = useRef(null);

    useEffect(() => {
        if (userCtx) {
            setUsuario(userCtx.username || userCtx.nombreCompleto || 'Agente');
        }
    }, [userCtx]);

    const loadBoard = useCallback(async (etiquetaId = '') => {
        setLoading(true);
        try {
            const clientesUrl = etiquetaId
                ? `/clientes?etiquetaId=${etiquetaId}&size=${PAGE_SIZE}`
                : `/clientes?size=${PAGE_SIZE}`;

            const [resE, resC] = await Promise.all([
                api.get('/etapas'),
                api.get(clientesUrl)
            ]);
            setEtapas(resE.data);
            setClientes(resC.data);

            if (!etiquetaId) {
                const tagMap = new Map();
                resC.data.forEach(c => c.etiquetas?.forEach(t => tagMap.set(t.id, t)));
                setEtiquetas([...tagMap.values()]);
            }
        } catch (e) {
            toast('Error', 'No se pudo cargar el tablero', '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadBoard(filterEtiquetaId); }, [filterEtiquetaId, loadBoard]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const handleClienteEvent = useCallback((ev, muted) => {
        if (!ev.cliente) return;
        setClientes(prev => {
            const idx = prev.findIndex(c => c.id === (ev.cliente.clienteId || ev.cliente.id));
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], ...ev.cliente };
                return updated;
            }
            return [ev.cliente, ...prev];
        });
        const sinLeer = ev.cliente?.mensajesSinLeer ?? 0;
        if (!ev.cliente?.esSalida && sinLeer > 0) {
            const etapaId = ev.cliente?.etapaId || ev.cliente?.etapa?.id;
            if (!muted.has(etapaId)) {
                playNotification();
                const notifTitle = ev.cliente.nombre || 'Nuevo mensaje';
                const notifMsg   = ev.cliente.ultimoMensaje || ev.cliente.ultimoMensajeResumen || 'Nuevo mensaje';
                window.__crmNotifAdd?.({
                    title: notifTitle, message: notifMsg,
                    type: 'chat', link: ev.cliente.clienteId || ev.cliente.id,
                    timestamp: Date.now(),
                });
                // Notificación nativa del navegador
                pushBrowserNotif(notifTitle, notifMsg);
            }
        }
    }, [playNotification]);

    const handleEtapasReordenadas = useCallback((ev) => {
        if (!ev.nuevoOrden) return;
        setEtapas(prev => {
            const map = new Map(prev.map(e => [e.id, e]));
            return ev.nuevoOrden.map(id => map.get(id)).filter(Boolean);
        });
    }, []);

    const handleWSEvent = useCallback((ev) => {
        if (!ev?.tipo) return;
        const tipo = ev.tipo;

        if (tipo === 'NUEVO_LEAD') {
            handleClienteEvent(ev, mutedStages);
        } else if (tipo === 'CLIENTE_ACTUALIZADO') {
            // REST endpoint sends {tipo, clienteId, nombre, notas} without cliente wrapper
            if (ev.cliente) {
                handleClienteEvent(ev, mutedStages);
            } else if (ev.clienteId) {
                setClientes(prev => prev.map(c =>
                    c.id === ev.clienteId
                        ? { ...c, ...(ev.nombre !== undefined && { nombre: ev.nombre }), ...(ev.notas !== undefined && { notas: ev.notas }) }
                        : c
                ));
            }
        } else if (tipo === 'CLIENTE_MOVIDO') {
            setClientes(prev => prev.map(c =>
                c.id === ev.clienteId ? { ...c, etapa: { id: ev.nuevaEtapaId } } : c
            ));
        } else if (tipo === 'CLIENTE_ELIMINADO') {
            setClientes(prev => prev.filter(c => c.id !== ev.clienteId));
        } else if (tipo === 'ETIQUETAS_ACTUALIZADAS') {
            setClientes(prev => {
                const updated = prev.map(c =>
                    c.id === ev.clienteId ? { ...c, etiquetas: ev.etiquetas } : c
                );
                const tagMap = new Map();
                updated.forEach(c => c.etiquetas?.forEach(t => tagMap.set(t.id, t)));
                setEtiquetas([...tagMap.values()]);
                return updated;
            });
        } else if (tipo === 'SALDO_ACTUALIZADO') {
            setClientes(prev => prev.map(c =>
                c.id === ev.clienteId ? { ...c, saldo: ev.nuevoSaldo } : c
            ));
        } else if (tipo === 'ETAPA_CREADA') {
            setEtapas(prev => prev.some(e => e.id === ev.etapa?.id) ? prev : [...prev, ev.etapa]);
        } else if (tipo === 'ETAPA_ELIMINADA') {
            setEtapas(prev => prev.filter(e => e.id !== ev.etapaId));
        } else if (tipo === 'ETAPA_PRINCIPAL_ACTUALIZADA') {
            setEtapas(prev => prev.map(e => ({ ...e, esInicial: e.id === ev.etapaId })));
        } else if (tipo === 'ETAPA_RENOMBRADA') {
            setEtapas(prev => prev.map(e =>
                e.id === ev.etapaId ? { ...e, nombre: ev.nuevoNombre } : e
            ));
        } else if (tipo === 'ETAPA_COLOR_ACTUALIZADA') {
            setEtapas(prev => prev.map(e =>
                e.id === ev.etapaId ? { ...e, color: ev.nuevoColor } : e
            ));
        } else if (tipo === 'ETAPAS_REORDENADAS') {
            handleEtapasReordenadas(ev);
        } else if (tipo === 'REFRESCAR_KANBAN') {
            loadBoard(filterEtiquetaId);
        } else if (tipo === 'PLAN_EQUIPO_ACTUALIZADO') {
            window.dispatchEvent(new CustomEvent('crm:plan-updated'));
        }
    }, [mutedStages, filterEtiquetaId, loadBoard, handleClienteEvent, handleEtapasReordenadas]);

    wsEventRef.current = handleWSEvent;

    const handleEmbudoRef = useRef(null);
    handleEmbudoRef.current = useCallback((data) => {
        if (!data) return;
        const cliente = {
            ...data,
            id: data.clienteId || data.id,
            etapa: data.etapaId ? { id: data.etapaId } : data.etapa,
            ultimoMensajeResumen: data.ultimoMensaje || data.ultimoMensajeResumen,
        };
        handleClienteEvent({ cliente }, mutedStages);
    }, [handleClienteEvent, mutedStages]);

    const { clientRef: stompRef, connectionStatus } = useWebSocket(agenciaId, handleWSEvent, (client) => {
        client.publish({ destination: '/app/presence', body: JSON.stringify({ username: usuario, status: 'ONLINE', agenciaId, timestamp: Date.now() }) });

        // Mensajes y movimientos de clientes en el kanban
        client.subscribe(`/topic/embudo/${agenciaId}`, (msg) => {
            try { handleEmbudoRef.current?.(JSON.parse(msg.body)); } catch {}
        });

        // Cambios de etapas en tiempo real (color, nombre, orden, principal, crear, eliminar)
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try { wsEventRef.current?.(JSON.parse(msg.body)); } catch {}
        });
    });

    const handleDropCard = useCallback(async (cardId, nuevaEtapaId) => {
        const id = Number.parseInt(cardId, 10);
        setClientes(prev => prev.map(c => c.id === id ? { ...c, etapa: { id: nuevaEtapaId } } : c));
        try {
            await api.patch(`/clientes/${id}/etapa?nuevaEtapaId=${nuevaEtapaId}`);
        } catch {
            toast('Error', 'No se pudo mover', '#ef4444');
            loadBoard(filterEtiquetaId);
        }
    }, [toast, loadBoard, filterEtiquetaId]);

    const handleDropColumn = useCallback(async (srcColId, targetColId) => {
        const srcId = Number.parseInt(srcColId, 10);
        const tgtId = Number.parseInt(targetColId, 10);
        setEtapas(prev => {
            const arr = [...prev];
            const si  = arr.findIndex(e => e.id === srcId);
            const ti  = arr.findIndex(e => e.id === tgtId);
            if (si < 0 || ti < 0) return prev;
            const [col] = arr.splice(si, 1);
            arr.splice(ti, 0, col);
            return arr;
        });
        try {
            const ids = etapas.map(e => e.id);
            const si  = ids.indexOf(srcId);
            const ti  = ids.indexOf(tgtId);
            if (si >= 0 && ti >= 0) { ids.splice(si, 1); ids.splice(ti, 0, srcId); }
            await api.post('/etapas/reordenar', ids);
        } catch { console.error('Error reordenando'); }
    }, [etapas]);

    const handleUpdateCard = useCallback((clienteId, updates) => {
        setClientes(prev => prev.map(c => c.id === Number.parseInt(clienteId, 10) ? { ...c, ...updates } : c));
    }, []);

    const toggleMute = useCallback((id) => {
        setMutedStages(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            localStorage.setItem('crm_muted_stages', JSON.stringify([...next]));
            return next;
        });
    }, []);

    const selectFilter = (id, nombre) => {
        setFilterEtiquetaId(id); setFilterLabel(nombre); setShowFilterMenu(false);
    };

    useEffect(() => {
        const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilterMenu(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);



    const clientesForEtapa = (etapaId) => clientes.filter(c => {
        if (c.etapa?.id !== etapaId) return false;
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            const text = `${c.nombre || ''} ${c.telefono || ''} ${c.ultimoMensajeResumen || ''}`.toLowerCase();
            return text.includes(q);
        }
        return true;
    });

    const renderBoard = () => {
        if (loading) return (
            <>
                {[1,2,3,4].map(i => (
                    <div key={i} className="kanban-column skeleton-col" style={{ minWidth: 300, flexShrink: 0, opacity: 0.5 }}>
                        <div className="skeleton-pulse" style={{ height: 28, width: '60%', borderRadius: 6, marginBottom: 16 }}></div>
                        {[1,2,3].map(j => (
                            <div key={j} className="skeleton-pulse" style={{ height: 72, borderRadius: 10, marginBottom: 10 }}></div>
                        ))}
                    </div>
                ))}
            </>
        );
        if (etapas.length === 0) return (
            <button className="ghost-column-placeholder" onClick={() => setCreateOpen(true)} style={{ width: 320 }}>
                <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                <span className="ghost-text">{t('kanban.newStage')}</span>
                <span style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: 5, fontWeight: 'normal' }}>Crea tu primera etapa para comenzar</span>
            </button>
        );
        return (
            <>
                {etapas.map(etapa => (
                    <KanbanColumn
                        key={etapa.id}
                        etapa={etapa}
                        clientes={clientesForEtapa(etapa.id)}
                        onOpenChat={setOpenChatId}
                        onEditStage={setEditStage}
                        onDeleteStage={setDeleteStage}
                        onDropCard={handleDropCard}
                        onDropColumn={handleDropColumn}
                        mutedStages={mutedStages}
                        onToggleMute={toggleMute}
                        onMakeMain={() => {}}
                    />
                ))}
                <button className="ghost-column-placeholder" onClick={() => setCreateOpen(true)} style={{ marginTop: 0, minWidth: 250, flexShrink: 0 }}>
                    <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                    <span className="ghost-text">{t('kanban.newStage')}</span>
                </button>
            </>
        );
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="header-top" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', padding: '0 25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="fa-solid fa-filter" style={{ color: 'var(--brand-green)' }}></i> {t('kanban.title')}
                    </div>

                    {/* FIX: filter dropdown with inline styles so it shows correctly without CSS class dependency */}
                    <div className="filter-dd-wrapper" ref={filterRef} style={{ position: 'relative' }}>
                        <button
                            className="filter-dd-btn"
                            onClick={() => setShowFilterMenu(p => !p)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 8,
                                padding: '6px 12px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                            }}
                        >
                            <span>{filterLabel || t('kanban.allLabels')}</span>
                            <i className="fas fa-chevron-down" style={{ fontSize: '0.7rem', color: '#a6b3bd', transition: 'transform 0.2s', transform: showFilterMenu ? 'rotate(180deg)' : 'none' }}></i>
                        </button>
                        {showFilterMenu && (
                            <div
                                className="filter-dd-menu show"
                                style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                                    background: '#1a1f2e',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 10,
                                    minWidth: 200,
                                    zIndex: 999,
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                    overflow: 'hidden',
                                    padding: '4px 0',
                                }}
                            >
                                <button
                                    className="filter-item"
                                    onClick={() => selectFilter('', '')}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', width: '100%', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <i className="fas fa-layer-group" style={{ color: '#a6b3bd', fontSize: '0.8rem' }}></i> {t('kanban.allLabels')}
                                </button>
                                {etiquetas.length > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }}></div>}
                                {etiquetas.map(t => (
                                    <button
                                        key={t.id}
                                        className="filter-item"
                                        onClick={() => selectFilter(t.id, t.nombre)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', width: '100%', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#10b981', display: 'inline-block', flexShrink: 0 }}></span>
                                        {t.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="search-wrapper">
                        <i className="fas fa-search"></i>
                        <input placeholder={t('kanban.search')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                </div>

                {/* FIX: NotificationBell removed from here — now globally in MainLayout */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }} title={connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'reconnecting' ? 'Reconectando...' : connectionStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}>
                        <span className={`ws-status-dot ${connectionStatus}`}></span>
                        <i className="fas fa-user" style={{ opacity: 0.6 }}></i> {usuario}
                    </span>
                    <NotificationBell />
                </div>
            </div>

            <div id="tablero" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', overflowX: 'scroll', overflowY: 'hidden', gap: 20, padding: '20px 25px 60px', width: '100%', height: 'calc(100vh - 80px)', alignItems: 'flex-start', scrollBehavior: 'smooth' }}>
                {renderBoard()}
            </div>

            {openChatId && <ChatModal clienteId={openChatId} etapas={etapas} stompClient={stompRef.current} usuario={usuario} onClose={() => setOpenChatId(null)} onMoveCard={handleDropCard} onUpdateCard={handleUpdateCard} />}
            <CreateStageModal show={createOpen} onClose={() => setCreateOpen(false)} agenciaId={agenciaId} />
            <EditStageModal show={!!editStage} stage={editStage} onClose={() => setEditStage(null)} />
            <DeleteStageModal show={!!deleteStage} stage={deleteStage} onClose={() => setDeleteStage(null)} />
        </div>
    );
}