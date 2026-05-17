import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import useWebSocket from '../hooks/useWebSocket';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C_AMBER      = '#f59e0b';
const C_AMBER_SOFT = 'rgba(245,158,11,0.10)';
const C_AMBER_BDR  = 'rgba(245,158,11,0.30)';
const C_GREEN      = '#10b981';
const C_GREEN_SOFT = 'rgba(16,185,129,0.12)';
const C_RED        = '#ef4444';
const C_CARD       = 'rgba(20,20,25,0.70)';
const C_BDR        = 'rgba(255,255,255,0.07)';
const C_BDR_SOFT   = 'rgba(255,255,255,0.04)';
const C_TEXT       = '#fff';
const C_MUTED      = 'rgba(255,255,255,0.38)';
const C_MUTED2     = 'rgba(255,255,255,0.55)';
const BLUR         = 'blur(20px)';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ─── Estilos base reutilizables ───────────────────────────────────────────────
const card = (extra = {}) => ({
    background: C_CARD,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${C_BDR}`,
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...extra,
});

const cardTitle = {
    fontSize: '0.70rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.10em',
    color: C_MUTED,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: `1px solid ${C_BDR_SOFT}`,
    flexShrink: 0,
};

const btnPrimary = {
    padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: C_AMBER, color: '#000', fontWeight: 700, fontSize: '0.78rem',
    display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
};

const btnGhost = {
    padding: '6px 11px', borderRadius: 8,
    border: `1px solid ${C_BDR}`,
    background: 'rgba(255,255,255,0.04)', color: C_MUTED2, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem',
};

const btnDanger = {
    padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'rgba(239,68,68,0.15)', color: C_RED,
    border: `1px solid rgba(239,68,68,0.25)`,
    display: 'inline-flex', alignItems: 'center',
};

const rowStyle = {
    display: 'flex', alignItems: 'center', padding: '9px 14px', cursor: 'pointer',
    borderBottom: `1px solid ${C_BDR_SOFT}`, transition: 'background 0.12s',
};

// ─── AddDeviceModal ───────────────────────────────────────────────────────────
function AddDeviceModal({ active, onClose, onCreated }) {
    const [alias, setAlias]       = useState('');
    const [creating, setCreating] = useState(false);
    const [qr, setQr]             = useState(null);
    const [device, setDevice]     = useState(null);
    const [statusMsg, setStatusMsg] = useState('');
    const pollRef = useRef(null);
    const toast   = useToast();

    useEffect(() => {
        if (!active) {
            setAlias(''); setQr(null); setDevice(null); setStatusMsg('');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
    }, [active]);

    const crear = async () => {
        if (!alias.trim()) { toast('Aviso', 'Poné un alias', C_AMBER); return; }
        setCreating(true);
        try {
            const { data } = await api.post('/campania/devices', { alias: alias.trim() });
            setDevice(data);
            setStatusMsg('Generando QR…');
            startPolling(data.id);
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error creando dispositivo', C_RED);
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
                    toast('Vinculado', 'Número conectado', C_GREEN);
                    onCreated?.(); onClose();
                }
            } catch { /* sigue */ }
        }, 2500);
    };

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" style={{ maxWidth: 420 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.3rem',
                    background: 'linear-gradient(to right, #fff, #aebac1)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Agregar número de campaña
                </h3>
                {!device && (
                    <>
                        <p style={{ color: C_MUTED, fontSize: '0.85rem', marginBottom: 18 }}>
                            Usá un <strong style={{ color: C_MUTED2 }}>chip aparte</strong>, no el número principal del negocio.
                        </p>
                        <input className="clean-input" autoFocus
                            style={{ width: '100%', marginBottom: 20 }}
                            placeholder="Alias (ej: Burner-01)"
                            value={alias} autoComplete="off"
                            onChange={e => setAlias(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && crear()} />
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
                        <p style={{ color: C_MUTED, marginBottom: 14 }}>{statusMsg}</p>
                        {qr
                            ? <img src={qr} alt="QR" style={{ width: 260, height: 260, borderRadius: 12, border: '4px solid white', margin: '0 auto', display: 'block' }} />
                            : <div className="spinner" style={{ margin: '20px auto' }} />}
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
    active: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onCreated: PropTypes.func,
};

// ─── ContactosPanel ───────────────────────────────────────────────────────────
function ContactosPanel({ deviceId, contactos, onReload }) {
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [plantilla, setPlantilla]         = useState('Hola {nombre}, te escribo de…');
    const [enviando, setEnviando]           = useState(false);
    const fileRef = useRef(null);
    const toast   = useToast();

    useEffect(() => { setSeleccionados(new Set()); }, [deviceId]);

    const importar = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const form = new FormData(); form.append('file', file);
        try {
            const { data } = await api.post(`/campania/devices/${deviceId}/contactos/import`, form,
                { headers: { 'Content-Type': 'multipart/form-data' } });
            toast('Listo', `Importados: ${data.importados} · Duplicados: ${data.duplicados} · Inválidos: ${data.invalidos}`, C_GREEN);
            onReload();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error importando', C_RED);
        } finally { if (fileRef.current) fileRef.current.value = ''; }
    };

    const toggleUno    = (id) => setSeleccionados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleTodos  = () => setSeleccionados(seleccionados.size === contactos.length ? new Set() : new Set(contactos.map(c => c.id)));

    const enviar = async () => {
        if (!deviceId)              { toast('Aviso', 'Seleccioná un número', C_AMBER); return; }
        if (seleccionados.size === 0) { toast('Aviso', 'Seleccioná al menos un contacto', C_AMBER); return; }
        if (!plantilla.trim())       { toast('Aviso', 'La plantilla está vacía', C_AMBER); return; }
        setEnviando(true);
        try {
            const { data } = await api.post('/campania/enviar', {
                dispositivoId: deviceId, cuerpo: plantilla, contactoIds: Array.from(seleccionados),
            });
            toast('Campaña encolada', `Encolados: ${data.encolados} · Salteados: ${data.salteados}`, C_GREEN);
            setSeleccionados(new Set());
        } catch (err) { toast('Error', err.response?.data?.error || 'Error enviando', C_RED);
        } finally { setEnviando(false); }
    };

    return (
        <div style={{ ...card(), flex: 1, minHeight: 0 }}>
            <div style={{ ...cardTitle, justifyContent: 'space-between' }}>
                <span><i className="fas fa-users" style={{ color: C_AMBER }} /> Contactos</span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importar} />
                    <button onClick={() => fileRef.current?.click()} style={btnGhost} disabled={!deviceId}>
                        <i className="fas fa-file-upload" /> Importar
                    </button>
                </div>
            </div>

            <div style={{ padding: '7px 14px', borderBottom: `1px solid ${C_BDR_SOFT}` }}>
                <label style={{ color: C_MUTED, fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox"
                        checked={contactos.length > 0 && seleccionados.size === contactos.length}
                        onChange={toggleTodos} style={{ marginRight: 8 }} />
                    Todos ({seleccionados.size}/{contactos.length})
                </label>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {contactos.length === 0 && (
                    <p style={{ padding: 20, color: C_MUTED, textAlign: 'center', fontSize: '0.82rem' }}>
                        Sin contactos. Importá un Excel con columnas <strong>Nombre</strong> y <strong>Teléfono</strong>.
                    </p>
                )}
                {contactos.map(c => (
                    <div key={c.id} onClick={() => toggleUno(c.id)}
                        style={{ ...rowStyle, background: seleccionados.has(c.id) ? C_AMBER_SOFT : 'transparent' }}>
                        <input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggleUno(c.id)}
                            style={{ marginRight: 10 }} onClick={e => e.stopPropagation()} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: C_TEXT, fontSize: '0.85rem' }}>{c.nombre}</div>
                            <div style={{ color: C_MUTED, fontSize: '0.75rem', fontFamily: 'monospace' }}>{c.telefono}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '10px 14px', borderTop: `1px solid ${C_BDR_SOFT}` }}>
                <div style={{ fontSize: '0.72rem', color: C_MUTED, marginBottom: 5 }}>
                    Mensaje — usá <code style={{ color: C_AMBER }}>{'{nombre}'}</code> para personalizar
                </div>
                <textarea value={plantilla} onChange={e => setPlantilla(e.target.value)}
                    rows={3} className="clean-input no-resize"
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }} />
                <button onClick={enviar} disabled={enviando || seleccionados.size === 0 || !deviceId}
                    style={{ ...btnPrimary, width: '100%', marginTop: 8, justifyContent: 'center' }}>
                    {enviando
                        ? <><i className="fas fa-spinner fa-spin" /> Encolando…</>
                        : <><i className="fas fa-paper-plane" /> Enviar campaña ({seleccionados.size})</>}
                </button>
            </div>
        </div>
    );
}
ContactosPanel.propTypes = {
    deviceId: PropTypes.number, contactos: PropTypes.array.isRequired, onReload: PropTypes.func.isRequired,
};

// ─── ChatPanel ────────────────────────────────────────────────────────────────
function ChatPanel({ bandeja, contactoActivo, mensajes, onSelectContacto, onResponder }) {
    const [borrador, setBorrador] = useState('');
    const [enviando, setEnviando] = useState(false);
    const msgEndRef = useRef(null);
    const toast     = useToast();

    useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

    const enviar = async () => {
        if (!borrador.trim() || !contactoActivo) return;
        setEnviando(true);
        try { await onResponder(contactoActivo.contactoId, borrador); setBorrador('');
        } catch (err) { toast('Error', err.response?.data?.error || 'Error enviando', C_RED);
        } finally { setEnviando(false); }
    };

    return (
        <div style={{ ...card(), flex: 1.4, minHeight: 0 }}>
            <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
                {/* Bandeja */}
                <div style={{ width: 240, borderRight: `1px solid ${C_BDR}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={cardTitle}><i className="fas fa-inbox" style={{ color: C_AMBER }} /> Bandeja</div>
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        {bandeja.length === 0 && (
                            <p style={{ padding: 14, color: C_MUTED, fontSize: '0.80rem', textAlign: 'center', marginTop: 20 }}>
                                Las respuestas a campañas aparecen acá.
                            </p>
                        )}
                        {bandeja.map(item => (
                            <div key={item.contactoId} onClick={() => onSelectContacto(item)} style={{
                                padding: '9px 13px', cursor: 'pointer',
                                background: contactoActivo?.contactoId === item.contactoId ? C_AMBER_SOFT : 'transparent',
                                borderLeft: `3px solid ${contactoActivo?.contactoId === item.contactoId ? C_AMBER : 'transparent'}`,
                                borderBottom: `1px solid ${C_BDR_SOFT}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                    <div style={{ color: C_TEXT, fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.nombre}
                                    </div>
                                    {item.noLeidos > 0 && (
                                        <span style={{ background: C_GREEN, color: '#000', fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
                                            {item.noLeidos}
                                        </span>
                                    )}
                                </div>
                                <div style={{ color: C_MUTED, fontSize: '0.72rem', fontFamily: 'monospace', marginTop: 2 }}>{item.telefono}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Conversación */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {!contactoActivo
                        ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C_MUTED }}>
                            <i className="fas fa-comments" style={{ fontSize: 44, opacity: 0.15 }} />
                            <p style={{ marginTop: 12, fontSize: '0.85rem' }}>Seleccioná un chat</p>
                          </div>
                        : <>
                            <div style={{ ...cardTitle, padding: '10px 14px' }}>
                                <div>
                                    <div style={{ color: C_TEXT, fontSize: '0.88rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{contactoActivo.nombre}</div>
                                    <div style={{ color: C_MUTED, fontSize: '0.72rem', fontFamily: 'monospace', marginTop: 1 }}>{contactoActivo.telefono}</div>
                                </div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {mensajes.map(m => (
                                    <div key={m.id} style={{ display: 'flex', justifyContent: m.direccion === 'OUT' ? 'flex-end' : 'flex-start' }}>
                                        <div style={{
                                            maxWidth: '72%', padding: '8px 12px', borderRadius: 12,
                                            background: m.direccion === 'OUT' ? C_GREEN_SOFT : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${m.direccion === 'OUT' ? 'rgba(16,185,129,0.25)' : C_BDR}`,
                                            color: C_TEXT, fontSize: '0.85rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                        }}>
                                            {m.texto}
                                            <div style={{ fontSize: '0.68rem', opacity: 0.45, textAlign: 'right', marginTop: 4 }}>{formatHora(m.fecha)}</div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={msgEndRef} />
                            </div>
                            <div style={{ padding: '9px 12px', borderTop: `1px solid ${C_BDR}`, display: 'flex', gap: 8 }}>
                                <input type="text" value={borrador} onChange={e => setBorrador(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                    placeholder="Escribí un mensaje…" className="clean-input"
                                    style={{ flex: 1, borderRadius: 20 }} />
                                <button onClick={enviar} disabled={enviando || !borrador.trim()} style={btnPrimary}>
                                    {enviando ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                                </button>
                            </div>
                          </>
                    }
                </div>
            </div>
        </div>
    );
}
ChatPanel.propTypes = {
    bandeja: PropTypes.array.isRequired, contactoActivo: PropTypes.object,
    mensajes: PropTypes.array.isRequired, onSelectContacto: PropTypes.func.isRequired, onResponder: PropTypes.func.isRequired,
};

// ─── CrearPlanModal ───────────────────────────────────────────────────────────
function CrearPlanModal({ active, onClose, onCreated, devices }) {
    const [nombre, setNombre]           = useState('');
    const [selDevices, setSelDevices]   = useState(new Set());
    const [mensajesPorDia, setMsgs]     = useState(10);
    const [textoActual, setTextoActual] = useState('');
    const [textos, setTextos]           = useState([]);
    const [saving, setSaving]           = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (!active) { setNombre(''); setSelDevices(new Set()); setMsgs(10); setTextoActual(''); setTextos([]); setSaving(false); }
    }, [active]);

    const toggleDevice = (id) => setSelDevices(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const agregarTexto = () => { const t = textoActual.trim(); if (!t) return; setTextos(p => [...p, t]); setTextoActual(''); };
    const quitarTexto  = (i) => setTextos(p => p.filter((_, j) => j !== i));

    const crear = async () => {
        if (!nombre.trim())       { toast('Aviso', 'Poné un nombre al plan', C_AMBER); return; }
        if (selDevices.size < 2)  { toast('Aviso', 'Seleccioná al menos 2 líneas', C_AMBER); return; }
        if (textos.length === 0)  { toast('Aviso', 'Agregá al menos un mensaje al pool', C_AMBER); return; }
        setSaving(true);
        try {
            await api.post('/calentamiento/planes', {
                nombre: nombre.trim(), dispositivoIds: Array.from(selDevices),
                mensajesPorParPorDia: mensajesPorDia, textos,
            });
            toast('Plan creado', 'El calentamiento comenzará en segundos', C_GREEN);
            onCreated?.(); onClose();
        } catch (err) { toast('Error', err.response?.data?.error || 'Error creando plan', C_RED);
        } finally { setSaving(false); }
    };

    if (!active) return null;
    const connected = devices.filter(d => d.estado === 'CONNECTED');

    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 18px', fontSize: '1.2rem', color: C_TEXT }}>
                    <i className="fas fa-fire" style={{ color: C_AMBER, marginRight: 8 }} />
                    Nuevo plan de calentamiento
                </h3>

                {/* Nombre */}
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
                    <label style={{ color: C_MUTED, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                        Nombre del plan
                    </label>
                    <input className="clean-input" placeholder="ej: Warming Enero"
                        value={nombre} onChange={e => setNombre(e.target.value)} />
                </div>

                {/* Líneas */}
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
                    <label style={{ color: C_MUTED, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Líneas a incluir <span style={{ color: C_MUTED, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(mínimo 2 conectadas)</span>
                    </label>
                    {connected.length === 0
                        ? <p style={{ color: C_RED, fontSize: '0.80rem', margin: 0 }}>No hay líneas CONECTADAS. Conectá al menos 2 antes de crear el plan.</p>
                        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                            {connected.map(d => (
                                <div key={d.id} onClick={() => toggleDevice(d.id)} style={{
                                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                                    border: `1px solid ${selDevices.has(d.id) ? C_AMBER_BDR : C_BDR}`,
                                    background: selDevices.has(d.id) ? C_AMBER_SOFT : 'rgba(255,255,255,0.04)',
                                    color: selDevices.has(d.id) ? C_AMBER : C_MUTED2,
                                }}>
                                    {d.alias}{d.numeroTelefono ? ` (${d.numeroTelefono})` : ''}
                                </div>
                            ))}
                          </div>
                    }
                </div>

                {/* Mensajes por día */}
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
                    <label style={{ color: C_MUTED, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                        Mensajes por par de líneas por día
                    </label>
                    <input type="number" className="clean-input" style={{ width: 110 }}
                        min={1} max={200} value={mensajesPorDia}
                        onChange={e => setMsgs(Number(e.target.value))} />
                </div>

                {/* Pool de mensajes */}
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18 }}>
                    <label style={{ color: C_MUTED, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Pool de mensajes <span style={{ color: C_MUTED, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(se elige uno al azar)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                        <input className="clean-input" style={{ flex: 1 }}
                            placeholder="ej: Hola! cómo andás?"
                            value={textoActual} onChange={e => setTextoActual(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && agregarTexto()} />
                        <button onClick={agregarTexto} style={btnGhost}><i className="fas fa-plus" /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {textos.length === 0 && <p style={{ color: C_MUTED, fontSize: '0.78rem', margin: 0 }}>Sin mensajes aún.</p>}
                        {textos.map((t, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C_BDR}`,
                                borderRadius: 8, padding: '6px 10px', fontSize: '0.83rem', color: C_TEXT,
                            }}>
                                <span style={{ flex: 1 }}>{t}</span>
                                <button onClick={() => quitarTexto(i)} style={{ background: 'none', border: 'none', color: C_RED, cursor: 'pointer', padding: 2 }}>
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button className="btn-modal btn-confirm" onClick={crear} disabled={saving}>
                        {saving ? <i className="fas fa-spinner fa-spin" /> : 'Crear plan'}
                    </button>
                </div>
            </div>
        </div>
    );
}
CrearPlanModal.propTypes = {
    active: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired,
    onCreated: PropTypes.func, devices: PropTypes.array.isRequired,
};

// ─── CalentamientoPanel ───────────────────────────────────────────────────────
function CalentamientoPanel({ devices, showModal, onCloseModal }) {
    const [planes, setPlanes]               = useState([]);
    const [historial, setHistorial]         = useState(null);
    const [loadingHistorial, setLoadingH]   = useState(false);
    const toast = useToast();

    const loadPlanes = useCallback(async () => {
        try { const { data } = await api.get('/calentamiento/planes'); setPlanes(data || []);
        } catch { toast('Error', 'No se pudieron cargar los planes', C_RED); }
    }, [toast]);

    useEffect(() => { loadPlanes(); }, [loadPlanes]);

    const pausar   = async (id) => { try { await api.patch(`/calentamiento/planes/${id}/pausar`);   loadPlanes(); } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED); } };
    const reanudar = async (id) => { try { await api.patch(`/calentamiento/planes/${id}/reanudar`); loadPlanes(); } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED); } };
    const eliminar = async (id) => {
        if (!confirm('¿Eliminar este plan? Se borrarán todos los envíos.')) return;
        try { await api.delete(`/calentamiento/planes/${id}`); toast('Eliminado', '', C_GREEN); if (historial?.planId === id) setHistorial(null); loadPlanes();
        } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED); }
    };
    const verHistorial = async (id) => {
        if (historial?.planId === id) { setHistorial(null); return; }
        setLoadingH(true);
        try { const { data } = await api.get(`/calentamiento/planes/${id}/historial`); setHistorial({ planId: id, items: data });
        } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED);
        } finally { setLoadingH(false); }
    };

    return (
        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
            {/* Lista de planes */}
            <div style={{ ...card(), flex: 1, minHeight: 0 }}>
                <div style={{ ...cardTitle, justifyContent: 'space-between' }}>
                    <span><i className="fas fa-list" style={{ color: C_AMBER }} /> Planes activos</span>
                    <button onClick={loadPlanes} style={btnGhost} title="Refrescar">
                        <i className="fas fa-sync-alt" />
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {planes.length === 0 && (
                        <div style={{ textAlign: 'center', color: C_MUTED, marginTop: 50 }}>
                            <i className="fas fa-fire" style={{ fontSize: 38, opacity: 0.15, color: C_AMBER }} />
                            <p style={{ marginTop: 12, fontSize: '0.85rem' }}>Sin planes de calentamiento.</p>
                            <p style={{ fontSize: '0.78rem', opacity: 0.7 }}>Creá uno para que tus líneas se calienten antes de una campaña.</p>
                        </div>
                    )}
                    {planes.map(plan => (
                        <div key={plan.id} style={{
                            background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                            border: `1px solid ${plan.estado === 'ACTIVO' ? C_AMBER_BDR : C_BDR}`,
                            padding: 14,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ color: C_TEXT, fontWeight: 600, fontSize: '0.90rem' }}>{plan.nombre}</span>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                            background: plan.estado === 'ACTIVO' ? C_AMBER_SOFT : 'rgba(255,255,255,0.05)',
                                            color: plan.estado === 'ACTIVO' ? C_AMBER : C_MUTED,
                                            border: `1px solid ${plan.estado === 'ACTIVO' ? C_AMBER_BDR : C_BDR}`,
                                        }}>
                                            {plan.estado}
                                        </span>
                                    </div>
                                    <div style={{ color: C_MUTED, fontSize: '0.75rem', marginBottom: 7 }}>
                                        {plan.mensajesPorParPorDia} msg/par/día · {plan.dispositivos?.length || 0} líneas · {plan.textos?.length || 0} en pool
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {(plan.dispositivos || []).map(d => (
                                            <span key={d.id} style={{
                                                fontSize: '0.70rem', padding: '2px 8px', borderRadius: 10,
                                                background: d.estado === 'CONNECTED' ? C_GREEN_SOFT : 'rgba(255,255,255,0.04)',
                                                color: d.estado === 'CONNECTED' ? C_GREEN : C_MUTED,
                                                border: `1px solid ${d.estado === 'CONNECTED' ? 'rgba(16,185,129,0.25)' : C_BDR}`,
                                            }}>
                                                {d.alias}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                    <button onClick={() => verHistorial(plan.id)} title="Ver historial"
                                        style={{ ...btnGhost, color: historial?.planId === plan.id ? C_AMBER : undefined }}>
                                        <i className="fas fa-history" />
                                    </button>
                                    {plan.estado === 'ACTIVO'
                                        ? <button onClick={() => pausar(plan.id)} style={btnGhost} title="Pausar"><i className="fas fa-pause" /></button>
                                        : <button onClick={() => reanudar(plan.id)} style={{ ...btnGhost, color: C_GREEN }} title="Reanudar"><i className="fas fa-play" /></button>
                                    }
                                    <button onClick={() => eliminar(plan.id)} style={btnDanger} title="Eliminar"><i className="fas fa-trash-alt" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Historial */}
            {(historial || loadingHistorial) && (
                <div style={{ ...card(), flex: 1, minHeight: 0 }}>
                    <div style={{ ...cardTitle, justifyContent: 'space-between' }}>
                        <span><i className="fas fa-history" style={{ color: C_AMBER }} /> Historial de envíos</span>
                        <button onClick={() => setHistorial(null)} style={btnGhost}><i className="fas fa-times" /></button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 14px 14px' }}>
                        {loadingHistorial && <div style={{ textAlign: 'center', marginTop: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
                        {!loadingHistorial && (historial?.items?.length === 0) && (
                            <p style={{ color: C_MUTED, textAlign: 'center', marginTop: 40, fontSize: '0.82rem' }}>Sin envíos todavía.</p>
                        )}
                        {!loadingHistorial && (historial?.items || []).map(item => (
                            <div key={item.id} style={{ padding: '9px 0', borderBottom: `1px solid ${C_BDR_SOFT}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <span style={{ fontSize: '0.78rem', color: C_MUTED }}>
                                        <strong style={{ color: C_TEXT }}>{item.origen}</strong>
                                        <i className="fas fa-arrow-right" style={{ margin: '0 6px', opacity: 0.3 }} />
                                        <strong style={{ color: C_TEXT }}>{item.destino}</strong>
                                    </span>
                                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                        {item.respondido && <span style={{ fontSize: '0.68rem', color: C_GREEN }}><i className="fas fa-reply" /> resp.</span>}
                                        <span style={{
                                            fontSize: '0.68rem', padding: '1px 7px', borderRadius: 8,
                                            background: item.estado === 'SENT' ? C_GREEN_SOFT : item.estado === 'FAILED' ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)',
                                            color: item.estado === 'SENT' ? C_GREEN : item.estado === 'FAILED' ? C_RED : C_MUTED,
                                        }}>{item.estado}</span>
                                    </div>
                                </div>
                                <div style={{ color: C_TEXT, fontSize: '0.83rem' }}>{item.texto}</div>
                                <div style={{ color: C_MUTED, fontSize: '0.70rem', marginTop: 3 }}>
                                    {item.fechaEnviado ? new Date(item.fechaEnviado).toLocaleString() : 'Pendiente'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <CrearPlanModal active={showModal} onClose={onCloseModal} onCreated={loadPlanes} devices={devices} />
        </div>
    );
}
CalentamientoPanel.propTypes = {
    devices: PropTypes.array.isRequired, showModal: PropTypes.bool.isRequired, onCloseModal: PropTypes.func.isRequired,
};

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Spam() {
    const toast       = useToast();
    const { agenciaId } = useUser();

    const [tab, setTab]               = useState('campanas');
    const [devices, setDevices]       = useState([]);
    const [deviceActivoId, setDevActivo] = useState(null);
    const [showAddModal, setShowAdd]  = useState(false);
    const [showPlanModal, setShowPlan] = useState(false);
    const [contactos, setContactos]   = useState([]);
    const [bandeja, setBandeja]       = useState([]);
    const [contactoActivo, setCtActivo] = useState(null);
    const [mensajes, setMensajes]     = useState([]);

    const devActivoRef = useRef(null);
    const ctActivoRef  = useRef(null);
    useEffect(() => { devActivoRef.current = deviceActivoId; }, [deviceActivoId]);
    useEffect(() => { ctActivoRef.current  = contactoActivo; }, [contactoActivo]);

    const loadDevices  = useCallback(async () => {
        try { const { data } = await api.get('/campania/devices'); setDevices(data || []); setDevActivo(prev => prev || (data?.[0]?.id ?? null));
        } catch { toast('Error', 'No se pudieron cargar los números', C_RED); }
    }, [toast]);

    const loadContactos = useCallback(async (id) => {
        if (!id) { setContactos([]); return; }
        try { const { data } = await api.get(`/campania/devices/${id}/contactos`); setContactos(data || []);
        } catch { /* silencio */ }
    }, []);

    const loadBandeja = useCallback(async (id) => {
        if (!id) { setBandeja([]); return; }
        try { const { data } = await api.get(`/campania/devices/${id}/bandeja`); setBandeja(data || []);
        } catch { /* silencio */ }
    }, []);

    const loadMensajes = useCallback(async (id) => {
        if (!id) { setMensajes([]); return; }
        try { const { data } = await api.get(`/campania/contactos/${id}/mensajes`); setMensajes(data || []);
        } catch { /* silencio */ }
    }, []);

    useEffect(() => { loadDevices(); }, [loadDevices]);
    useEffect(() => {
        if (deviceActivoId) { loadContactos(deviceActivoId); loadBandeja(deviceActivoId); setCtActivo(null); setMensajes([]); }
    }, [deviceActivoId, loadContactos, loadBandeja]);

    useWebSocket(agenciaId, () => { }, (client) => {
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const p = JSON.parse(msg.body);
                if (p?.sessionId) {
                    setDevices(prev => prev.map(d => d.sessionId === p.sessionId ? { ...d, estado: p.status || p.tipo || d.estado } : d));
                    if (p.status === 'CONNECTED') loadDevices();
                }
            } catch { /* ignorar */ }
        });
        client.subscribe(`/topic/campania/${agenciaId}`, (msg) => {
            try {
                const p = JSON.parse(msg.body);
                if (p.tipo === 'MENSAJE_IN' || p.tipo === 'MENSAJE_OUT') {
                    const devId = devActivoRef.current;
                    const ctId  = ctActivoRef.current?.contactoId;
                    if (devId) loadBandeja(devId);
                    if (ctId === p.contactoId) loadMensajes(p.contactoId);
                }
            } catch { /* ignorar */ }
        });
    });

    const eliminarDevice = async (id) => {
        if (!confirm('¿Eliminar este número? Se borran sus contactos, chats y plantillas.')) return;
        try {
            await api.delete(`/campania/devices/${id}`);
            toast('Eliminado', 'Número y sus chats borrados', C_GREEN);
            if (deviceActivoId === id) { setDevActivo(null); setContactos([]); setBandeja([]); setCtActivo(null); setMensajes([]); }
            loadDevices();
        } catch (err) { toast('Error', err.response?.data?.error || 'Error eliminando', C_RED); }
    };

    const seleccionarContacto = (item) => { setCtActivo(item); loadMensajes(item.contactoId); };
    const responder = async (contactoId, texto) => {
        await api.post(`/campania/contactos/${contactoId}/responder`, { texto });
        loadMensajes(contactoId);
        if (deviceActivoId) loadBandeja(deviceActivoId);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16, gap: 12, background: '#07070a', fontFamily: "'Montserrat', sans-serif" }}>

            {/* ── Header estático (nunca cambia de tamaño) ── */}
            <div style={{
                background: 'rgba(14,14,20,0.85)', backdropFilter: BLUR, WebkitBackdropFilter: BLUR,
                border: `1px solid ${C_BDR}`, borderRadius: 16,
                padding: '11px 18px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            }}>
                {/* Izquierda: ícono + título */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: C_AMBER_SOFT, border: `1px solid ${C_AMBER_BDR}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <i className="fas fa-bullhorn" style={{ color: C_AMBER, fontSize: '0.95rem' }} />
                    </div>
                    <div>
                        <div style={{ color: C_TEXT, fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>Campañas</div>
                        <div style={{ color: C_MUTED, fontSize: '0.72rem', fontWeight: 500, marginTop: 1 }}>
                            Sector aislado del embudo principal. Usá un chip aparte.
                        </div>
                    </div>
                </div>

                {/* Derecha: tabs + controles */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Tab switcher — estilo dashboard */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
                        {[
                            { key: 'campanas',      label: 'Campañas masivas', icon: 'fa-paper-plane' },
                            { key: 'calentamiento', label: 'Mensajes de Línea', icon: 'fa-fire' },
                        ].map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)} style={{
                                padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: tab === t.key ? 'rgba(255,255,255,0.13)' : 'transparent',
                                color: tab === t.key ? C_TEXT : C_MUTED,
                                fontWeight: tab === t.key ? 700 : 500,
                                fontSize: '0.77rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                            }}>
                                <i className={`fas ${t.icon}`} style={{ color: tab === t.key ? C_AMBER : undefined, fontSize: '0.70rem' }} />
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Controles de campañas masivas — siempre en DOM, ocultos con display none */}
                    <div style={{ display: tab === 'campanas' ? 'flex' : 'none', alignItems: 'center', gap: 8 }}>
                        {devices.length > 0 && (
                            <select value={deviceActivoId || ''}
                                onChange={e => setDevActivo(Number(e.target.value))}
                                style={{
                                    padding: '6px 11px', borderRadius: 9, fontSize: '0.78rem',
                                    background: 'rgba(255,255,255,0.07)', color: C_TEXT,
                                    border: `1px solid ${C_BDR}`, cursor: 'pointer', maxWidth: 240,
                                }}>
                                {devices.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.alias}{d.numeroTelefono ? ` (${d.numeroTelefono})` : ' (sin vincular)'} — {d.estado}
                                    </option>
                                ))}
                            </select>
                        )}
                        {deviceActivoId && (
                            <button onClick={() => eliminarDevice(deviceActivoId)} style={btnDanger} title="Eliminar número activo">
                                <i className="fas fa-trash-alt" />
                            </button>
                        )}
                        <button onClick={() => setShowAdd(true)} style={btnPrimary}>
                            <i className="fas fa-plus" /> Agregar número
                        </button>
                    </div>

                    {/* Controles de calentamiento — siempre en DOM, ocultos con display none */}
                    <div style={{ display: tab === 'calentamiento' ? 'flex' : 'none', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => setShowPlan(true)} style={btnPrimary}>
                            <i className="fas fa-plus" /> Nuevo plan
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Contenido (siempre flex: 1, nunca cambia de tamaño) ── */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {tab === 'calentamiento'
                    ? <CalentamientoPanel devices={devices} showModal={showPlanModal} onCloseModal={() => setShowPlan(false)} />
                    : devices.length === 0
                        ? <div style={{
                            ...card(), flex: 1, alignItems: 'center', justifyContent: 'center',
                            border: `1px dashed rgba(245,158,11,0.20)`,
                          }}>
                            <i className="fas fa-bullhorn" style={{ fontSize: 50, opacity: 0.15, color: C_AMBER }} />
                            <h3 style={{ color: C_TEXT, marginTop: 18, fontWeight: 700 }}>Sin números de campaña</h3>
                            <p style={{ maxWidth: 360, textAlign: 'center', fontSize: '0.85rem', color: C_MUTED, margin: '8px 0 20px' }}>
                                Agregá un número aparte (no el principal del negocio) para mandar campañas masivas.
                                Cuando alguien responda podés chatear acá.
                            </p>
                            <button onClick={() => setShowAdd(true)} style={btnPrimary}>
                                <i className="fas fa-plus" /> Agregar primer número
                            </button>
                          </div>
                        : <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
                            <ContactosPanel deviceId={deviceActivoId} contactos={contactos} onReload={() => loadContactos(deviceActivoId)} />
                            <ChatPanel bandeja={bandeja} contactoActivo={contactoActivo} mensajes={mensajes}
                                onSelectContacto={seleccionarContacto} onResponder={responder} />
                          </div>
                }
            </div>

            <AddDeviceModal active={showAddModal} onClose={() => setShowAdd(false)} onCreated={loadDevices} />
        </div>
    );
}
