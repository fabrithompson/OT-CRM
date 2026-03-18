import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import NotificationBell from '../components/kanban/NotificationBell';

// ─── Modal base ───────────────────────────────────────────────────────────────
function Modal({ id, active, onClose, children }) {
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        if (active) document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [active, onClose]);

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true" id={id}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal">{children}</div>
        </div>
    );
}

Modal.propTypes = {
    id: PropTypes.string.isRequired,
    active: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
};

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, onConectar, onDesvincular, onEliminar }) {
    const connected = device.estado === 'CONNECTED';
    return (
        <div className="device-card" id={`card-${device.sessionId}`}>
            <div className="device-header">
                <div className="device-icon"><i className="fab fa-whatsapp"></i></div>
                <span className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
                    {connected ? 'En Linea' : 'Desconectado'}
                </span>
            </div>
            <div className="device-info">
                <h3>{device.alias}</h3>
                <p>{device.numeroTelefono || 'Pendiente de conexion...'}</p>
                <div className="device-meta" style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 5 }}>
                    ID: {String(device.sessionId || '').slice(0, 12)}
                </div>
            </div>
            <div className="device-actions">
                {!connected && (
                    <button className="btn-card-action" onClick={() => onConectar(device.id)}>
                        <i className="fas fa-qrcode"></i> Conectar
                    </button>
                )}
                <button className="btn-card-action btn-card-warning" title="Desconectar" onClick={() => onDesvincular(device.id)}>
                    <i className="fas fa-unlink"></i> Desvincular
                </button>
                <button className="btn-card-action btn-card-danger" onClick={() => onEliminar(device.id)}>
                    <i className="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    );
}

