import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ─── Modal: agregar número (QR) ───────────────────────────────────────────────

function AddDeviceModal({ active, onClose, onCreated }) {
    const [alias, setAlias] = useState('');
    const [creating, setCreating] = useState(false);
    const [qr, setQr] = useState(null);
    const [device, setDevice] = useState(null);
    const [statusMsg, setStatusMsg] = useState('Esperando creación...');
    const pollRef = useRef(null);
    const { showToast } = useToast();

    useEffect(() => {
        if (!active) {
            setAlias(''); setQr(null); setDevice(null); setStatusMsg('Esperando creación...');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
    }, [active]);

    const crear = async () => {
        if (!alias.trim()) { showToast('Poné un alias para el número', 'error'); return; }
        setCreating(true);
        try {
            const { data } = await api.post('/campania/devices', { alias: alias.trim() });
            setDevice(data);
            setStatusMsg('Generando QR...');
            startPolling(data.id);
        } catch (err) {
            showToast(err.response?.data?.error || 'Error creando dispositivo', 'error');
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
                    showToast('Número vinculado', 'success');
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
                <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Agregar número para spam</h3>
                {!device && (
                    <>
                        <p style={{ color: '#94a3b8', marginBottom: 14 }}>
                            Usá un <strong>chip aparte</strong>, no el número principal del negocio.
                            Si lo banean, perdés solo este.
                        </p>
                        <input
                            type="text"
                            value={alias}
                            onChange={e => setAlias(e.target.value)}
                            placeholder="Alias (ej: Burner-01)"
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.05)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)', marginBottom: 14
                            }}
                        />
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={onClose} disabled={creating}>Cancelar</button>
                            <button className="btn-modal btn-confirm" onClick={crear} disabled={creating}>
                                {creating ? <i className="fas fa-spinner fa-spin" /> : 'Crear'}
                            </button>
                        </div>
                    </>
                )}
                {device && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#94a3b8' }}>{statusMsg}</p>
                        {qr && <img src={qr} alt="QR" style={{ width: 280, height: 280, margin: '14px auto', borderRadius: 8 }} />}
                        <button className="btn-modal btn-cancel" onClick={onClose}>Cerrar</button>
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

// ─── Panel izquierdo: contactos + plantilla + envío ───────────────────────────

function ContactosPanel({ deviceId, onSent }) {
    const [contactos, setContactos] = useState([]);
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [plantilla, setPlantilla] = useState('Hola {nombre}, te escribo de...');
    const [loading, setLoading] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const fileRef = useRef(null);
    const { showToast } = useToast();

    const cargar = useCallback(async () => {
        if (!deviceId) { setContactos([]); return; }
        setLoading(true);
        try {
            const { data } = await api.get(`/campania/devices/${deviceId}/contactos`);
            setContactos(data || []);
        } catch (err) {
            showToast('Error cargando contactos', 'error');
        } finally { setLoading(false); }
    }, [deviceId, showToast]);

    useEffect(() => { cargar(); setSeleccionados(new Set()); }, [cargar]);

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
            showToast(`Importados: ${data.importados}, duplicados: ${data.duplicados}, inválidos: ${data.invalidos}`, 'success');
            cargar();
        } catch (err) {
            showToast(err.response?.data?.error || 'Error importando', 'error');
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const toggleUno = (id) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const toggleTodos = () => {
        if (seleccionados.size === contactos.length) setSeleccionados(new Set());
        else setSeleccionados(new Set(contactos.map(c => c.id)));
    };

    const enviar = async () => {
        if (!deviceId) { showToast('Seleccioná un número primero', 'error'); return; }
        if (seleccionados.size === 0) { showToast('Seleccioná al menos un contacto', 'error'); return; }
        if (!plantilla.trim()) { showToast('La plantilla está vacía', 'error'); return; }
        setEnviando(true);
        try {
            const { data } = await api.post('/campania/enviar', {
                dispositivoId: deviceId,
                cuerpo: plantilla,
                contactoIds: Array.from(seleccionados),
            });
            showToast(`Encolados: ${data.encolados}, salteados (ya contactados <30d): ${data.salteados}`, 'success');
            setSeleccionados(new Set());
            onSent?.();
        } catch (err) {
            showToast(err.response?.data?.error || 'Error enviando', 'error');
        } finally { setEnviando(false); }
    };

    return (
        <div style={panelStyle}>
            <div style={panelHeaderStyle}>
                <span><i className="fas fa-users" /> Contactos del sector</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importar} />
                <button onClick={() => fileRef.current?.click()} style={btnSmall} disabled={!deviceId}>
                    <i className="fas fa-file-upload" /> Importar Excel
                </button>
            </div>

            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <label style={{ color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={contactos.length > 0 && seleccionados.size === contactos.length}
                        onChange={toggleTodos}
                        style={{ marginRight: 8 }}
                    />
                    Seleccionar todos ({seleccionados.size}/{contactos.length})
                </label>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && <p style={{ padding: 16, color: '#94a3b8' }}>Cargando...</p>}
                {!loading && contactos.length === 0 && (
                    <p style={{ padding: 16, color: '#64748b', textAlign: 'center' }}>
                        Sin contactos. Importá un Excel con columnas <strong>Nombre</strong> y <strong>Teléfono</strong>.
                    </p>
                )}
                {contactos.map(c => (
                    <div key={c.id} style={contactoRowStyle} onClick={() => toggleUno(c.id)}>
                        <input
                            type="checkbox"
                            checked={seleccionados.has(c.id)}
                            onChange={() => toggleUno(c.id)}
                            style={{ marginRight: 12 }}
                            onClick={e => e.stopPropagation()}
                        />
                        <div style={{ flex: 1 }}>
                            <div style={{ color: '#fff', fontSize: 14 }}>{c.nombre}</div>
                            <div style={{ color: '#94a3b8', fontSize: 12 }}>{c.telefono}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ color: '#94a3b8', fontSize: 12 }}>Mensaje (usá {'{nombre}'} para personalizar)</label>
                <textarea
                    value={plantilla}
                    onChange={e => setPlantilla(e.target.value)}
                    rows={4}
                    style={{
                        width: '100%', padding: 10, borderRadius: 8, marginTop: 6,
                        background: 'rgba(255,255,255,0.05)', color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical', fontFamily: 'inherit'
                    }}
                />
                <button
                    onClick={enviar}
                    disabled={enviando || seleccionados.size === 0 || !deviceId}
                    style={{ ...btnPrimary, width: '100%', marginTop: 8 }}
                >
                    {enviando
                        ? <><i className="fas fa-spinner fa-spin" /> Encolando...</>
                        : <><i className="fas fa-paper-plane" /> Enviar campaña ({seleccionados.size})</>}
                </button>
            </div>
        </div>
    );
}
ContactosPanel.propTypes = { deviceId: PropTypes.number, onSent: PropTypes.func };

// ─── Panel derecho: bandeja + conversación ────────────────────────────────────

function ChatPanel({ deviceId }) {
    const [bandeja, setBandeja] = useState([]);
    const [contactoActivo, setContactoActivo] = useState(null);
    const [mensajes, setMensajes] = useState([]);
    const [borrador, setBorrador] = useState('');
    const [enviando, setEnviando] = useState(false);
    const msgEndRef = useRef(null);
    const { showToast } = useToast();

    const cargarBandeja = useCallback(async () => {
        if (!deviceId) { setBandeja([]); return; }
        try {
            const { data } = await api.get(`/campania/devices/${deviceId}/bandeja`);
            setBandeja(data || []);
        } catch { /* silencio */ }
    }, [deviceId]);

    useEffect(() => { cargarBandeja(); setContactoActivo(null); setMensajes([]); }, [cargarBandeja]);

    // Polling cada 4s para bandeja y mensajes (después se puede mejorar con WebSocket)
    useEffect(() => {
        const t = setInterval(() => {
            cargarBandeja();
            if (contactoActivo) cargarMensajes(contactoActivo.contactoId);
        }, 4000);
        return () => clearInterval(t);
    }, [cargarBandeja, contactoActivo]);

    const cargarMensajes = async (contactoId) => {
        try {
            const { data } = await api.get(`/campania/contactos/${contactoId}/mensajes`);
            setMensajes(data || []);
            requestAnimationFrame(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
        } catch { /* silencio */ }
    };

    const abrirChat = (item) => {
        setContactoActivo(item);
        cargarMensajes(item.contactoId);
    };

    const enviar = async () => {
        if (!borrador.trim() || !contactoActivo) return;
        setEnviando(true);
        try {
            await api.post(`/campania/contactos/${contactoActivo.contactoId}/responder`, { texto: borrador });
            setBorrador('');
            cargarMensajes(contactoActivo.contactoId);
            cargarBandeja();
        } catch (err) {
            showToast(err.response?.data?.error || 'Error enviando', 'error');
        } finally { setEnviando(false); }
    };

    return (
        <div style={{ ...panelStyle, flex: 1.4 }}>
            <div style={{ display: 'flex', height: '100%' }}>
                {/* Bandeja */}
                <div style={{ width: 260, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
                    <div style={panelHeaderStyle}><i className="fas fa-inbox" /> Chats activos</div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {bandeja.length === 0 && (
                            <p style={{ padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                                Cuando alguien responda a la campaña, aparecerá acá.
                            </p>
                        )}
                        {bandeja.map(item => (
                            <div
                                key={item.contactoId}
                                onClick={() => abrirChat(item)}
                                style={{
                                    padding: '10px 12px', cursor: 'pointer',
                                    background: contactoActivo?.contactoId === item.contactoId ? 'rgba(59,130,246,0.1)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{item.nombre}</div>
                                    {item.noLeidos > 0 && (
                                        <span style={{
                                            background: '#22c55e', color: '#fff', fontSize: 11,
                                            padding: '2px 7px', borderRadius: 10
                                        }}>{item.noLeidos}</span>
                                    )}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: 12 }}>{item.telefono}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Conversación */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {!contactoActivo && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column' }}>
                            <i className="fas fa-comments" style={{ fontSize: 48, opacity: 0.3 }} />
                            <p style={{ marginTop: 12 }}>Seleccioná un chat de la bandeja</p>
                        </div>
                    )}
                    {contactoActivo && (
                        <>
                            <div style={{ ...panelHeaderStyle, justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ color: '#fff', fontSize: 14 }}>{contactoActivo.nombre}</div>
                                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{contactoActivo.telefono}</div>
                                </div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: 'rgba(0,0,0,0.15)' }}>
                                {mensajes.map(m => (
                                    <div
                                        key={m.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: m.direccion === 'OUT' ? 'flex-end' : 'flex-start',
                                            marginBottom: 6
                                        }}
                                    >
                                        <div style={{
                                            maxWidth: '70%',
                                            background: m.direccion === 'OUT' ? '#16a34a' : 'rgba(255,255,255,0.08)',
                                            color: '#fff', padding: '8px 12px', borderRadius: 12,
                                            fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap'
                                        }}>
                                            {m.texto}
                                            <div style={{ fontSize: 10, opacity: 0.7, textAlign: 'right', marginTop: 4 }}>
                                                {formatHora(m.fecha)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={msgEndRef} />
                            </div>
                            <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
                                <input
                                    type="text"
                                    value={borrador}
                                    onChange={e => setBorrador(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                    placeholder="Escribí un mensaje..."
                                    style={{
                                        flex: 1, padding: '10px 12px', borderRadius: 20,
                                        background: 'rgba(255,255,255,0.05)', color: '#fff',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                />
                                <button onClick={enviar} disabled={enviando || !borrador.trim()} style={btnPrimary}>
                                    {enviando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
ChatPanel.propTypes = { deviceId: PropTypes.number };

// ─── Página principal ────────────────────────────────────────────────────────

export default function Spam() {
    const [devices, setDevices] = useState([]);
    const [deviceActivoId, setDeviceActivoId] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const { showToast } = useToast();

    const cargarDevices = useCallback(async () => {
        try {
            const { data } = await api.get('/campania/devices');
            setDevices(data || []);
            if (data?.length > 0 && !deviceActivoId) {
                setDeviceActivoId(data[0].id);
            }
        } catch (err) {
            showToast('Error cargando números', 'error');
        }
    }, [deviceActivoId, showToast]);

    useEffect(() => { cargarDevices(); }, [cargarDevices]);

    const eliminarDevice = async (deviceId) => {
        if (!confirm('¿Eliminar este número de campaña? Se borran sus contactos, chats y plantillas.')) return;
        try {
            await api.delete(`/campania/devices/${deviceId}`);
            showToast('Número eliminado', 'success');
            if (deviceActivoId === deviceId) setDeviceActivoId(null);
            cargarDevices();
        } catch (err) {
            showToast(err.response?.data?.error || 'Error eliminando', 'error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16, gap: 12, background: '#0f172a' }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <i className="fas fa-bullhorn" style={{ color: '#f59e0b', fontSize: 22 }} />
                    <div>
                        <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>Spam / Campañas</h2>
                        <p style={{ color: '#94a3b8', margin: 0, fontSize: 12 }}>
                            Aislado del embudo principal. Usá un chip aparte.
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
                                background: 'rgba(255,255,255,0.06)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            {devices.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.alias} {d.numeroTelefono ? `(${d.numeroTelefono})` : '(sin vincular)'} — {d.estado}
                                </option>
                            ))}
                        </select>
                    )}
                    {deviceActivoId && (
                        <button onClick={() => eliminarDevice(deviceActivoId)} style={btnDanger} title="Eliminar número activo">
                            <i className="fas fa-trash-alt" />
                        </button>
                    )}
                    <button onClick={() => setShowAddModal(true)} style={btnPrimary}>
                        <i className="fas fa-plus" /> Agregar número
                    </button>
                </div>
            </div>

            {/* Contenido principal */}
            <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
                {devices.length === 0 ? (
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', color: '#94a3b8',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                        border: '1px dashed rgba(255,255,255,0.1)'
                    }}>
                        <i className="fas fa-bullhorn" style={{ fontSize: 56, opacity: 0.3 }} />
                        <h3 style={{ color: '#fff', marginTop: 16 }}>Sin números de campaña</h3>
                        <p style={{ maxWidth: 380, textAlign: 'center', fontSize: 14 }}>
                            Agregá un número aparte (no el principal del negocio) para mandar campañas masivas.
                            Cuando alguien responda, vas a poder chatear acá y pasarle el número principal cuando madure el lead.
                        </p>
                        <button onClick={() => setShowAddModal(true)} style={{ ...btnPrimary, marginTop: 12 }}>
                            <i className="fas fa-plus" /> Agregar primer número
                        </button>
                    </div>
                ) : (
                    <>
                        <ContactosPanel deviceId={deviceActivoId} />
                        <ChatPanel deviceId={deviceActivoId} />
                    </>
                )}
            </div>

            <AddDeviceModal active={showAddModal} onClose={() => setShowAddModal(false)} onCreated={cargarDevices} />
        </div>
    );
}

// ─── Estilos inline (consistentes con el resto del CRM) ───────────────────────

const panelStyle = {
    flex: 1,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
};
const panelHeaderStyle = {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
};
const btnPrimary = {
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#3b82f6', color: '#fff', fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 8,
};
const btnSmall = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
};
const btnDanger = {
    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#ef4444', color: '#fff',
};
const contactoRowStyle = {
    display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
};
