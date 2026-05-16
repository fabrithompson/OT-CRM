import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import useWebSocket from '../hooks/useWebSocket';

// ─── Paleta del módulo (coherente con el resto del CRM) ──────────────────────
const COLOR_AMBER       = '#f59e0b';
const COLOR_AMBER_SOFT  = 'rgba(245,158,11,0.10)';
const COLOR_GREEN       = '#10b981';
const COLOR_GREEN_SOFT  = 'rgba(16,185,129,0.12)';
const COLOR_RED         = '#ef4444';
const COLOR_BORDER      = 'rgba(255,255,255,0.08)';
const COLOR_BORDER_SOFT = 'rgba(255,255,255,0.04)';
const COLOR_CARD_BG     = 'var(--bg-card, rgba(255,255,255,0.03))';
const COLOR_TEXT        = 'var(--text-main, #fff)';
const COLOR_TEXT_MUTED  = 'var(--text-muted, #94a3b8)';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ─── Modal con flow QR integrado ──────────────────────────────────────────────
function AddDeviceModal({ active, onClose, onCreated }) {
    const [alias, setAlias] = useState('');
    const [creating, setCreating] = useState(false);
    const [qr, setQr] = useState(null);
    const [device, setDevice] = useState(null);
    const [statusMsg, setStatusMsg] = useState('');
    const pollRef = useRef(null);
    const toast = useToast();

    useEffect(() => {
        if (!active) {
            setAlias(''); setQr(null); setDevice(null); setStatusMsg('');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
    }, [active]);

    const crear = async () => {
        if (!alias.trim()) { toast('Aviso', 'Poné un alias para el número', COLOR_AMBER); return; }
        setCreating(true);
        try {
            const { data } = await api.post('/campania/devices', { alias: alias.trim() });
            setDevice(data);
            setStatusMsg('Generando QR...');
            startPolling(data.id);
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error creando dispositivo', COLOR_RED);
        } finally { setCreating(false); }
    };

    const startPolling = (deviceId) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await api.get(`/whatsapp/${deviceId}/qr`);
                if (data.qr) { setQr(data.qr); setStatusMsg('Escaneá el QR con WhatsApp'); }
                if (data.status === 'CONNECTED') {
                    clearInterval(pollRef.current); pollRef.current = null;
                    toast('Vinculado', 'Número conectado correctamente', COLOR_GREEN);
                    onCreated?.();
                    onClose();
                }
            } catch { /* sigue intentando */ }
        }, 2500);
    };

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" style={{ maxWidth: 420 }}>
                <h3 style={{
                    margin: '0 0 5px', fontSize: '1.4rem',
                    background: 'linear-gradient(to right, #fff, #aebac1)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                    Agregar número de campaña
                </h3>
                {!device && (
                    <>
                        <p style={{ color: COLOR_TEXT_MUTED, fontSize: '0.9rem', marginBottom: 18 }}>
                            Usá un <strong>chip aparte</strong>, no el número principal del negocio.
                            Si lo banean, perdés solo este.
                        </p>
                        <input className="clean-input" autoFocus
                            style={{ width: '100%', marginBottom: 20 }}
                            placeholder="Alias (ej: Burner-01)"
                            value={alias} autoComplete="off"
                            onChange={e => setAlias(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && crear()} />
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={onClose} disabled={creating}>
                                Cancelar
                            </button>
                            <button className="btn-modal btn-confirm" onClick={crear} disabled={creating}>
                                {creating ? <i className="fas fa-spinner fa-spin"></i> : 'Crear'}
                            </button>
                        </div>
                    </>
                )}
                {device && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: COLOR_TEXT_MUTED, marginBottom: 14 }}>{statusMsg}</p>
                        {qr && (
                            <img src={qr} alt="QR"
                                style={{ width: 260, height: 260, borderRadius: 12,
                                    border: '4px solid white', margin: '0 auto', display: 'block' }} />
                        )}
                        {!qr && <div className="spinner" style={{ margin: '20px auto' }}></div>}
                        <div className="modal-actions" style={{ marginTop: 20 }}>
                            <button className="btn-modal btn-cancel" onClick={onClose}>Cerrar</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
AddDeviceModal.propTypes = {
    active: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCreated: PropTypes.func,
};

// ─── Panel izquierdo: contactos + plantilla + envío ──────────────────────────
function ContactosPanel({ deviceId, contactos, onReload }) {
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [plantilla, setPlantilla] = useState('Hola {nombre}, te escribo de...');
    const [enviando, setEnviando] = useState(false);
    const fileRef = useRef(null);
    const toast = useToast();

    useEffect(() => { setSeleccionados(new Set()); }, [deviceId]);

    const importar = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        try {
            const { data } = await api.post(
                `/campania/devices/${deviceId}/contactos/import`, form,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            toast('Listo', `Importados: ${data.importados} · Duplicados: ${data.duplicados} · Inválidos: ${data.invalidos}`, COLOR_GREEN);
            onReload();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error importando', COLOR_RED);
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const toggleUno = (id) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleTodos = () => {
        if (seleccionados.size === contactos.length) setSeleccionados(new Set());
        else setSeleccionados(new Set(contactos.map(c => c.id)));
    };

    const enviar = async () => {
        if (!deviceId) { toast('Aviso', 'Seleccioná un número', COLOR_AMBER); return; }
        if (seleccionados.size === 0) { toast('Aviso', 'Seleccioná al menos un contacto', COLOR_AMBER); return; }
        if (!plantilla.trim()) { toast('Aviso', 'La plantilla está vacía', COLOR_AMBER); return; }
        setEnviando(true);
        try {
            const { data } = await api.post('/campania/enviar', {
                dispositivoId: deviceId,
                cuerpo: plantilla,
                contactoIds: Array.from(seleccionados),
            });
            toast('Campaña encolada', `Encolados: ${data.encolados} · Salteados: ${data.salteados}`, COLOR_GREEN);
            setSeleccionados(new Set());
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error enviando', COLOR_RED);
        } finally { setEnviando(false); }
    };

    return (
        <div style={panelStyle}>
            <div style={panelHeaderStyle}>
                <span><i className="fas fa-users" style={{ color: COLOR_AMBER, marginRight: 8 }}></i> Contactos del sector</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importar} />
                <button onClick={() => fileRef.current?.click()} style={btnSmall} disabled={!deviceId}>
                    <i className="fas fa-file-upload"></i> Importar Excel
                </button>
            </div>

            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${COLOR_BORDER}` }}>
                <label style={{ color: COLOR_TEXT_MUTED, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox"
                        checked={contactos.length > 0 && seleccionados.size === contactos.length}
                        onChange={toggleTodos}
                        style={{ marginRight: 8 }} />
                    Seleccionar todos ({seleccionados.size}/{contactos.length})
                </label>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {contactos.length === 0 && (
                    <p style={{ padding: 20, color: COLOR_TEXT_MUTED, textAlign: 'center', fontSize: 13 }}>
                        Sin contactos. Importá un Excel con columnas <strong>Nombre</strong> y <strong>Teléfono</strong>.
                    </p>
                )}
                {contactos.map(c => (
                    <div key={c.id} style={{
                        ...contactoRowStyle,
                        background: seleccionados.has(c.id) ? COLOR_AMBER_SOFT : 'transparent',
                    }} onClick={() => toggleUno(c.id)}>
                        <input type="checkbox" checked={seleccionados.has(c.id)}
                            onChange={() => toggleUno(c.id)}
                            style={{ marginRight: 12 }}
                            onClick={e => e.stopPropagation()} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: COLOR_TEXT, fontSize: 14 }}>{c.nombre}</div>
                            <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12, fontFamily: 'monospace' }}>{c.telefono}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: 12, borderTop: `1px solid ${COLOR_BORDER}` }}>
                <label style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>
                    Mensaje (usá {'{nombre}'} para personalizar)
                </label>
                <textarea
                    value={plantilla}
                    onChange={e => setPlantilla(e.target.value)}
                    rows={3}
                    className="clean-input no-resize"
                    style={{ width: '100%', marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} />
                <button
                    onClick={enviar}
                    disabled={enviando || seleccionados.size === 0 || !deviceId}
                    style={{ ...btnPrimary, width: '100%', marginTop: 8 }}>
                    {enviando
                        ? <><i className="fas fa-spinner fa-spin"></i> Encolando...</>
                        : <><i className="fas fa-paper-plane"></i> Enviar campaña ({seleccionados.size})</>}
                </button>
            </div>
        </div>
    );
}
ContactosPanel.propTypes = {
    deviceId: PropTypes.number,
    contactos: PropTypes.array.isRequired,
    onReload: PropTypes.func.isRequired,
};

// ─── Panel derecho: bandeja + conversación ────────────────────────────────────
function ChatPanel({ bandeja, contactoActivo, mensajes, onSelectContacto, onResponder }) {
    const [borrador, setBorrador] = useState('');
    const [enviando, setEnviando] = useState(false);
    const msgEndRef = useRef(null);
    const toast = useToast();

    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensajes]);

    const enviar = async () => {
        if (!borrador.trim() || !contactoActivo) return;
        setEnviando(true);
        try {
            await onResponder(contactoActivo.contactoId, borrador);
            setBorrador('');
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error enviando', COLOR_RED);
        } finally { setEnviando(false); }
    };

    return (
        <div style={{ ...panelStyle, flex: 1.4 }}>
            <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
                {/* Bandeja */}
                <div style={{
                    width: 260,
                    borderRight: `1px solid ${COLOR_BORDER}`,
                    display: 'flex', flexDirection: 'column', minHeight: 0
                }}>
                    <div style={panelHeaderStyle}>
                        <span><i className="fas fa-inbox" style={{ color: COLOR_AMBER, marginRight: 8 }}></i> Chats activos</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        {bandeja.length === 0 && (
                            <p style={{ padding: 16, color: COLOR_TEXT_MUTED, fontSize: 13, textAlign: 'center' }}>
                                Cuando alguien responda a la campaña aparecerá acá.
                            </p>
                        )}
                        {bandeja.map(item => (
                            <div key={item.contactoId}
                                onClick={() => onSelectContacto(item)}
                                style={{
                                    padding: '10px 14px', cursor: 'pointer',
                                    background: contactoActivo?.contactoId === item.contactoId ? COLOR_AMBER_SOFT : 'transparent',
                                    borderLeft: contactoActivo?.contactoId === item.contactoId
                                        ? `3px solid ${COLOR_AMBER}` : '3px solid transparent',
                                    borderBottom: `1px solid ${COLOR_BORDER_SOFT}`
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <div style={{ color: COLOR_TEXT, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.nombre}
                                    </div>
                                    {item.noLeidos > 0 && (
                                        <span style={{
                                            background: COLOR_GREEN, color: '#000', fontSize: 11, fontWeight: 700,
                                            padding: '2px 7px', borderRadius: 10
                                        }}>{item.noLeidos}</span>
                                    )}
                                </div>
                                <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12, fontFamily: 'monospace' }}>{item.telefono}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Conversación */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {!contactoActivo && (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', color: COLOR_TEXT_MUTED
                        }}>
                            <i className="fas fa-comments" style={{ fontSize: 48, opacity: 0.25 }}></i>
                            <p style={{ marginTop: 12 }}>Seleccioná un chat de la bandeja</p>
                        </div>
                    )}
                    {contactoActivo && (
                        <>
                            <div style={{ ...panelHeaderStyle, justifyContent: 'flex-start' }}>
                                <div>
                                    <div style={{ color: COLOR_TEXT, fontSize: 14, fontWeight: 600 }}>{contactoActivo.nombre}</div>
                                    <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12, fontFamily: 'monospace' }}>{contactoActivo.telefono}</div>
                                </div>
                            </div>
                            <div style={{
                                flex: 1, overflowY: 'auto', padding: 14,
                                background: 'rgba(0,0,0,0.15)', minHeight: 0,
                                display: 'flex', flexDirection: 'column', gap: 6
                            }}>
                                {mensajes.map(m => (
                                    <div key={m.id} style={{
                                        display: 'flex',
                                        justifyContent: m.direccion === 'OUT' ? 'flex-end' : 'flex-start'
                                    }}>
                                        <div style={{
                                            maxWidth: '72%',
                                            background: m.direccion === 'OUT' ? COLOR_GREEN_SOFT : 'rgba(255,255,255,0.06)',
                                            border: m.direccion === 'OUT'
                                                ? `1px solid rgba(16,185,129,0.3)`
                                                : `1px solid ${COLOR_BORDER}`,
                                            color: COLOR_TEXT,
                                            padding: '8px 12px', borderRadius: 12,
                                            fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap'
                                        }}>
                                            {m.texto}
                                            <div style={{ fontSize: 10, opacity: 0.6, textAlign: 'right', marginTop: 4 }}>
                                                {formatHora(m.fecha)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={msgEndRef} />
                            </div>
                            <div style={{
                                padding: 10, borderTop: `1px solid ${COLOR_BORDER}`,
                                display: 'flex', gap: 8
                            }}>
                                <input type="text" value={borrador}
                                    onChange={e => setBorrador(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                    placeholder="Escribí un mensaje..."
                                    className="clean-input"
                                    style={{ flex: 1, borderRadius: 20 }} />
                                <button onClick={enviar} disabled={enviando || !borrador.trim()} style={btnPrimary}>
                                    {enviando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
ChatPanel.propTypes = {
    bandeja: PropTypes.array.isRequired,
    contactoActivo: PropTypes.object,
    mensajes: PropTypes.array.isRequired,
    onSelectContacto: PropTypes.func.isRequired,
    onResponder: PropTypes.func.isRequired,
};

// ─── Página principal ────────────────────────────────────────────────────────
export default function Spam() {
    const toast = useToast();
    const { agenciaId } = useUser();

    const [devices, setDevices] = useState([]);
    const [deviceActivoId, setDeviceActivoId] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [contactos, setContactos] = useState([]);
    const [bandeja, setBandeja] = useState([]);
    const [contactoActivo, setContactoActivo] = useState(null);
    const [mensajes, setMensajes] = useState([]);

    // Refs espejo del estado: el callback de useWebSocket sólo se ejecuta una
    // vez por conexión, así que sin refs lee valores stale del primer render.
    const deviceActivoIdRef = useRef(null);
    const contactoActivoRef = useRef(null);
    useEffect(() => { deviceActivoIdRef.current = deviceActivoId; }, [deviceActivoId]);
    useEffect(() => { contactoActivoRef.current = contactoActivo; }, [contactoActivo]);

    // ── Loaders ──────────────────────────────────────────────────────────────
    const loadDevices = useCallback(async () => {
        try {
            const { data } = await api.get('/campania/devices');
            setDevices(data || []);
            setDeviceActivoId(prev => prev || (data?.[0]?.id ?? null));
        } catch {
            toast('Error', 'No se pudieron cargar los números', COLOR_RED);
        }
    }, [toast]);

    const loadContactos = useCallback(async (devId) => {
        if (!devId) { setContactos([]); return; }
        try {
            const { data } = await api.get(`/campania/devices/${devId}/contactos`);
            setContactos(data || []);
        } catch { /* silencio */ }
    }, []);

    const loadBandeja = useCallback(async (devId) => {
        if (!devId) { setBandeja([]); return; }
        try {
            const { data } = await api.get(`/campania/devices/${devId}/bandeja`);
            setBandeja(data || []);
        } catch { /* silencio */ }
    }, []);

    const loadMensajes = useCallback(async (contactoId) => {
        if (!contactoId) { setMensajes([]); return; }
        try {
            const { data } = await api.get(`/campania/contactos/${contactoId}/mensajes`);
            setMensajes(data || []);
        } catch { /* silencio */ }
    }, []);

    // ── Carga inicial ────────────────────────────────────────────────────────
    useEffect(() => { loadDevices(); }, [loadDevices]);
    useEffect(() => {
        if (deviceActivoId) {
            loadContactos(deviceActivoId);
            loadBandeja(deviceActivoId);
            setContactoActivo(null);
            setMensajes([]);
        }
    }, [deviceActivoId, loadContactos, loadBandeja]);

    // ── WebSocket: tiempo real para estado de devices + chats ────────────────
    useWebSocket(agenciaId, () => { }, (client) => {
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const payload = JSON.parse(msg.body);
                if (payload?.sessionId) {
                    setDevices(prev => prev.map(d => d.sessionId === payload.sessionId
                        ? { ...d, estado: payload.status || payload.tipo || d.estado }
                        : d));
                    if (payload.status === 'CONNECTED') {
                        loadDevices(); // refresca para obtener numeroTelefono
                    }
                }
            } catch { /* ignorar */ }
        });

        client.subscribe(`/topic/campania/${agenciaId}`, (msg) => {
            try {
                const payload = JSON.parse(msg.body);
                if (payload.tipo === 'MENSAJE_IN' || payload.tipo === 'MENSAJE_OUT') {
                    const devId = deviceActivoIdRef.current;
                    const ctActivo = contactoActivoRef.current;
                    if (devId) loadBandeja(devId);
                    if (ctActivo?.contactoId === payload.contactoId) {
                        loadMensajes(payload.contactoId);
                    }
                }
            } catch { /* ignorar */ }
        });
    });

    // ── Acciones ─────────────────────────────────────────────────────────────
    const eliminarDevice = async (deviceId) => {
        if (!confirm('¿Eliminar este número de campaña? Se borran sus contactos, chats y plantillas.')) return;
        try {
            await api.delete(`/campania/devices/${deviceId}`);
            toast('Eliminado', 'Número y sus chats borrados', COLOR_GREEN);
            if (deviceActivoId === deviceId) {
                setDeviceActivoId(null);
                setContactos([]); setBandeja([]); setContactoActivo(null); setMensajes([]);
            }
            loadDevices();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error eliminando', COLOR_RED);
        }
    };

    const seleccionarContacto = (item) => {
        setContactoActivo(item);
        loadMensajes(item.contactoId);
    };

    const responder = async (contactoId, texto) => {
        await api.post(`/campania/contactos/${contactoId}/responder`, { texto });
        loadMensajes(contactoId);
        if (deviceActivoId) loadBandeja(deviceActivoId);
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100vh', padding: 16, gap: 12,
            background: 'var(--bg-main, #0b0b0e)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: COLOR_CARD_BG, padding: '12px 16px', borderRadius: 12,
                border: `1px solid ${COLOR_BORDER}`, flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <i className="fas fa-bullhorn" style={{ color: COLOR_AMBER, fontSize: 22 }}></i>
                    <div>
                        <h2 style={{ color: COLOR_TEXT, margin: 0, fontSize: 18 }}>Campañas</h2>
                        <p style={{ color: COLOR_TEXT_MUTED, margin: 0, fontSize: 12 }}>
                            Sector aislado del embudo principal. Usá un chip aparte.
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {devices.length > 0 && (
                        <select
                            value={deviceActivoId || ''}
                            onChange={e => setDeviceActivoId(Number(e.target.value))}
                            style={{
                                padding: '8px 12px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)', color: COLOR_TEXT,
                                border: `1px solid ${COLOR_BORDER}`, cursor: 'pointer'
                            }}>
                            {devices.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.alias} {d.numeroTelefono ? `(${d.numeroTelefono})` : '(sin vincular)'} — {d.estado}
                                </option>
                            ))}
                        </select>
                    )}
                    {deviceActivoId && (
                        <button onClick={() => eliminarDevice(deviceActivoId)} style={btnDanger} title="Eliminar número activo">
                            <i className="fas fa-trash-alt"></i>
                        </button>
                    )}
                    <button onClick={() => setShowAddModal(true)} style={btnPrimary}>
                        <i className="fas fa-plus"></i> Agregar número
                    </button>
                </div>
            </div>

            {/* Contenido principal */}
            <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
                {devices.length === 0 ? (
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', color: COLOR_TEXT_MUTED,
                        background: COLOR_CARD_BG, borderRadius: 12,
                        border: `1px dashed ${COLOR_BORDER}`
                    }}>
                        <i className="fas fa-bullhorn" style={{ fontSize: 56, opacity: 0.3, color: COLOR_AMBER }}></i>
                        <h3 style={{ color: COLOR_TEXT, marginTop: 16 }}>Sin números de campaña</h3>
                        <p style={{ maxWidth: 380, textAlign: 'center', fontSize: 14 }}>
                            Agregá un número aparte (no el principal del negocio) para mandar campañas masivas.
                            Cuando alguien responda, vas a poder chatear acá y pasarle el número principal cuando madure el lead.
                        </p>
                        <button onClick={() => setShowAddModal(true)} style={{ ...btnPrimary, marginTop: 12 }}>
                            <i className="fas fa-plus"></i> Agregar primer número
                        </button>
                    </div>
                ) : (
                    <>
                        <ContactosPanel deviceId={deviceActivoId} contactos={contactos}
                            onReload={() => loadContactos(deviceActivoId)} />
                        <ChatPanel bandeja={bandeja} contactoActivo={contactoActivo}
                            mensajes={mensajes}
                            onSelectContacto={seleccionarContacto}
                            onResponder={responder} />
                    </>
                )}
            </div>

            <AddDeviceModal active={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={loadDevices} />
        </div>
    );
}

// ─── Estilos inline con paleta del CRM ────────────────────────────────────────
const panelStyle = {
    flex: 1,
    background: COLOR_CARD_BG,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
};
const panelHeaderStyle = {
    padding: '10px 14px',
    borderBottom: `1px solid ${COLOR_BORDER}`,
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
    flexShrink: 0,
};
const btnPrimary = {
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: COLOR_AMBER, color: '#000', fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 8,
};
const btnSmall = {
    padding: '6px 10px', borderRadius: 6, border: `1px solid ${COLOR_BORDER}`,
    background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
};
const btnDanger = {
    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: COLOR_RED, color: '#fff',
};
const contactoRowStyle = {
    display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer',
    borderBottom: `1px solid ${COLOR_BORDER_SOFT}`, transition: 'background 0.15s',
};
