import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import { useUser } from '../context/UserContext';
import { getDisplayName } from '../utils/userUtils';
import ChatModal from '../components/kanban/ChatModal';
import EmptyState from '../components/ui/EmptyState';
import '../assets/css/pages/Chats.css';

const PAGE_SIZE = 30;
const FILTROS = [
    ['TODOS', 'chats.all'],
    ['NO_LEIDOS', 'chats.unread'],
    ['WHATSAPP', 'WhatsApp'],
    ['TELEGRAM', 'Telegram'],
];

const fechaDe = (c) => {
    const t = c?.ultimoMensajeFecha ? Date.parse(c.ultimoMensajeFecha) : Number.NaN;
    return Number.isNaN(t) ? 0 : t;
};
const ordenar = (lista) => [...lista].sort((a, b) => fechaDe(b) - fechaDe(a) || b.id - a.id);

/** Hora si es de hoy, "Ayer", día de la semana si es de esta semana, si no la fecha corta. */
function horaLista(iso, t, lang) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    const dia = 24 * 60 * 60 * 1000;
    if (d.getTime() >= inicioHoy) return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d.getTime() >= inicioHoy - dia) return t('chats.yesterday');
    if (d.getTime() >= inicioHoy - 6 * dia) return d.toLocaleDateString(lang, { weekday: 'long' });
    return d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Normaliza el aviso de /topic/embudo (o un cliente completo) a los campos de la lista. */
function cambiosDesdeEvento(data) {
    const cambios = {
        nombre: data.nombre,
        ultimoMensajeResumen: data.ultimoMensaje ?? data.ultimoMensajeResumen,
        ultimoMensajeFecha: data.ultimoMensajeFecha,
        mensajesSinLeer: data.mensajesSinLeer,
        fotoUrl: data.avatarUrl || data.fotoUrl,
        origen: data.origen,
        nombreInstancia: data.nombreInstancia,
    };
    Object.keys(cambios).forEach(k => cambios[k] === undefined && delete cambios[k]);
    return cambios;
}

function FilaChat({ chat, activo, onAbrir }) {
    const { t, lang } = useLanguage();
    const esTelegram = (chat.origen || '').toUpperCase() === 'TELEGRAM';
    const sinLeer = chat.mensajesSinLeer || 0;
    return (
        <li>
            <button type="button" className={`chat-fila${activo ? ' is-active' : ''}${sinLeer > 0 ? ' is-unread' : ''}`}
                onClick={() => onAbrir(chat.id)} aria-current={activo ? 'true' : undefined}>
                <span className="chat-fila__avatar" aria-hidden="true">
                    {chat.fotoUrl ? <img src={chat.fotoUrl} alt="" loading="lazy" /> : (chat.nombre || '?').charAt(0).toUpperCase()}
                    <i className={`chat-fila__canal ${esTelegram ? 'fab fa-telegram-plane is-tg' : 'fab fa-whatsapp is-wa'}`}></i>
                </span>
                <span className="chat-fila__cuerpo">
                    <span className="chat-fila__linea">
                        <span className="chat-fila__nombre">{chat.nombre || chat.telefono}</span>
                        <span className="chat-fila__hora">{horaLista(chat.ultimoMensajeFecha, t, lang)}</span>
                    </span>
                    <span className="chat-fila__linea">
                        <span className="chat-fila__preview">{chat.ultimoMensajeResumen || ' '}</span>
                        {sinLeer > 0 && <span className="chat-fila__badge" aria-label={`${sinLeer} ${t('chats.unread')}`}>{sinLeer > 99 ? '99+' : sinLeer}</span>}
                    </span>
                    {chat.nombreInstancia && chat.nombreInstancia !== 'TELEGRAM' && (
                        <span className="chat-fila__instancia">{chat.nombreInstancia}</span>
                    )}
                </span>
            </button>
        </li>
    );
}

