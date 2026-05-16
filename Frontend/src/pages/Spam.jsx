import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import { useUser } from '../context/UserContext';
import useWebSocket from '../hooks/useWebSocket';
import NotificationBell from '../components/kanban/NotificationBell';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ─── Modal base ───────────────────────────────────────────────────────────────
function Modal({ active, onClose, children }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        if (active) document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [active, onClose]);
    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal">{children}</div>
        </div>
    );
}
Modal.propTypes = { active: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, children: PropTypes.node.isRequired };

// ─── Device Card (estilo idéntico al de WhatsAppVincular, con badge "Spam") ──
function DeviceCard({ device, isActive, onSelect, onConectar, onEliminar }) {
    const connected = device.estado === 'CONNECTED';
    return (
        <div className="device-card"
            style={{ cursor: 'pointer', outline: isActive ? '2px solid var(--brand-green, #10b981)' : 'none' }}
            onClick={() => onSelect(device.id)}>
            <div className="device-header">
                <div className="device-icon" style={{ background: 'linear-gradient(135deg, #3b1f1f, #1a0f0f)', color: '#f59e0b' }}>
                    <i className="fas fa-bullhorn"></i>
                </div>
                <span className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
                    {connected ? 'Conectado' : 'Desconectado'}
                </span>
            </div>
            <div className="device-info">
                <h3>{device.alias}</h3>
                <p>{device.numeroTelefono || 'Sin vincular'}</p>
                <div className="device-meta" style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 5 }}>
                    Campaña · {String(device.sessionId || '').slice(0, 14)}
                </div>
            </div>
            <div className="device-actions">
                {!connected && (
                    <button className="btn-card-action" onClick={(e) => { e.stopPropagation(); onConectar(device.id); }}>
                        <i className="fas fa-qrcode"></i> Vincular
                    </button>
                )}
                <button className="btn-card-action btn-card-danger"
                    onClick={(e) => { e.stopPropagation(); onEliminar(device.id); }}>
                    <i className="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    );
}
DeviceCard.propTypes = {
    device: PropTypes.object.isRequired,
    isActive: PropTypes.bool,
    onSelect: PropTypes.func.isRequired,
    onConectar: PropTypes.func.isRequired,
    onEliminar: PropTypes.func.isRequired,
};

