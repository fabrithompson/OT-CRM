import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { clickable } from '../utils/a11y';
import useDialog from '../hooks/useDialog';
import { useUser } from '../context/UserContext';
import useWebSocket from '../hooks/useWebSocket';
import '../assets/css/pages/Spam.css';
import { useLanguage } from '../context/LangContext';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C_AMBER      = '#f59e0b';
const C_AMBER_SOFT = 'rgba(245,158,11,0.10)';
const C_AMBER_BDR  = 'rgba(245,158,11,0.30)';
const C_GREEN      = '#10b981';
const C_GREEN_SOFT = 'rgba(16,185,129,0.12)';
const C_RED        = '#ef4444';
const C_CARD       = 'rgba(24,18,38,0.72)';   // morado oscuro translúcido
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
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(239,68,68,0.15)', color: C_RED,
    border: '1px solid rgba(239,68,68,0.25)',
    display: 'inline-flex', alignItems: 'center',
};

const rowStyle = {
    display: 'flex', alignItems: 'center', padding: '9px 14px', cursor: 'pointer',
    borderBottom: `1px solid ${C_BDR_SOFT}`, transition: 'background 0.12s',
};

// ─── AddDeviceModal ───────────────────────────────────────────────────────────
function AddDeviceModal({ active, onClose, onCreated }) {
    const { t } = useLanguage();
    const [alias, setAlias]       = useState('');
    const [creating, setCreating] = useState(false);
    const [qr, setQr]             = useState(null);
    const [device, setDevice]     = useState(null);
    const [statusMsg, setStatusMsg] = useState('');
    const pollRef = useRef(null);
    const toast   = useToast();

    // Reset del form cuando el modal se cierra (active=false). Side effect intencional.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!active) {
            setAlias(''); setQr(null); setDevice(null); setStatusMsg('');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
    }, [active]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const crear = async () => {
        if (!alias.trim()) { toast(t('common.notice'), t('spam.errAlias'), C_AMBER); return; }
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
                    toast(t('spam.linked'), t('spam.numberConnected'), C_GREEN);
                    onCreated?.(); onClose();
                }
            } catch { /* sigue */ }
        }, 2500);
    };

    const dialog = useDialog(active, onClose);
    if (!active) return null;
    return (
        <div className="custom-modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal spm-1" {...dialog}>
                <h3 className="spm-2">
                    {t('spam.addTitle')}
                </h3>
                {!device && (
                    <>
                        <p className="spm-3" style={{ color: C_MUTED }}>
                            {t('spam.useA')} <strong style={{ color: C_MUTED2 }}>{t('spam.useB')}</strong>{t('spam.useC')}
                        </p>
                        <input aria-label={t('spam.aliasPh')} className="clean-input spm-4" autoFocus
                            placeholder={t('spam.aliasPh')}
                            value={alias} autoComplete="off"
                            onChange={e => setAlias(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && crear()} />
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={onClose} disabled={creating}>{t('common.cancel')}</button>
                            <button className="btn-modal btn-confirm" onClick={crear} disabled={creating}>
                                {creating ? <i className="fas fa-spinner fa-spin" /> : 'Crear'}
                            </button>
                        </div>
                    </>
                )}
                {device && (
                    <div className="spm-5">
                        <p className="spm-6" style={{ color: C_MUTED }}>{statusMsg}</p>
                        {qr
                            ? <img className="spm-7" src={qr} alt="QR" />
                            : <div className="spinner spm-8" />}
                        <div className="modal-actions spm-9">
                            <button className="btn-modal btn-cancel" onClick={onClose}>{t('ui.close')}</button>
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
    const { t } = useLanguage();
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [plantilla, setPlantilla]         = useState('Hola {nombre}, te escribo de…');
    const [enviando, setEnviando]           = useState(false);
    const fileRef = useRef(null);
    const toast   = useToast();

    // Reset de la selección cuando cambia el device activo (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (!deviceId)              { toast(t('common.notice'), t('spam.errSelectNumber'), C_AMBER); return; }
        if (seleccionados.size === 0) { toast(t('common.notice'), t('spam.errSelectContact'), C_AMBER); return; }
        if (!plantilla.trim())       { toast(t('common.notice'), t('spam.errEmptyTemplate'), C_AMBER); return; }
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
                <span><i className="fas fa-users" style={{ color: C_AMBER }} /> {t('spam.contacts')}</span>
                <div className="spm-10">
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importar} />
                    <button onClick={() => fileRef.current?.click()} style={btnGhost} disabled={!deviceId}>
                        <i className="fas fa-file-upload" /> {t('spam.import')}
                    </button>
                </div>
            </div>

            <div className="spm-11" style={{ borderBottom: `1px solid ${C_BDR_SOFT}` }}>
                <label className="spm-12" style={{ color: C_MUTED }}>
                    <input className="spm-13" type="checkbox"
                        checked={contactos.length > 0 && seleccionados.size === contactos.length}
                        onChange={toggleTodos} />
                    {t('spam.all')} ({seleccionados.size}/{contactos.length})
                </label>
            </div>

            <div className="spm-14">
                {contactos.length === 0 && (
                    <p className="spm-15" style={{ color: C_MUTED }}>
                        {t('spam.noContactsA')} <strong>{t('spam.colName')}</strong> {t('spam.and')} <strong>{t('spam.colPhone')}</strong>.
                    </p>
                )}
                {contactos.map(c => (
                    <div key={c.id} onClick={() => toggleUno(c.id)}
                        style={{ ...rowStyle, background: seleccionados.has(c.id) ? C_AMBER_SOFT : 'transparent' }}>
                        <input className="spm-16" type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggleUno(c.id)}
                            aria-label={c.nombre || c.telefono} onClick={e => e.stopPropagation()} />
                        <div className="spm-17">
                            <div className="spm-18" style={{ color: C_TEXT }}>{c.nombre}</div>
                            <div className="spm-19" style={{ color: C_MUTED }}>{c.telefono}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="spm-20" style={{ borderTop: `1px solid ${C_BDR_SOFT}` }}>
                <div className="spm-21" style={{ color: C_MUTED }}>
                    {t('spam.msgA')} <code style={{ color: C_AMBER }}>{'{nombre}'}</code> {t('spam.msgB')}
                </div>
                <textarea aria-label={t('spam.campaignMsg')} value={plantilla} onChange={e => setPlantilla(e.target.value)}
                    rows={3} className="clean-input no-resize spm-22" />
                <button onClick={enviar} disabled={enviando || seleccionados.size === 0 || !deviceId}
                    style={{ ...btnPrimary, width: '100%', marginTop: 8, justifyContent: 'center' }}>
                    {enviando
                        ? <><i className="fas fa-spinner fa-spin" /> {t('spam.queueing')}</>
                        : <><i className="fas fa-paper-plane" /> {t('spam.sendCampaign')} ({seleccionados.size})</>}
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
    const { t } = useLanguage();
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
            <div className="spam-chat-split spm-23">
                {/* Bandeja */}
                <div className="spam-chat-bandeja spm-24" style={{ borderRight: `1px solid ${C_BDR}` }}>
                    <div style={cardTitle}><i className="fas fa-inbox" style={{ color: C_AMBER }} /> {t('spam.inbox')}</div>
                    <div className="spm-14">
                        {bandeja.length === 0 && (
                            <p className="spm-25" style={{ color: C_MUTED }}>
                                {t('spam.inboxEmpty')}
                            </p>
                        )}
                        {bandeja.map(item => (
                            <div className="spm-26" key={item.contactoId} {...clickable(() => onSelectContacto(item))}
                                aria-current={contactoActivo?.contactoId === item.contactoId ? 'true' : undefined}
                                style={{ background: contactoActivo?.contactoId === item.contactoId ? C_AMBER_SOFT : 'transparent', borderLeft: `3px solid ${contactoActivo?.contactoId === item.contactoId ? C_AMBER : 'transparent'}`, borderBottom: `1px solid ${C_BDR_SOFT}` }}>
                                <div className="spm-27">
                                    <div className="spm-28" style={{ color: C_TEXT }}>
                                        {item.nombre}
                                    </div>
                                    {item.noLeidos > 0 && (
                                        <span className="spm-29" style={{ background: C_GREEN }}>
                                            {item.noLeidos}
                                        </span>
                                    )}
                                </div>
                                <div className="spm-30" style={{ color: C_MUTED }}>{item.telefono}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Conversación */}
                <div className="spm-31">
                    {!contactoActivo
                        ? <div className="spm-32" style={{ color: C_MUTED }}>
                            <i className="fas fa-comments spm-33" />
                            <p className="spm-34">{t('spam.selectChat')}</p>
                          </div>
                        : <>
                            <div style={{ ...cardTitle, padding: '10px 14px' }}>
                                <div>
                                    <div className="spm-35" style={{ color: C_TEXT }}>{contactoActivo.nombre}</div>
                                    <div className="spm-36" style={{ color: C_MUTED }}>{contactoActivo.telefono}</div>
                                </div>
                            </div>
                            <div className="spm-37">
                                {mensajes.map(m => (
                                    <div className="spm-38" key={m.id} style={{ justifyContent: m.direccion === 'OUT' ? 'flex-end' : 'flex-start' }}>
                                        <div className="spm-123" style={{ borderRadius: '12px', background: m.direccion === 'OUT' ? C_GREEN_SOFT : 'rgba(255,255,255,0.05)', border: `1px solid ${m.direccion === 'OUT' ? 'rgba(16,185,129,0.25)' : C_BDR}`, color: C_TEXT }}>
                                            {m.texto}
                                            <div className="spm-40">{formatHora(m.fecha)}</div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={msgEndRef} />
                            </div>
                            <div className="spm-41" style={{ borderTop: `1px solid ${C_BDR}` }}>
                                <input type="text" aria-label={t('spam.writeMsg')} value={borrador} onChange={e => setBorrador(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                    placeholder={t('spam.writeMsgPh')} className="clean-input spm-42" />
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
    const { t } = useLanguage();
    const [nombre, setNombre]           = useState('');
    const [selDevices, setSelDevices]   = useState(new Set());
    const [mensajesPorDia, setMsgs]     = useState(10);
    const [textoActual, setTextoActual] = useState('');
    const [textos, setTextos]           = useState([]);
    const [saving, setSaving]           = useState(false);
    const toast = useToast();

    // Reset del form cuando el modal se cierra (intencional).
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!active) { setNombre(''); setSelDevices(new Set()); setMsgs(10); setTextoActual(''); setTextos([]); setSaving(false); }
    }, [active]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const toggleDevice = (id) => setSelDevices(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const agregarTexto = () => { const t = textoActual.trim(); if (!t) return; setTextos(p => [...p, t]); setTextoActual(''); };
    const quitarTexto  = (i) => setTextos(p => p.filter((_, j) => j !== i));

    const crear = async () => {
        if (!nombre.trim())       { toast(t('common.notice'), t('spam.errPlanName'), C_AMBER); return; }
        if (selDevices.size < 2)  { toast(t('common.notice'), t('spam.errTwoLines'), C_AMBER); return; }
        if (textos.length === 0)  { toast(t('common.notice'), t('spam.errPool'), C_AMBER); return; }
        setSaving(true);
        try {
            await api.post('/calentamiento/planes', {
                nombre: nombre.trim(), dispositivoIds: Array.from(selDevices),
                mensajesPorParPorDia: mensajesPorDia, textos,
            });
            toast(t('spam.planCreated'), t('spam.planCreatedMsg'), C_GREEN);
            onCreated?.(); onClose();
        } catch (err) { toast('Error', err.response?.data?.error || 'Error creando plan', C_RED);
        } finally { setSaving(false); }
    };

    const dialog = useDialog(active, onClose, { canClose: !saving });
    if (!active) return null;
    const connected = devices.filter(d => d.estado === 'CONNECTED');

    return (
        <div className="custom-modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal spm-43" {...dialog}>
                <h3 className="spm-44" style={{ color: C_TEXT }}>
                    <i className="fas fa-fire spm-13" style={{ color: C_AMBER }} />
                    {t('spam.newWarmup')}
                </h3>

                {/* Nombre */}
                <div className="spm-45">
                    <label className="spm-46" style={{ color: C_MUTED }}>
                        {t('spam.planName')}
                    </label>
                    <input aria-label={t('spam.planName')} className="clean-input" placeholder={t('spam.planNamePh')}
                        value={nombre} onChange={e => setNombre(e.target.value)} />
                </div>

                {/* Líneas */}
                <div className="spm-45">
                    <label className="spm-47" style={{ color: C_MUTED }}>
                        {t('spam.linesToInclude')} <span className="spm-48" style={{ color: C_MUTED }}>{t('spam.min2')}</span>
                    </label>
                    {connected.length === 0
                        ? <p className="spm-49" style={{ color: C_RED }}>{t('spam.noConnected')}</p>
                        : <div className="spm-50">
                            {connected.map(d => (
                                <div className="spm-124" key={d.id} {...clickable(() => toggleDevice(d.id), { role: 'checkbox', checked: selDevices.has(d.id) })} style={{ borderRadius: '20px', border: `1px solid ${selDevices.has(d.id) ? C_AMBER_BDR : C_BDR}`, background: selDevices.has(d.id) ? C_AMBER_SOFT : 'rgba(255,255,255,0.04)', color: selDevices.has(d.id) ? C_AMBER : C_MUTED2 }}>
                                    {d.alias}{d.numeroTelefono ? ` (${d.numeroTelefono})` : ''}
                                </div>
                            ))}
                          </div>
                    }
                </div>

                {/* Mensajes por día */}
                <div className="spm-45">
                    <label className="spm-46" style={{ color: C_MUTED }}>
                        {t('spam.msgsPerPair')}
                    </label>
                    <input aria-label={t('spam.msgsPerPair')} type="number" className="clean-input spm-52"
                        min={1} max={200} value={mensajesPorDia}
                        onChange={e => setMsgs(Number(e.target.value))} />
                </div>

                {/* Pool de mensajes */}
                <div className="spm-53">
                    <label className="spm-47" style={{ color: C_MUTED }}>
                        {t('spam.pool')} <span className="spm-48" style={{ color: C_MUTED }}>{t('spam.poolHint')}</span>
                    </label>
                    <div className="spm-54">
                        <input aria-label={t('spam.poolPh')} className="clean-input spm-55"
                            placeholder={t('spam.poolPh')}
                            value={textoActual} onChange={e => setTextoActual(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && agregarTexto()} />
                        <button onClick={agregarTexto} style={btnGhost}><i className="fas fa-plus" /></button>
                    </div>
                    <div className="spm-56">
                        {textos.length === 0 && <p className="spm-57" style={{ color: C_MUTED }}>{t('spam.noMsgs')}</p>}
                        {textos.map((t, i) => (
                            <div className="spm-125" key={i} style={{ borderRadius: '8px', border: `1px solid ${C_BDR}`, color: C_TEXT }}>
                                <span className="spm-55">{t}</span>
                                <button className="spm-59" onClick={() => quitarTexto(i)} style={{ color: C_RED }}>
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
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
    const { t } = useLanguage();
    const [planes, setPlanes]               = useState([]);
    const [historial, setHistorial]         = useState(null);
    const [loadingHistorial, setLoadingH]   = useState(false);
    const [planAEliminar, setPlanAEliminar] = useState(null); // { id, nombre } | null
    const [eliminando, setEliminando]       = useState(false);
    const planDialog = useDialog(!!planAEliminar, () => setPlanAEliminar(null), { canClose: !eliminando });
    const toast = useToast();

    const loadPlanes = useCallback(async () => {
        try { const { data } = await api.get('/calentamiento/planes'); setPlanes(data || []);
        } catch { toast(t('common.errorTitle'), t('spam.errLoadPlans'), C_RED); }
    }, [toast, t]);

    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadPlanes(); }, [loadPlanes]);

    const pausar   = async (id) => { try { await api.patch(`/calentamiento/planes/${id}/pausar`);   loadPlanes(); } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED); } };
    const reanudar = async (id) => { try { await api.patch(`/calentamiento/planes/${id}/reanudar`); loadPlanes(); } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED); } };
    const pedirEliminar = (plan) => setPlanAEliminar({ id: plan.id, nombre: plan.nombre });
    const confirmarEliminar = async () => {
        if (!planAEliminar) return;
        setEliminando(true);
        try {
            await api.delete(`/calentamiento/planes/${planAEliminar.id}`);
            toast(t('spam.deleted'), '', C_GREEN);
            if (historial?.planId === planAEliminar.id) setHistorial(null);
            setPlanAEliminar(null);
            loadPlanes();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error', C_RED);
        } finally {
            setEliminando(false);
        }
    };
    const verHistorial = async (id) => {
        if (historial?.planId === id) { setHistorial(null); return; }
        setLoadingH(true);
        try { const { data } = await api.get(`/calentamiento/planes/${id}/historial`); setHistorial({ planId: id, items: data });
        } catch (err) { toast('Error', err.response?.data?.error || 'Error', C_RED);
        } finally { setLoadingH(false); }
    };

    return (
        <div className="spm-60">
            {/* Lista de planes */}
            <div style={{ ...card(), flex: 1, minHeight: 0 }}>
                <div style={{ ...cardTitle, justifyContent: 'space-between' }}>
                    <span><i className="fas fa-list" style={{ color: C_AMBER }} /> {t('spam.activePlans')}</span>
                    <button onClick={loadPlanes} style={btnGhost} title={t('spam.refresh')}>
                        <i className="fas fa-sync-alt" />
                    </button>
                </div>
                <div className="spm-61">
                    {planes.length === 0 && (
                        <div className="spm-62" style={{ color: C_MUTED }}>
                            <i className="fas fa-fire spm-63" style={{ color: C_AMBER }} />
                            <p className="spm-34">{t('spam.noPlans')}</p>
                            <p className="spm-64">{t('spam.noPlansHint')}</p>
                        </div>
                    )}
                    {planes.map(plan => (
                        <div className="spm-126" key={plan.id} style={{ borderRadius: '12px', border: `1px solid ${plan.estado === 'ACTIVO' ? C_AMBER_BDR : C_BDR}` }}>
                            <div className="spm-66">
                                <div className="spm-17">
                                    <div className="spm-67">
                                        <span className="spm-68" style={{ color: C_TEXT }}>{plan.nombre}</span>
                                        <span className="spm-127" style={{ borderRadius: '10px', background: plan.estado === 'ACTIVO' ? C_AMBER_SOFT : 'rgba(255,255,255,0.05)', color: plan.estado === 'ACTIVO' ? C_AMBER : C_MUTED, border: `1px solid ${plan.estado === 'ACTIVO' ? C_AMBER_BDR : C_BDR}` }}>
                                            {plan.estado}
                                        </span>
                                    </div>
                                    <div className="spm-70" style={{ color: C_MUTED }}>
                                        {plan.mensajesPorParPorDia} {t('spam.perPairDay')} · {plan.dispositivos?.length || 0} {t('spam.lines')} · {plan.textos?.length || 0} {t('spam.inPool')}
                                    </div>
                                    <div className="spm-71">
                                        {(plan.dispositivos || []).map(d => (
                                            <span className="spm-128" key={d.id} style={{ borderRadius: '10px', background: d.estado === 'CONNECTED' ? C_GREEN_SOFT : 'rgba(255,255,255,0.04)', color: d.estado === 'CONNECTED' ? C_GREEN : C_MUTED, border: `1px solid ${d.estado === 'CONNECTED' ? 'rgba(16,185,129,0.25)' : C_BDR}` }}>
                                                {d.alias}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="spm-73">
                                    <button onClick={() => verHistorial(plan.id)} title={t('spam.viewHistory')}
                                        style={{ ...btnGhost, color: historial?.planId === plan.id ? C_AMBER : undefined }}>
                                        <i className="fas fa-history" />
                                    </button>
                                    {plan.estado === 'ACTIVO'
                                        ? <button onClick={() => pausar(plan.id)} style={btnGhost} title={t('spam.pause')}><i className="fas fa-pause" /></button>
                                        : <button onClick={() => reanudar(plan.id)} style={{ ...btnGhost, color: C_GREEN }} title={t('spam.resume')}><i className="fas fa-play" /></button>
                                    }
                                    <button onClick={() => pedirEliminar(plan)} style={btnDanger} title={t('common.delete')}><i className="fas fa-trash-alt" /></button>
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
                        <span><i className="fas fa-history" style={{ color: C_AMBER }} /> {t('spam.history')}</span>
                        <button onClick={() => setHistorial(null)} style={btnGhost}><i className="fas fa-times" /></button>
                    </div>
                    <div className="spm-74">
                        {loadingHistorial && <div className="spm-75"><div className="spinner spm-76" /></div>}
                        {!loadingHistorial && (historial?.items?.length === 0) && (
                            <p className="spm-77" style={{ color: C_MUTED }}>{t('spam.noSends')}</p>
                        )}
                        {!loadingHistorial && (historial?.items || []).map(item => (
                            <div className="spm-78" key={item.id} style={{ borderBottom: `1px solid ${C_BDR_SOFT}` }}>
                                <div className="spm-79">
                                    <span className="spm-80" style={{ color: C_MUTED }}>
                                        <strong style={{ color: C_TEXT }}>{item.origen}</strong>
                                        <i className="fas fa-arrow-right spm-81" />
                                        <strong style={{ color: C_TEXT }}>{item.destino}</strong>
                                    </span>
                                    <div className="spm-82">
                                        {item.respondido && <span className="spm-83" style={{ color: C_GREEN }}><i className="fas fa-reply" /> {t('spam.respShort')}</span>}
                                        <span className="spm-84" style={{ background: item.estado === 'SENT' ? C_GREEN_SOFT : item.estado === 'FAILED' ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)', color: item.estado === 'SENT' ? C_GREEN : item.estado === 'FAILED' ? C_RED : C_MUTED }}>{item.estado}</span>
                                    </div>
                                </div>
                                <div className="spm-85" style={{ color: C_TEXT }}>{item.texto}</div>
                                <div className="spm-86" style={{ color: C_MUTED }}>
                                    {item.fechaEnviado ? new Date(item.fechaEnviado).toLocaleString() : 'Pendiente'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <CrearPlanModal active={showModal} onClose={onCloseModal} onCreated={loadPlanes} devices={devices} />

            {/* Confirmación de eliminación de plan */}
            {planAEliminar && (
                <div className="custom-modal-overlay active"
                    onClick={(e) => { if (e.target === e.currentTarget && !eliminando) setPlanAEliminar(null); }}>
                    <div className="custom-modal spm-1" {...planDialog}>
                        <h3 className="spm-87" style={{ color: C_TEXT }}>
                            <i className="fas fa-exclamation-triangle spm-13" style={{ color: C_RED }} />
                            {t('spam.deletePlan')}
                        </h3>
                        <p className="spm-88" style={{ color: C_MUTED2 }}>
                            {t('spam.confirmDeleteA')} <strong style={{ color: C_TEXT }}>{planAEliminar.nombre}</strong>{t('spam.confirmDeletePlanB')}
                        </p>
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel"
                                onClick={() => setPlanAEliminar(null)} disabled={eliminando}>
                                {t('common.cancel')}
                            </button>
                            <button className="btn-modal btn-confirm"
                                style={{ background: C_RED }}
                                onClick={confirmarEliminar} disabled={eliminando}>
                                {eliminando ? <i className="fas fa-spinner fa-spin" /> : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
CalentamientoPanel.propTypes = {
    devices: PropTypes.array.isRequired, showModal: PropTypes.bool.isRequired, onCloseModal: PropTypes.func.isRequired,
};

// ─── UpgradeWall: bloqueo para plan FREE ─────────────────────────────────────
function UpgradeWall() {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const features = [
        { icon: 'fa-paper-plane', text: 'Campañas masivas a miles de contactos' },
        { icon: 'fa-fire',        text: 'Calentamiento automático de líneas' },
        { icon: 'fa-comments',    text: 'Bandeja de respuestas de campaña' },
        { icon: 'fa-shield-alt',  text: 'Anti-ban con delays aleatorios y límites diarios' },
    ];

    return (
        <div className="spm-89">
            <div className="spm-90" style={{ backdropFilter: BLUR, WebkitBackdropFilter: BLUR }}>
                {/* Glow decorativo */}
                <div className="spm-91" />

                {/* Ícono */}
                <div className="spm-129" style={{ borderRadius: '18px', background: C_AMBER_SOFT, border: `1px solid ${C_AMBER_BDR}` }}>
                    <i className="fas fa-lock spm-93" style={{ color: C_AMBER }} />
                </div>

                {/* Badge de plan */}
                <div className="spm-130" style={{ borderRadius: '20px', background: C_AMBER_SOFT, border: `1px solid ${C_AMBER_BDR}`, color: C_AMBER }}>
                    <i className="fas fa-bolt spm-95" /> {t('spam.fromPro')}
                </div>

                <h2 className="spm-96" style={{ color: C_TEXT }}>
                    {t('spam.massTitle')}
                </h2>
                <p className="spm-97">
                    {t('spam.wallDesc')}
                </p>

                {/* Features */}
                <div className="spm-98">
                    {features.map((f, i) => (
                        <div className="spm-99" key={i}>
                            <div className="spm-131" style={{ borderRadius: '8px', background: C_AMBER_SOFT, border: `1px solid ${C_AMBER_BDR}` }}>
                                <i className={`fas ${f.icon} spm-101`} style={{ color: C_AMBER }} />
                            </div>
                            <span className="spm-102">{f.text}</span>
                        </div>
                    ))}
                </div>

                {/* CTA */}
                <button
                    onClick={() => navigate('/planes')}
                    style={{
                        width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                        cursor: 'pointer', fontFamily: "'Montserrat', sans-serif",
                        background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 60%, #fbbf24 100%)',
                        color: '#000', fontWeight: 800, fontSize: '0.95rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: '0 4px 20px rgba(245,158,11,0.30)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(245,158,11,0.45)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(245,158,11,0.30)'; }}
                >
                    <i className="fas fa-arrow-up" /> {t('spam.seePlans')}
                </button>

                <p className="spm-103">
                    {t('spam.startFrom')} <strong className="spm-104">{t('spam.planPro')}</strong> {t('spam.cancelAnytime')}
                </p>
            </div>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Spam() {
    const { t } = useLanguage();
    const toast               = useToast();
    const { agenciaId, usuario, loading: loadingUser } = useUser();

    // Fallback al nombre si el backend (versión vieja) aún no envía el flag.
    const planNombre = usuario?.plan?.nombre || 'FREE';
    const campaniasHabilitadas = usuario?.plan?.campaniasHabilitadas === true
        || (planNombre !== 'FREE' && usuario?.plan?.campaniasHabilitadas !== false);

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
        } catch { toast(t('common.errorTitle'), t('spam.errLoadNumbers'), C_RED); }
    }, [toast, t]);

    const loadContactos = useCallback(async (id) => {
        if (!id) { setContactos([]); return; }
        try { const { data } = await api.get(`/campania/devices/${id}/contactos`); setContactos(data || []);
        } catch (err) { console.warn('Spam: no se pudieron cargar contactos:', err); }
    }, []);

    const loadBandeja = useCallback(async (id) => {
        if (!id) { setBandeja([]); return; }
        try { const { data } = await api.get(`/campania/devices/${id}/bandeja`); setBandeja(data || []);
        } catch (err) { console.warn('Spam: no se pudo cargar la bandeja:', err); }
    }, []);

    const loadMensajes = useCallback(async (id) => {
        if (!id) { setMensajes([]); return; }
        try { const { data } = await api.get(`/campania/contactos/${id}/mensajes`); setMensajes(data || []);
        } catch (err) { console.warn('Spam: no se pudieron cargar mensajes:', err); }
    }, []);

    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadDevices(); }, [loadDevices]);
    // Cuando cambia el device activo: recarga sus datos y resetea selección de contacto.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (deviceActivoId) { loadContactos(deviceActivoId); loadBandeja(deviceActivoId); setCtActivo(null); setMensajes([]); }
    }, [deviceActivoId, loadContactos, loadBandeja]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useWebSocket(agenciaId, () => { }, (client) => {
        // Estado de los dispositivos (SCAN_QR / CONNECTED / DISCONNECTED) vía /topic/bot
        client.subscribe(`/topic/bot/${agenciaId}`, (msg) => {
            try {
                const p = JSON.parse(msg.body);
                if (!p?.sessionId) return;
                setDevices(prev => {
                    const exists = prev.some(d => d.sessionId === p.sessionId);
                    if (!exists) { loadDevices(); return prev; }
                    return prev.map(d =>
                        d.sessionId === p.sessionId
                            ? { ...d, estado: p.status || p.tipo || d.estado }
                            : d
                    );
                });
                // CONNECTED recarga para tomar el número de teléfono detectado por el bot
                if (p.status === 'CONNECTED' || p.tipo === 'CONNECTED') loadDevices();
            } catch (err) {
                console.warn('Spam bot payload inválido:', err);
            }
        });

        // Eventos del módulo de campañas vía /topic/campania
        client.subscribe(`/topic/campania/${agenciaId}`, (msg) => {
            try {
                const p = JSON.parse(msg.body);
                const tipo = p.tipo;

                if (tipo === 'MENSAJE_IN' || tipo === 'MENSAJE_OUT') {
                    const devId = devActivoRef.current;
                    const ctId  = ctActivoRef.current?.contactoId;
                    if (devId) loadBandeja(devId);
                    if (ctId === p.contactoId) loadMensajes(p.contactoId);
                    if (tipo === 'MENSAJE_IN') {
                        toast('Nuevo mensaje', p.nombre || p.telefono || '', C_AMBER);
                    }
                    return;
                }
                if (tipo === 'MENSAJE_LEIDO') {
                    setBandeja(prev => prev.map(b =>
                        b.contactoId === p.contactoId ? { ...b, noLeidos: 0 } : b));
                    return;
                }
                if (tipo === 'DEVICE_ADDED' && p.device) {
                    setDevices(prev => prev.some(d => d.id === p.device.id)
                        ? prev : [...prev, p.device]);
                    setDevActivo(prev => prev || p.device.id);
                    return;
                }
                if (tipo === 'DEVICE_DELETED') {
                    setDevices(prev => prev.filter(d => d.id !== p.deviceId));
                    if (devActivoRef.current === p.deviceId) {
                        setDevActivo(null);
                        setContactos([]); setBandeja([]); setCtActivo(null); setMensajes([]);
                    }
                    return;
                }
                if (tipo === 'CONTACTOS_IMPORTADOS') {
                    if (devActivoRef.current === p.deviceId) loadContactos(p.deviceId);
                    return;
                }
                if (tipo === 'CONTACTO_ELIMINADO') {
                    setContactos(prev => prev.filter(c => c.id !== p.contactoId));
                    setBandeja(prev => prev.filter(b => b.contactoId !== p.contactoId));
                    if (ctActivoRef.current?.contactoId === p.contactoId) {
                        setCtActivo(null); setMensajes([]);
                    }
                    return;
                }
                if (tipo === 'CAMPANIA_INICIADA') {
                    const r = p.resumen || {};
                    toast('Campaña encolada',
                        `${r.encolados || 0} mensajes · ${r.salteados || 0} salteados`, C_GREEN);
                    return;
                }
                if (tipo === 'ENVIO_PROCESADO') {
                    if (devActivoRef.current === p.deviceId) loadBandeja(p.deviceId);
                    return;
                }
            } catch (err) {
                console.warn('Spam campania payload inválido:', err);
            }
        });
    });

    const [deviceAEliminar, setDeviceAEliminar] = useState(null); // { id, alias } | null
    const [eliminandoDevice, setEliminandoDevice] = useState(false);
    const deviceDialog = useDialog(!!deviceAEliminar, () => setDeviceAEliminar(null), { canClose: !eliminandoDevice });
    const pedirEliminarDevice = (d) => setDeviceAEliminar({ id: d.id, alias: d.alias || d.numeroTelefono || `#${d.id}` });
    const confirmarEliminarDevice = async () => {
        if (!deviceAEliminar) return;
        setEliminandoDevice(true);
        try {
            await api.delete(`/campania/devices/${deviceAEliminar.id}`);
            toast(t('spam.deleted'), t('spam.numberDeleted'), C_GREEN);
            if (deviceActivoId === deviceAEliminar.id) { setDevActivo(null); setContactos([]); setBandeja([]); setCtActivo(null); setMensajes([]); }
            setDeviceAEliminar(null);
            loadDevices();
        } catch (err) {
            toast('Error', err.response?.data?.error || 'Error eliminando', C_RED);
        } finally {
            setEliminandoDevice(false);
        }
    };

    const seleccionarContacto = (item) => { setCtActivo(item); loadMensajes(item.contactoId); };
    const responder = async (contactoId, texto) => {
        await api.post(`/campania/contactos/${contactoId}/responder`, { texto });
        loadMensajes(contactoId);
        if (deviceActivoId) loadBandeja(deviceActivoId);
    };

    // ── Gates (después de todos los hooks para no romper Rules of Hooks) ──────
    if (loadingUser) {
        return (
            <div className="spm-105">
                <div className="spinner" />
            </div>
        );
    }
    if (!campaniasHabilitadas) return <UpgradeWall />;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="spm-106">

            {/* ── Header estático (nunca cambia de tamaño) ── */}
            <div className="spam-head spm-132" style={{ borderRadius: '16px', backdropFilter: BLUR, WebkitBackdropFilter: BLUR, border: `1px solid ${C_BDR}` }}>
                {/* Izquierda: ícono + título */}
                <div className="spm-108">
                    <div className="spm-133" style={{ borderRadius: '10px', background: C_AMBER_SOFT, border: `1px solid ${C_AMBER_BDR}` }}>
                        <i className="fas fa-bullhorn spm-110" style={{ color: C_AMBER }} />
                    </div>
                    <div>
                        <div className="spm-111" style={{ color: C_TEXT }}>{t('spam.title')}</div>
                        <div className="spm-112" style={{ color: C_MUTED }}>
                            {t('spam.subtitle')}
                        </div>
                    </div>
                </div>

                {/* Derecha: tabs + controles */}
                <div className="spam-head__right spm-113">
                    {/* Tab switcher — estilo dashboard */}
                    <div className="spm-114">
                        {[
                            { key: 'campanas',      label: t('spam.massTitle'), icon: 'fa-paper-plane' },
                            { key: 'calentamiento', label: t('spam.lineMsgs'), icon: 'fa-fire' },
                        ].map(t => (
                            <button className="spm-115" key={t.key} onClick={() => setTab(t.key)} style={{ background: tab === t.key ? 'rgba(255,255,255,0.13)' : 'transparent', color: tab === t.key ? C_TEXT : C_MUTED, fontWeight: tab === t.key ? 700 : 500 }}>
                                <i className={`fas ${t.icon} spm-116`} style={{ color: tab === t.key ? C_AMBER : undefined }} />
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Controles de campañas masivas — siempre en DOM, ocultos con display none */}
                    <div className="spm-117" style={{ display: tab === 'campanas' ? 'flex' : 'none' }}>
                        {devices.length > 0 && (
                            <select className="spm-134" aria-label={t('spam.activeNumber')} value={deviceActivoId || ''}
                                onChange={e => setDevActivo(Number(e.target.value))}
                                style={{ borderRadius: '9px', color: C_TEXT, border: `1px solid ${C_BDR}` }}>
                                {devices.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.alias}{d.numeroTelefono ? ` (${d.numeroTelefono})` : ' (sin vincular)'} — {d.estado}
                                    </option>
                                ))}
                            </select>
                        )}
                        {deviceActivoId && (
                            <button onClick={() => pedirEliminarDevice(devices.find(d => d.id === deviceActivoId) || { id: deviceActivoId })} style={btnDanger} title={t('spam.deleteActive')}>
                                <i className="fas fa-trash-alt" />
                            </button>
                        )}
                        <button onClick={() => setShowAdd(true)} style={btnPrimary}>
                            <i className="fas fa-plus" /> {t('spam.addNumber')}
                        </button>
                    </div>

                    {/* Controles de calentamiento — siempre en DOM, ocultos con display none */}
                    <div className="spm-117" style={{ display: tab === 'calentamiento' ? 'flex' : 'none' }}>
                        <button onClick={() => setShowPlan(true)} style={btnPrimary}>
                            <i className="fas fa-plus" /> {t('spam.newPlan')}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Contenido (siempre flex: 1, nunca cambia de tamaño) ── */}
            <div className="spm-119">
                {tab === 'calentamiento'
                    ? <CalentamientoPanel devices={devices} showModal={showPlanModal} onCloseModal={() => setShowPlan(false)} />
                    : devices.length === 0
                        ? <div style={{
                            ...card(), flex: 1, alignItems: 'center', justifyContent: 'center',
                            border: `1px dashed rgba(245,158,11,0.20)`,
                          }}>
                            <i className="fas fa-bullhorn spm-120" style={{ color: C_AMBER }} />
                            <h3 className="spm-121" style={{ color: C_TEXT }}>{t('spam.noNumbers')}</h3>
                            <p className="spm-122" style={{ color: C_MUTED }}>
                                {t('spam.noNumbersDesc')}
                            </p>
                            <button onClick={() => setShowAdd(true)} style={btnPrimary}>
                                <i className="fas fa-plus" /> {t('spam.addFirst')}
                            </button>
                          </div>
                        : <div className="spam-body spm-60">
                            <ContactosPanel deviceId={deviceActivoId} contactos={contactos} onReload={() => loadContactos(deviceActivoId)} />
                            <ChatPanel bandeja={bandeja} contactoActivo={contactoActivo} mensajes={mensajes}
                                onSelectContacto={seleccionarContacto} onResponder={responder} />
                          </div>
                }
            </div>

            <AddDeviceModal active={showAddModal} onClose={() => setShowAdd(false)} onCreated={loadDevices} />

            {/* Confirmación de eliminación de dispositivo */}
            {deviceAEliminar && (
                <div className="custom-modal-overlay active"
                    onClick={(e) => { if (e.target === e.currentTarget && !eliminandoDevice) setDeviceAEliminar(null); }}>
                    <div className="custom-modal spm-1" {...deviceDialog}>
                        <h3 className="spm-87" style={{ color: C_TEXT }}>
                            <i className="fas fa-exclamation-triangle spm-13" style={{ color: C_RED }} />
                            {t('spam.deleteNumber')}
                        </h3>
                        <p className="spm-88" style={{ color: C_MUTED2 }}>
                            {t('spam.confirmDeleteA')} <strong style={{ color: C_TEXT }}>{deviceAEliminar.alias}</strong>{t('spam.confirmDeleteNumberB')}
                        </p>
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel"
                                onClick={() => setDeviceAEliminar(null)} disabled={eliminandoDevice}>
                                {t('common.cancel')}
                            </button>
                            <button className="btn-modal btn-confirm"
                                style={{ background: C_RED }}
                                onClick={confirmarEliminarDevice} disabled={eliminandoDevice}>
                                {eliminandoDevice ? <i className="fas fa-spinner fa-spin" /> : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