export default function Chats() {
    const { t } = useLanguage();
    const toast = useToast();
    const { usuario: userCtx, agenciaId } = useUser();
    const usuario = userCtx ? getDisplayName(userCtx) : 'Agente';
    const [searchParams, setSearchParams] = useSearchParams();

    const [chats, setChats]           = useState([]);
    const [etapas, setEtapas]         = useState([]);
    const [filtro, setFiltro]         = useState('TODOS');
    const [busqueda, setBusqueda]     = useState('');
    const [termino, setTermino]       = useState('');
    const [cargando, setCargando]     = useState(true);
    const [hayMas, setHayMas]         = useState(false);
    const [seleccionado, setSeleccionado] = useState(() => {
        const id = Number.parseInt(searchParams.get('chat'), 10);
        return Number.isNaN(id) ? null : id;
    });

    const paginaRef   = useRef(0);
    const pedidoRef   = useRef(0);   // descarta respuestas de una búsqueda/filtro anterior
    const cargandoRef = useRef(false);

    // La búsqueda se manda 300 ms después de dejar de escribir
    useEffect(() => {
        const timer = setTimeout(() => setTermino(busqueda.trim()), 300);
        return () => clearTimeout(timer);
    }, [busqueda]);

    const pedir = useCallback((pagina) => {
        const params = new URLSearchParams({ filtro, page: String(pagina), size: String(PAGE_SIZE) });
        if (termino) params.set('q', termino);
        return api.get(`/chat/conversaciones?${params}`).then(res => (Array.isArray(res.data) ? res.data : []));
    }, [filtro, termino]);

    // Primera página (al entrar o al cambiar filtro/búsqueda)
    useEffect(() => {
        const pedido = ++pedidoRef.current;
        paginaRef.current = 0;
        cargandoRef.current = true;
        // Muestra el esqueleto mientras llega la página nueva del servidor
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCargando(true);
        pedir(0)
            .then(lista => {
                if (pedido !== pedidoRef.current) return;
                setChats(lista);
                setHayMas(lista.length === PAGE_SIZE);
            })
            .catch(() => { if (pedido === pedidoRef.current) toast(t('common.errorTitle'), t('chats.errLoad'), '#ef4444'); })
            .finally(() => {
                if (pedido !== pedidoRef.current) return;
                cargandoRef.current = false;
                setCargando(false);
            });
    }, [pedir, toast, t]);

    const cargarMas = useCallback(() => {
        if (cargandoRef.current || !hayMas) return;
        const pedido = pedidoRef.current;
        const pagina = paginaRef.current + 1;
        cargandoRef.current = true;
        pedir(pagina)
            .then(lista => {
                if (pedido !== pedidoRef.current) return;
                paginaRef.current = pagina;
                setHayMas(lista.length === PAGE_SIZE);
                setChats(prev => {
                    const ids = new Set(prev.map(c => c.id));
                    return [...prev, ...lista.filter(c => !ids.has(c.id))];
                });
            })
            .catch(() => { /* el próximo scroll vuelve a intentar */ })
            .finally(() => { cargandoRef.current = false; });
    }, [hayMas, pedir]);

    // Recarga silenciosa: trae la primera página y la mezcla con lo que ya está cargado
    const refrescar = useCallback(() => {
        const pedido = pedidoRef.current;
        pedir(0).then(lista => {
            if (pedido !== pedidoRef.current) return;
            setChats(prev => {
                const porId = new Map(prev.map(c => [c.id, c]));
                lista.forEach(c => porId.set(c.id, { ...porId.get(c.id), ...c }));
                return ordenar([...porId.values()]);
            });
        }).catch(() => { /* respaldo silencioso */ });
    }, [pedir]);

    const refrescoTimer = useRef(null);
    const refrescarAgrupado = useCallback(() => {
        clearTimeout(refrescoTimer.current);
        refrescoTimer.current = setTimeout(refrescar, 1200);
    }, [refrescar]);
    useEffect(() => () => clearTimeout(refrescoTimer.current), []);

    useEffect(() => {
        api.get('/embudo/etapas').then(res => setEtapas(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    }, []);

    const actualizarChat = useCallback((id, cambios) => {
        setChats(prev => {
            if (!prev.some(c => c.id === id)) return prev;
            return ordenar(prev.map(c => (c.id === id ? { ...c, ...cambios } : c)));
        });
    }, []);

    // Mensajes nuevos: MainLayout reemite /topic/embudo como evento de ventana
    const seleccionadoRef = useRef(seleccionado);
    useEffect(() => { seleccionadoRef.current = seleccionado; }, [seleccionado]);
    const chatsRef = useRef(chats);
    useEffect(() => { chatsRef.current = chats; }, [chats]);

    useEffect(() => {
        const alLlegar = (e) => {
            const data = e.detail;
            const id = data?.clienteId || data?.id;
            if (!id) return;
            const cambios = cambiosDesdeEvento(data);
            // El chat abierto se está leyendo: no acumula "no leídos"
            if (id === seleccionadoRef.current && cambios.mensajesSinLeer > 0) {
                cambios.mensajesSinLeer = 0;
                api.put(`/clientes/${id}/leido`).catch(() => {});
            }
            if (chatsRef.current.some(c => c.id === id)) actualizarChat(id, cambios);
            else refrescarAgrupado(); // conversación que todavía no está en la lista
        };
        window.addEventListener('crm:embudo', alLlegar);
        return () => window.removeEventListener('crm:embudo', alLlegar);
    }, [actualizarChat, refrescarAgrupado]);

    const alEventoAgencia = useRef(null);
    // eslint-disable-next-line react-hooks/refs
    alEventoAgencia.current = (ev) => {
        if (!ev?.tipo) return;
        if (['REFRESCAR_KANBAN', 'HISTORIAL_IMPORTADO', 'NUEVO_LEAD'].includes(ev.tipo)) {
            refrescarAgrupado();
        } else if (ev.tipo === 'CLIENTE_ELIMINADO') {
            setChats(prev => prev.filter(c => c.id !== ev.clienteId));
            if (seleccionadoRef.current === ev.clienteId) setSeleccionado(null);
        } else if (ev.tipo === 'CLIENTE_ACTUALIZADO' && ev.clienteId && ev.nombre !== undefined) {
            actualizarChat(ev.clienteId, { nombre: ev.nombre });
        }
    };

    const { clientRef: stompRef, connectionStatus } = useWebSocket(agenciaId, (ev) => alEventoAgencia.current?.(ev), (client) => {
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try { alEventoAgencia.current?.(JSON.parse(msg.body)); }
            catch (err) { console.warn('Chats agencia payload inválido:', err); }
        });
    });

    // Respaldo del tiempo real: al reconectar y cada 30 s con la pestaña visible
    const conexionPreviaRef = useRef(null);
    useEffect(() => {
        const previa = conexionPreviaRef.current;
        conexionPreviaRef.current = connectionStatus;
        if (connectionStatus === 'connected' && previa && previa !== 'connected') refrescarAgrupado();
    }, [connectionStatus, refrescarAgrupado]);
    useEffect(() => {
        const intervalo = setInterval(() => {
            if (document.visibilityState === 'visible') refrescar();
        }, 30000);
        return () => clearInterval(intervalo);
    }, [refrescar]);

    const abrir = useCallback((id) => {
        setSeleccionado(id);
        setSearchParams(id ? { chat: String(id) } : {}, { replace: true });
    }, [setSearchParams]);

    const moverEtapa = useCallback(async (id, etapaId) => {
        try {
            await api.patch(`/clientes/${id}/etapa?nuevaEtapaId=${etapaId}`);
        } catch {
            toast(t('common.errorTitle'), t('kanban.errMove'), '#ef4444');
        }
    }, [toast, t]);

    const alScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) cargarMas();
    };

    const sinFiltros = filtro === 'TODOS' && !termino;

    return (
        <section className="page-wrapper chats-page">
            <div className={`chats-shell${seleccionado ? ' has-chat' : ''}`}>
                <aside className="chats-lista" aria-label={t('chats.title')}>
                    <div className="chats-lista__head">
                        <h2>{t('chats.title')}</h2>
                        <span className={`chats-ws chats-ws--${connectionStatus}`} title={connectionStatus} aria-hidden="true"></span>
                    </div>
                    <div className="chats-buscar">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder={t('chats.search')} aria-label={t('chats.search')} />
                    </div>
                    <div className="chats-filtros" role="tablist">
                        {FILTROS.map(([id, etiqueta]) => (
                            <button key={id} type="button" role="tab" aria-selected={filtro === id}
                                className={`chats-filtro${filtro === id ? ' is-active' : ''}`} onClick={() => setFiltro(id)}>
                                {etiqueta.startsWith('chats.') ? t(etiqueta) : etiqueta}
                            </button>
                        ))}
                    </div>

                    <div className="chats-lista__scroll" onScroll={alScroll}>
                        {cargando && chats.length === 0 ? (
                            <ul className="chats-skeleton" aria-busy="true">
                                {Array.from({ length: 8 }, (_, i) => <li key={i}><span /><span /></li>)}
                            </ul>
                        ) : chats.length === 0 ? (
                            <div className="chats-vacio">
                                {sinFiltros ? (
                                    <EmptyState icon="fas fa-comments" title={t('chats.empty')} description={t('chats.emptyHint')}
                                        action={<Link className="ui-btn ui-btn--primary" to="/whatsapp-vincular">{t('chats.linkWhatsapp')}</Link>} />
                                ) : (
                                    <EmptyState icon="fas fa-search" title={t('chats.noResults')} />
                                )}
                            </div>
                        ) : (
                            <ul className="chats-ul">
                                {chats.map(c => <FilaChat key={c.id} chat={c} activo={c.id === seleccionado} onAbrir={abrir} />)}
                            </ul>
                        )}
                    </div>
                </aside>

                <div className="chats-panel">
                    {seleccionado ? (
                        <ChatModal
                            key={seleccionado}
                            embedded
                            clienteId={seleccionado}
                            etapas={etapas}
                            // El cliente STOMP cambia junto con connectionStatus, que sí re-renderiza
                            // eslint-disable-next-line react-hooks/refs
                            stompClient={stompRef.current}
                            wsStatus={connectionStatus}
                            usuario={usuario}
                            onClose={() => abrir(null)}
                            onMoveCard={moverEtapa}
                            onUpdateCard={actualizarChat}
                        />
                    ) : (
                        <div className="chats-panel__vacio">
                            <i className="fas fa-comments" aria-hidden="true"></i>
                            <h3>{t('chats.select')}</h3>
                            <p>{t('chats.selectHint')}</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