// ─── Panel de contactos + plantilla + envío ──────────────────────────────────
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
            toast('Listo', `Importados: ${data.importados} · Duplicados: ${data.duplicados} · Inválidos: ${data.invalidos}`, '#10b981');
            onReload();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error importando', '#ef4444');
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
        if (!deviceId) { toast('Aviso', 'Seleccioná un número primero', '#f59e0b'); return; }
        if (seleccionados.size === 0) { toast('Aviso', 'Seleccioná al menos un contacto', '#f59e0b'); return; }
        if (!plantilla.trim()) { toast('Aviso', 'La plantilla está vacía', '#f59e0b'); return; }
        setEnviando(true);
        try {
            const { data } = await api.post('/campania/enviar', {
                dispositivoId: deviceId,
                cuerpo: plantilla,
                contactoIds: Array.from(seleccionados),
            });
            toast('Campaña encolada', `Encolados: ${data.encolados} · Salteados: ${data.salteados}`, '#10b981');
            setSeleccionados(new Set());
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error enviando', '#ef4444');
        } finally { setEnviando(false); }
    };

    return (
        <div className="device-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.08))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main, #fff)' }}>
                        <i className="fas fa-users" style={{ marginRight: 8, color: '#f59e0b' }}></i>
                        Contactos del sector
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
                        {contactos.length} importados · {seleccionados.size} seleccionados
                    </p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importar} />
                <button className="btn-card-action" onClick={() => fileRef.current?.click()} disabled={!deviceId}
                    style={{ flex: 'none', padding: '8px 14px' }}>
                    <i className="fas fa-file-upload"></i> Importar
                </button>
            </div>

            {contactos.length > 0 && (
                <div style={{ padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <label style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox"
                            checked={contactos.length > 0 && seleccionados.size === contactos.length}
                            onChange={toggleTodos}
                            style={{ marginRight: 8 }} />
                        Seleccionar todos
                    </label>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {contactos.length === 0 && (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                        <i className="fas fa-inbox" style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 12 }}></i>
                        <p style={{ margin: 0, fontSize: 14 }}>Sin contactos importados.</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Subí un Excel con columnas <strong>Nombre</strong> y <strong>Teléfono</strong>.</p>
                    </div>
                )}
                {contactos.map(c => (
                    <div key={c.id}
                        onClick={() => toggleUno(c.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 20px', cursor: 'pointer',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: seleccionados.has(c.id) ? 'rgba(16,185,129,0.08)' : 'transparent',
                            transition: 'background 0.15s'
                        }}>
                        <input type="checkbox" checked={seleccionados.has(c.id)}
                            onChange={() => toggleUno(c.id)}
                            onClick={e => e.stopPropagation()} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--text-main, #fff)', fontSize: 14, fontWeight: 500 }}>{c.nombre}</div>
                            <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12, fontFamily: 'monospace' }}>{c.telefono}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.08))' }}>
                <label style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12, display: 'block', marginBottom: 6 }}>
                    Mensaje (usá {'{nombre}'} para personalizar)
                </label>
                <textarea
                    className="clean-input no-resize"
                    value={plantilla}
                    onChange={e => setPlantilla(e.target.value)}
                    rows={3}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                <button
                    onClick={enviar}
                    disabled={enviando || seleccionados.size === 0 || !deviceId}
                    className="btn-modal btn-confirm"
                    style={{ width: '100%', marginTop: 10, background: '#f59e0b', color: '#000' }}>
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