DeviceCard.propTypes = {
    device: PropTypes.shape({
        id: PropTypes.number.isRequired,
        sessionId: PropTypes.string,
        alias: PropTypes.string,
        numeroTelefono: PropTypes.string,
        estado: PropTypes.string,
    }).isRequired,
    onConectar: PropTypes.func.isRequired,
    onDesvincular: PropTypes.func.isRequired,
    onEliminar: PropTypes.func.isRequired,
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WhatsAppVincular() {
    const toast = useToast();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalCrear, setModalCrear] = useState(false);
    const [modalDesvincular, setModalDesvincular] = useState(false);
    const [modalEliminar, setModalEliminar] = useState(false);
    const [modalQr, setModalQr] = useState(false);
    const [alias, setAlias] = useState('');
    const [creando, setCreando] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [desvinculando, setDesvinculando] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [qrTab, setQrTab] = useState('qr');
    const [qrSrc, setQrSrc] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [pairPhone, setPairPhone] = useState('');
    const [pairCode, setPairCode] = useState(null);
    const [gettingCode, setGettingCode] = useState(false);
    const currentDeviceId = useRef(null);
    const qrIntervalRef = useRef(null);

    const loadDevices = useCallback(async () => {
        try {
            const res = await api.get('/whatsapp');
            setDevices(res.data);
        } catch {
            toast('Error', 'No se pudieron cargar los dispositivos', '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    // Carga inicial
    useEffect(() => { loadDevices(); }, [loadDevices]);

    // Polling pasivo cada 5s: garantiza que la tarjeta actualice a CONNECTED
    // aunque el WebSocket falle o el usuario cierre el modal manualmente.
    const modalQrRef = useRef(false);
    useEffect(() => {
        const interval = setInterval(() => {
            if (!modalQrRef.current) loadDevices();
        }, 5000);
        return () => clearInterval(interval);
    }, [loadDevices]);

    const confirmarCrear = async () => {
        if (!alias.trim()) return;
        setCreando(true);
        try {
            await api.post('/whatsapp', { alias: alias.trim() });
            setAlias(''); setModalCrear(false); loadDevices();
        } catch {
            toast('Error', 'No se pudo crear el dispositivo', '#ef4444');
        } finally { setCreando(false); }
    };

    const confirmarDesvincular = async () => {
        setDesvinculando(true);
        try {
            await api.post(`/whatsapp/${selectedId}/disconnect`);
            setModalDesvincular(false); loadDevices();
        } catch { toast('Error', 'No se pudo desvincular', '#ef4444'); }
        finally { setDesvinculando(false); }
    };

    const confirmarEliminar = async () => {
        setEliminando(true);
        try {
            await api.delete(`/whatsapp/${selectedId}`);
            setModalEliminar(false); loadDevices();
        } catch { toast('Error', 'No se pudo eliminar', '#ef4444'); }
        finally { setEliminando(false); }
    };

    const fetchQr = useCallback(async (deviceId) => {
        try {
            const res = await api.get(`/whatsapp/${deviceId}/qr`);
            if (res.data.status === 'SCAN_QR' && res.data.qr) { setQrSrc(res.data.qr); setQrLoading(false); }
            else if (res.data.status === 'CONNECTED') {
                clearInterval(qrIntervalRef.current);
                modalQrRef.current = false;
                setModalQr(false);
                setQrSrc(null);
                // Actualizar estado inmediatamente en UI sin esperar al DB
                setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, estado: 'CONNECTED' } : d));
                loadDevices(); // Recarga para obtener numeroTelefono desde el webhook
            }
        } catch { /* silently ignore */ }
    }, [loadDevices]);

    const cerrarQr = useCallback(() => {
        clearInterval(qrIntervalRef.current);
        modalQrRef.current = false;
        setModalQr(false); setQrSrc(null); setPairPhone(''); setPairCode(null);
        loadDevices(); // Refrescar estado por si el usuario escaneó y cerró el modal
    }, [loadDevices]);

    const abrirQr = (deviceId) => {
        currentDeviceId.current = deviceId;
        modalQrRef.current = true;
        setQrTab('qr'); setQrSrc(null); setQrLoading(true); setPairPhone(''); setPairCode(null); setModalQr(true);
        fetchQr(deviceId);
        qrIntervalRef.current = setInterval(() => fetchQr(deviceId), 3000);
    };

    const switchTab = (tab) => {
        setQrTab(tab);
        if (tab === 'code') { clearInterval(qrIntervalRef.current); }
        else { fetchQr(currentDeviceId.current); qrIntervalRef.current = setInterval(() => fetchQr(currentDeviceId.current), 3000); }
    };

    const pedirCodigo = async () => {
        if (!pairPhone || pairPhone.length < 10) { toast('Aviso', 'Ingresa un numero valido con codigo de pais', '#f59e0b'); return; }
        setGettingCode(true);
        try {
            const res = await api.post('/whatsapp/pair-code', { deviceId: currentDeviceId.current, phoneNumber: pairPhone });
            if (res.data.code) { setPairCode(`${res.data.code.slice(0, 4)}-${res.data.code.slice(4)}`); }
            else toast('Error', res.data.error || 'No se pudo obtener el codigo', '#ef4444');
        } catch { toast('Error', 'Error de conexion', '#ef4444'); }
        finally { setGettingCode(false); }
    };

    const pairBtnLabel = () => {
        if (gettingCode) return <><i className="fas fa-circle-notch fa-spin"></i>{' '}Generando...</>;
        if (pairCode) return 'Recargar Codigo';
        return 'Obtener Codigo';
    };

    return (
        <div>
            <div className="header-top" style={{ justifyContent: 'space-between', padding: '20px 25px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="fab fa-whatsapp" style={{ color: '#25D366' }}></i> Configuracion WhatsApp
                    </h2>
                    <p style={{ margin: '5px 0 0', color: 'var(--text-sec)', fontSize: '0.95rem' }}>Gestiona tus numeros conectados.</p>
                </div>
                <NotificationBell />
            </div>

            <div className="dashboard-content" style={{ paddingTop: 10 }}>
                <div className="devices-grid">
                    <button type="button" className="ghost-column-placeholder"
                        style={{ minHeight: 200, height: 'auto', maxWidth: 'none', width: '100%' }}
                        onClick={() => { setAlias(''); setModalCrear(true); }}>
                        <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                        <span className="ghost-text">Agregar Número</span>
                    </button>
                    {loading
                        ? <div style={{ padding: 40 }}><div className="spinner"></div></div>
                        : devices.map(d => (
                            <DeviceCard key={d.id} device={d} onConectar={abrirQr}
                                onDesvincular={(id) => { setSelectedId(id); setModalDesvincular(true); }}
                                onEliminar={(id) => { setSelectedId(id); setModalEliminar(true); }} />
                        ))
                    }
                </div>
            </div>

            <Modal id="modalCrear" active={modalCrear} onClose={() => setModalCrear(false)}>
                <h3 style={{ margin: '0 0 5px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nuevo Número WhatsApp</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>Agrega un nuevo número de WhatsApp</p>
                <input className="clean-input" autoFocus style={{ width: '100%', marginBottom: 20 }}
                    placeholder="Nombre (Alias)..." value={alias} autoComplete="off"
                    onChange={e => setAlias(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmarCrear()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalCrear(false)}>Cancelar</button>
                    <button className="btn-modal btn-confirm" onClick={confirmarCrear} disabled={creando}>
                        {creando ? <i className="fas fa-spinner fa-spin"></i> : 'Crear'}
                    </button>
                </div>
            </Modal>

            <Modal id="modalDesvincular" active={modalDesvincular} onClose={() => setModalDesvincular(false)}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px', fontSize: '1.8rem' }}>
                        <i className="fas fa-unlink"></i>
                    </div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Deseas Desvincular?</h3>
                    <p style={{ color: '#94a3b8', marginBottom: 20 }}>Esto cerrará la sesión de WhatsApp en el celular vinculado y detendrá el bot.</p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalDesvincular(false)}>Cancelar</button>
                    <button className="btn-modal" style={{ backgroundColor: '#f59e0b', color: 'white' }}
                        onClick={confirmarDesvincular} disabled={desvinculando}>
                        {desvinculando ? <i className="fas fa-spinner fa-spin"></i> : 'Desvincular'}
                    </button>
                </div>
            </Modal>

            <Modal id="modalEliminar" active={modalEliminar} onClose={() => setModalEliminar(false)}>
                <div style={{ textAlign: 'center' }}>
                    <div className="icon-trash-bg" style={{ margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#ef4444' }}>
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Eliminar dispositivo?</h3>
                    <p style={{ color: '#94a3b8', marginBottom: 20 }}>
                        Esta acción es <strong style={{ color: '#fff' }}>irreversible</strong>. Se eliminará el dispositivo y se cerrará la sesión de WhatsApp.
                    </p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalEliminar(false)}>Cancelar</button>
                    <button className="btn-modal btn-confirm-danger" onClick={confirmarEliminar} disabled={eliminando}>
                        {eliminando ? <i className="fas fa-spinner fa-spin"></i> : 'Eliminar'}
                    </button>
                </div>
            </Modal>

            <Modal id="modalQr" active={modalQr} onClose={cerrarQr}>
                <h3 style={{ margin: '0 0 15px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Vincular WhatsApp</h3>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid #333', paddingBottom: 10 }}>
                    <button type="button" onClick={() => switchTab('qr')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: qrTab === 'qr' ? '#10b981' : '#666', fontWeight: qrTab === 'qr' ? 'bold' : 'normal' }}>
                        Escaner QR
                    </button>
                    <button type="button" onClick={() => switchTab('code')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: qrTab === 'code' ? '#10b981' : '#666', fontWeight: qrTab === 'code' ? 'bold' : 'normal' }}>
                        Codigo Numerico
                    </button>
                </div>

                {qrTab === 'qr' && (
                    <div style={{ textAlign: 'center' }}>
                        {qrLoading && <div style={{ padding: 40 }}><div className="spinner"></div><p style={{ marginTop: 20, color: '#888' }}>Cargando QR...</p></div>}
                        {qrSrc && <img src={qrSrc} style={{ width: 260, height: 260, borderRadius: 12, border: '4px solid white', margin: '0 auto', display: 'block' }} alt="QR WhatsApp" />}
                    </div>
                )}

                {qrTab === 'code' && (
                    <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: 15 }}>Ingresa el numero con codigo de pais.</p>
                        <label htmlFor="input-phone-pair" style={{ fontSize: '0.8rem', color: '#fff' }}>Numero de Telefono</label>
                        <input id="input-phone-pair" type="text" placeholder="Ej: 5491122334455" value={pairPhone}
                            onChange={e => setPairPhone(e.target.value)}
                            style={{ width: '100%', padding: 10, marginTop: 5, background: '#222', border: '1px solid #444', color: 'white', borderRadius: 6, boxSizing: 'border-box' }} />
                        <button type="button" onClick={pedirCodigo} disabled={gettingCode}
                            style={{ width: '100%', marginTop: 15, padding: '10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                            {pairBtnLabel()}
                        </button>
                        {pairCode && (
                            <div style={{ marginTop: 20, textAlign: 'center' }}>
                                <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Ingresa este codigo en tu celular:</p>
                                <div style={{ fontSize: '2rem', fontFamily: 'monospace', letterSpacing: 5, color: '#10b981', fontWeight: 'bold', margin: '10px 0' }}>{pairCode}</div>
                                <p style={{ color: '#ef4444', fontSize: '0.8rem' }}>Tienes aprox. 1 minuto antes de que expire.</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="modal-actions" style={{ marginTop: 30 }}>
                    <button className="btn-modal btn-cancel" onClick={cerrarQr}>Cerrar</button>
                </div>
            </Modal>
        </div>
    );
}