// ─── Panel chat (bandeja + conversación) ─────────────────────────────────────
function ChatPanel({ deviceId, bandeja, contactoActivo, mensajes, onSelectContacto, onResponder }) {
    const [borrador, setBorrador] = useState('');
    const [enviando, setEnviando] = useState(false);
    const msgEndRef = useRef(null);

    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensajes]);

    const enviar = async () => {
        if (!borrador.trim() || !contactoActivo) return;
        setEnviando(true);
        try {
            await onResponder(contactoActivo.contactoId, borrador);
            setBorrador('');
        } finally { setEnviando(false); }
    };

    return (
        <div className="device-card" style={{ display: 'flex', minHeight: 0, padding: 0, overflow: 'hidden' }}>
            {/* Bandeja */}
            <div style={{ width: 280, borderRight: '1px solid var(--border-glass, rgba(255,255,255,0.08))', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.08))' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main, #fff)' }}>
                        <i className="fas fa-inbox" style={{ marginRight: 8, color: '#f59e0b' }}></i>
                        Chats activos
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
                        {bandeja.length} conversación{bandeja.length === 1 ? '' : 'es'}
                    </p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {bandeja.length === 0 && (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: 13 }}>
                            <i className="fas fa-comment-slash" style={{ fontSize: 28, opacity: 0.3, display: 'block', marginBottom: 10 }}></i>
                            Cuando alguien responda a la campaña aparecerá acá.
                        </div>
                    )}
                    {bandeja.map(item => (
                        <div key={item.contactoId}
                            onClick={() => onSelectContacto(item)}
                            style={{
                                padding: '12px 20px', cursor: 'pointer',
                                background: contactoActivo?.contactoId === item.contactoId
                                    ? 'rgba(245,158,11,0.10)' : 'transparent',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                borderLeft: contactoActivo?.contactoId === item.contactoId
                                    ? '3px solid #f59e0b' : '3px solid transparent'
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ color: 'var(--text-main, #fff)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.nombre}
                                </div>
                                {item.noLeidos > 0 && (
                                    <span style={{ background: '#10b981', color: '#000', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>
                                        {item.noLeidos}
                                    </span>
                                )}
                            </div>
                            <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
                                {item.telefono}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Conversación */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {!contactoActivo && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #64748b)' }}>
                        <i className="fas fa-comments" style={{ fontSize: 56, opacity: 0.2 }}></i>
                        <p style={{ marginTop: 14, fontSize: 14 }}>Seleccioná un chat de la bandeja</p>
                    </div>
                )}
                {contactoActivo && (
                    <>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.08))' }}>
                            <div style={{ color: 'var(--text-main, #fff)', fontSize: 15, fontWeight: 600 }}>{contactoActivo.nombre}</div>
                            <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12, fontFamily: 'monospace' }}>{contactoActivo.telefono}</div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {mensajes.map(m => (
                                <div key={m.id} style={{ display: 'flex', justifyContent: m.direccion === 'OUT' ? 'flex-end' : 'flex-start' }}>
                                    <div style={{
                                        maxWidth: '72%',
                                        background: m.direccion === 'OUT' ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.06)',
                                        color: 'var(--text-main, #fff)',
                                        padding: '8px 12px', borderRadius: 12,
                                        fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                        border: m.direccion === 'OUT' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.08)'
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
                        <div style={{ padding: 12, borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.08))', display: 'flex', gap: 8 }}>
                            <input className="clean-input" type="text" value={borrador}
                                onChange={e => setBorrador(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                placeholder="Escribí un mensaje..."
                                style={{ flex: 1 }} />
                            <button onClick={enviar} disabled={enviando || !borrador.trim()}
                                className="btn-modal btn-confirm"
                                style={{ width: 48, padding: 0 }}>
                                {enviando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
ChatPanel.propTypes = {
    deviceId: PropTypes.number,
    bandeja: PropTypes.array.isRequired,
    contactoActivo: PropTypes.object,
    mensajes: PropTypes.array.isRequired,
    onSelectContacto: PropTypes.func.isRequired,
    onResponder: PropTypes.func.isRequired,
};

// ─── Página principal ────────────────────────────────────────────────────────
export default function Spam() {
    const { t } = useLanguage();
    const toast = useToast();
    const { agenciaId } = useUser();

    const [devices, setDevices] = useState([]);
    const [deviceActivoId, setDeviceActivoId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [contactos, setContactos] = useState([]);
    const [bandeja, setBandeja] = useState([]);
    const [contactoActivo, setContactoActivo] = useState(null);
    const [mensajes, setMensajes] = useState([]);

    // Modales
    const [modalCrear, setModalCrear] = useState(false);
    const [modalEliminar, setModalEliminar] = useState(false);
    const [modalQr, setModalQr] = useState(false);
    const [alias, setAlias] = useState('');
    const [creando, setCreando] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [pendingDeviceId, setPendingDeviceId] = useState(null);
    const [qrSrc, setQrSrc] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);

    const qrIntervalRef = useRef(null);
    const qrModalOpenRef = useRef(false);

    // Refs espejo del estado: el callback de useWebSocket sólo se ejecuta una
    // vez por conexión, así que sin refs lee valores stale del primer render.
    const deviceActivoIdRef = useRef(deviceActivoId);
    const contactoActivoRef = useRef(contactoActivo);
    useEffect(() => { deviceActivoIdRef.current = deviceActivoId; }, [deviceActivoId]);
    useEffect(() => { contactoActivoRef.current = contactoActivo; }, [contactoActivo]);

    // ── Loaders ──────────────────────────────────────────────────────────────
    // Sin dep deviceActivoId: usamos el setter funcional para auto-seleccionar
    // el primer device, así el callback es estable y los WS closures no quedan stale.
    const loadDevices = useCallback(async () => {
        try {
            const { data } = await api.get('/campania/devices');
            setDevices(data || []);
            setDeviceActivoId(prev => prev || (data?.[0]?.id ?? null));
        } catch {
            toast('Error', 'No se pudieron cargar los números', '#ef4444');
        } finally { setLoading(false); }
    }, [toast]);

    const loadContactos = useCallback(async (devId) => {
        if (!devId) { setContactos([]); return; }
        try {
            const { data } = await api.get(`/campania/devices/${devId}/contactos`);
            setContactos(data || []);
        } catch { /* silencio: no contamina la vista */ }
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

    // ── WebSocket: estado de devices + eventos de campaña ────────────────────
    useWebSocket(agenciaId, () => { }, (client) => {
        // Cambios de estado de devices (CONNECTED/DISCONNECTED) — mismo topic
        // que usa /whatsapp-vincular; acá filtramos solo los CAMPANIAS conocidos.
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const payload = JSON.parse(msg.body);
                if (payload?.sessionId) {
                    setDevices(prev => prev.map(d => d.sessionId === payload.sessionId
                        ? { ...d, estado: payload.status || payload.tipo || d.estado }
                        : d));
                    // Si era el QR que estábamos esperando y conectó, cerrar modal
                    if (payload.status === 'CONNECTED' && qrModalOpenRef.current) {
                        cerrarQr();
                        toast('Vinculado', 'Número conectado correctamente', '#10b981');
                        loadDevices(); // refresca para obtener numeroTelefono
                    }
                }
            } catch { /* ignorar */ }
        });

        // Eventos del propio CampaniaService: MENSAJE_IN, MENSAJE_OUT, ENVIO_PROCESADO
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
                // ENVIO_PROCESADO: no necesita acción visual por ahora, los conteos se ven al
                // enviar siguiente campaña; podría disparar un toast si querés feedback.
            } catch { /* ignorar */ }
        });
    });

    // ── Acciones devices ─────────────────────────────────────────────────────
    const crearDevice = async () => {
        if (!alias.trim()) return;
        setCreando(true);
        try {
            const { data } = await api.post('/campania/devices', { alias: alias.trim() });
            toast('Listo', 'Número creado. Escaneá el QR para vincular.', '#10b981');
            setAlias('');
            setModalCrear(false);
            await loadDevices();
            setDeviceActivoId(data.id);
            abrirQr(data.id);
        } catch (err) {
            toast('Error', err.response?.data?.error || 'No se pudo crear', '#ef4444');
        } finally { setCreando(false); }
    };

    const confirmarEliminar = async () => {
        setEliminando(true);
        try {
            await api.delete(`/campania/devices/${pendingDeviceId}`);
            toast('Eliminado', 'Número y sus chats borrados', '#10b981');
            setModalEliminar(false);
            if (deviceActivoId === pendingDeviceId) {
                setDeviceActivoId(null);
                setContactos([]); setBandeja([]); setContactoActivo(null); setMensajes([]);
            }
            loadDevices();
        } catch { toast('Error', 'No se pudo eliminar', '#ef4444'); }
        finally { setEliminando(false); }
    };

    // ── QR flow (idéntico a WhatsAppVincular) ────────────────────────────────
    const fetchQr = useCallback(async (deviceId) => {
        try {
            const { data } = await api.get(`/whatsapp/${deviceId}/qr`);
            if (data.status === 'SCAN_QR' && data.qr) {
                setQrSrc(data.qr);
                setQrLoading(false);
            } else if (data.status === 'CONNECTED') {
                cerrarQr();
                // El WS también lo va a notificar, pero por las dudas refrescamos
                setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, estado: 'CONNECTED' } : d));
                loadDevices();
            }
        } catch { /* silencio: seguimos polleando */ }
    }, [loadDevices]);

    const abrirQr = (deviceId) => {
        setPendingDeviceId(deviceId);
        qrModalOpenRef.current = true;
        setQrSrc(null);
        setQrLoading(true);
        setModalQr(true);
        fetchQr(deviceId);
        // Polling del QR cada 3s (el QR rota, no es polling de estado)
        qrIntervalRef.current = setInterval(() => fetchQr(deviceId), 3000);
    };

    const cerrarQr = useCallback(() => {
        if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
        qrIntervalRef.current = null;
        qrModalOpenRef.current = false;
        setModalQr(false);
        setQrSrc(null);
    }, []);

    // ── Acciones chat ────────────────────────────────────────────────────────
    const seleccionarContacto = (item) => {
        setContactoActivo(item);
        loadMensajes(item.contactoId);
    };

    const responder = async (contactoId, texto) => {
        try {
            await api.post(`/campania/contactos/${contactoId}/responder`, { texto });
            loadMensajes(contactoId);
            // el WS va a refrescar la bandeja, pero como fallback hacemos load
            if (deviceActivoId) loadBandeja(deviceActivoId);
        } catch (err) {
            toast('Error', err.response?.data?.error || 'No se pudo enviar', '#ef4444');
            throw err;
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    const deviceActivo = devices.find(d => d.id === deviceActivoId);
    const hayDeviceConectado = deviceActivo?.estado === 'CONNECTED';

    return (
        // Layout vertical de altura completa: header (auto) + cuerpo (flex 1).
        // Las secciones internas tienen scroll propio así nunca se sale del viewport.
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <div className="header-top" style={{ justifyContent: 'space-between', padding: '20px 25px', flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i>
                        Campañas
                    </h2>
                    <p style={{ margin: '5px 0 0', color: 'var(--text-sec, #94a3b8)', fontSize: '0.95rem' }}>
                        Sector aislado del embudo principal. Usá un chip aparte para evitar baneos.
                    </p>
                </div>
                <NotificationBell />
            </div>

            {/* Cuerpo: ocupa lo que queda del viewport, sin scroll global */}
            <div style={{
                flex: 1, minHeight: 0,
                display: 'flex', flexDirection: 'column',
                padding: '10px 30px 20px', gap: 20
            }}>
                {/* Sección 1 — Devices: scroll horizontal/vertical interno si crecen */}
                <div style={{
                    flexShrink: 0,
                    maxHeight: deviceActivoId ? 320 : '100%',  // colapsada cuando hay workspace (1 fila visible, scroll si crece)
                    overflowY: 'auto',
                    paddingRight: 4,
                }}>
                    {loading && <div style={{ padding: 40 }}><div className="spinner"></div></div>}
                    {!loading && (
                        <div className="devices-grid" style={{ paddingBottom: 4 }}>
                            <button type="button" className="ghost-column-placeholder add-device-card"
                                style={{ minHeight: 200, height: 'auto', width: '100%' }}
                                onClick={() => { setAlias(''); setModalCrear(true); }}>
                                <div className="add-icon-circle"><i className="fas fa-plus"></i></div>
                                <span style={{ fontWeight: 500 }}>Agregar número de campaña</span>
                            </button>
                            {devices.map(d => (
                                <DeviceCard key={d.id} device={d}
                                    isActive={d.id === deviceActivoId}
                                    onSelect={setDeviceActivoId}
                                    onConectar={abrirQr}
                                    onEliminar={(id) => { setPendingDeviceId(id); setModalEliminar(true); }} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Sección 2 — Workspace: ocupa el resto del viewport */}
                {deviceActivoId && (
                    <div style={{
                        flex: 1, minHeight: 0,
                        display: 'flex', flexDirection: 'column',
                        gap: 12,
                    }}>
                        <h3 style={{
                            margin: 0, fontSize: '1.1rem', color: 'var(--text-main, #fff)',
                            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
                        }}>
                            <i className="fas fa-stream" style={{ color: '#f59e0b' }}></i>
                            Workspace · {deviceActivo?.alias}
                            {!hayDeviceConectado && (
                                <span className="status-badge status-disconnected" style={{ marginLeft: 8 }}>
                                    Sin vincular
                                </span>
                            )}
                        </h3>

                        {!hayDeviceConectado && (
                            <div className="device-card" style={{
                                flex: 1, minHeight: 0,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                textAlign: 'center', padding: 30
                            }}>
                                <i className="fas fa-qrcode" style={{ fontSize: 48, color: '#f59e0b', opacity: 0.5 }}></i>
                                <p style={{ marginTop: 14, color: 'var(--text-sec, #94a3b8)' }}>
                                    Vinculá el número escaneando el QR antes de importar contactos o mandar campañas.
                                </p>
                                <button className="btn-modal btn-confirm" style={{ marginTop: 14 }}
                                    onClick={() => abrirQr(deviceActivoId)}>
                                    <i className="fas fa-qrcode"></i> Escanear QR
                                </button>
                            </div>
                        )}

                        {hayDeviceConectado && (
                            <div style={{
                                flex: 1, minHeight: 0,
                                display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20
                            }}>
                                <ContactosPanel deviceId={deviceActivoId}
                                    contactos={contactos}
                                    onReload={() => loadContactos(deviceActivoId)} />
                                <ChatPanel deviceId={deviceActivoId}
                                    bandeja={bandeja}
                                    contactoActivo={contactoActivo}
                                    mensajes={mensajes}
                                    onSelectContacto={seleccionarContacto}
                                    onResponder={responder} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal: crear device */}
            <Modal active={modalCrear} onClose={() => setModalCrear(false)}>
                <h3 style={{ margin: '0 0 5px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Nuevo número de campaña
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>
                    Usá un chip aparte, no el número principal del negocio. Si lo banean, perdés solo este.
                </p>
                <input className="clean-input" autoFocus style={{ width: '100%', marginBottom: 20 }}
                    placeholder="Alias (ej: Burner-01)" value={alias} autoComplete="off"
                    onChange={e => setAlias(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && crearDevice()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalCrear(false)}>{t('common.cancel') || 'Cancelar'}</button>
                    <button className="btn-modal btn-confirm" onClick={crearDevice} disabled={creando}>
                        {creando ? <i className="fas fa-spinner fa-spin"></i> : 'Crear'}
                    </button>
                </div>
            </Modal>

            {/* Modal: eliminar device */}
            <Modal active={modalEliminar} onClose={() => setModalEliminar(false)}>
                <div style={{ textAlign: 'center' }}>
                    <div className="icon-trash-bg" style={{ margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#ef4444' }}>
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>Eliminar número</h3>
                    <p style={{ color: '#94a3b8', marginBottom: 20 }}>
                        Se borran sus contactos, chats y plantillas. Esta acción es irreversible.
                    </p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalEliminar(false)}>{t('common.cancel') || 'Cancelar'}</button>
                    <button className="btn-modal btn-confirm-danger" onClick={confirmarEliminar} disabled={eliminando}>
                        {eliminando ? <i className="fas fa-spinner fa-spin"></i> : 'Eliminar'}
                    </button>
                </div>
            </Modal>

            {/* Modal: QR */}
            <Modal active={modalQr} onClose={cerrarQr}>
                <h3 style={{ margin: '0 0 15px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Vincular WhatsApp
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 18 }}>
                    Abrí WhatsApp en el chip → Configuración → Dispositivos vinculados → Vincular un dispositivo.
                </p>
                <div style={{ textAlign: 'center' }}>
                    {qrLoading && (
                        <div style={{ padding: 40 }}>
                            <div className="spinner"></div>
                            <p style={{ marginTop: 20, color: '#888' }}>Cargando QR...</p>
                        </div>
                    )}
                    {qrSrc && (
                        <img src={qrSrc}
                            style={{ width: 260, height: 260, borderRadius: 12, border: '4px solid white', margin: '0 auto', display: 'block' }}
                            alt="QR WhatsApp" />
                    )}
                </div>
                <div className="modal-actions" style={{ marginTop: 24 }}>
                    <button className="btn-modal btn-cancel" onClick={cerrarQr}>Cerrar</button>
                </div>
            </Modal>
        </div>
    );
}
