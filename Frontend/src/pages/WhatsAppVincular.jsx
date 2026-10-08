import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import NotificationBell from '../components/kanban/NotificationBell';
import useDialog from '../hooks/useDialog';
import '../assets/css/pages/WhatsAppVincular.css';

// ─── Modal base ───────────────────────────────────────────────────────────────
function Modal({ id, active, onClose, children }) {
    const dialog = useDialog(active, onClose);

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" id={id}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" {...dialog}>{children}</div>
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
    const { t } = useLanguage();
    const connected = device.estado === 'CONNECTED';
    return (
        <div className="device-card" id={`card-${device.sessionId}`}>
            <div className="device-header">
                <div className="device-icon"><i className="fab fa-whatsapp"></i></div>
                <span className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
                    {connected ? t('wa.statusOnline') : t('wa.statusOffline')}
                </span>
            </div>
            <div className="device-info">
                <h3>{device.alias}</h3>
                <p>{device.numeroTelefono || t('wa.statusPending')}</p>
                <div className="device-meta wa-1">
                    ID: {String(device.sessionId || '').slice(0, 12)}
                </div>
            </div>
            <div className="device-actions">
                {!connected && (
                    <button className="btn-card-action" onClick={() => onConectar(device.id)}>
                        <i className="fas fa-qrcode"></i> {t('wa.connect')}
                    </button>
                )}
                <button className="btn-card-action btn-card-warning" title={t('wa.unlink')} onClick={() => onDesvincular(device.id)}>
                    <i className="fas fa-unlink"></i> {t('wa.unlink')}
                </button>
                <button type="button" className="btn-card-action btn-card-danger" onClick={() => onEliminar(device.id)} aria-label={`${t('common.delete')} ${device.alias || ''}`.trim()}>
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
    const { t } = useLanguage();
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
            toast(t('common.errorTitle'), t('common.errLoadDevices'), '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    // Carga inicial (fetch on mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            toast(t('common.errorTitle'), t('common.errCreateDevice'), '#ef4444');
        } finally { setCreando(false); }
    };

    const confirmarDesvincular = async () => {
        setDesvinculando(true);
        try {
            await api.post(`/whatsapp/${selectedId}/disconnect`);
            setModalDesvincular(false); loadDevices();
        } catch { toast(t('common.errorTitle'), t('wa.errUnlink'), '#ef4444'); }
        finally { setDesvinculando(false); }
    };

    const confirmarEliminar = async () => {
        setEliminando(true);
        try {
            await api.delete(`/whatsapp/${selectedId}`);
            setModalEliminar(false); loadDevices();
        } catch { toast(t('common.errorTitle'), t('common.errDelete'), '#ef4444'); }
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
        if (!pairPhone || pairPhone.length < 10) { toast(t('common.notice'), t('wa.errPhone'), '#f59e0b'); return; }
        setGettingCode(true);
        try {
            const res = await api.post('/whatsapp/pair-code', { deviceId: currentDeviceId.current, phoneNumber: pairPhone });
            if (res.data.code) { setPairCode(`${res.data.code.slice(0, 4)}-${res.data.code.slice(4)}`); }
            else toast('Error', res.data.error || 'No se pudo obtener el codigo', '#ef4444');
        } catch { toast(t('common.errorTitle'), t('wa.errConn'), '#ef4444'); }
        finally { setGettingCode(false); }
    };

    return (
        <div>
            <div className="header-top wa-2">
                <div>
                    <h2 className="wa-3">
                        <i className="fab fa-whatsapp wa-4"></i> {t('wa.title')}
                    </h2>
                    <p className="wa-5">{t('wa.subtitle')}</p>
                </div>
                <NotificationBell />
            </div>

            <div className="dashboard-content wa-6">
                <div className="devices-grid">
                    <button type="button" className="ghost-column-placeholder wa-7"
                        onClick={() => { setAlias(''); setModalCrear(true); }}>
                        <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                        <span className="ghost-text">{t('wa.addNumber')}</span>
                    </button>
                    {loading
                        ? <div className="wa-8"><div className="spinner"></div></div>
                        : devices.map(d => (
                            <DeviceCard key={d.id} device={d} onConectar={abrirQr}
                                onDesvincular={(id) => { setSelectedId(id); setModalDesvincular(true); }}
                                onEliminar={(id) => { setSelectedId(id); setModalEliminar(true); }} />
                        ))
                    }
                </div>
            </div>

            <Modal id="modalCrear" active={modalCrear} onClose={() => setModalCrear(false)}>
                <h3 className="wa-9">{t('wa.newNumber')}</h3>
                <p className="wa-10">{t('wa.newNumberDesc')}</p>
                <input aria-label={t('wa.aliasPlaceholder')} className="clean-input wa-11" autoFocus
                    placeholder={t('wa.aliasPlaceholder')} value={alias} autoComplete="off"
                    onChange={e => setAlias(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmarCrear()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalCrear(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm" onClick={confirmarCrear} disabled={creando}>
                        {creando ? <i className="fas fa-spinner fa-spin"></i> : t('common.create')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalDesvincular" active={modalDesvincular} onClose={() => setModalDesvincular(false)}>
                <div className="wa-12">
                    <div className="wa-13">
                        <i className="fas fa-unlink"></i>
                    </div>
                    <h3 className="wa-14">{t('wa.unlinkTitle')}</h3>
                    <p className="wa-15">{t('wa.unlinkDesc')}</p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalDesvincular(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal wa-16"
                        onClick={confirmarDesvincular} disabled={desvinculando}>
                        {desvinculando ? <i className="fas fa-spinner fa-spin"></i> : t('wa.unlink')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalEliminar" active={modalEliminar} onClose={() => setModalEliminar(false)}>
                <div className="wa-12">
                    <div className="icon-trash-bg wa-17">
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 className="wa-14">{t('wa.deleteTitle')}</h3>
                    <p className="wa-15">{t('wa.deleteDesc')}</p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalEliminar(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm-danger" onClick={confirmarEliminar} disabled={eliminando}>
                        {eliminando ? <i className="fas fa-spinner fa-spin"></i> : t('common.delete')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalQr" active={modalQr} onClose={cerrarQr}>
                <h3 className="wa-18">{t('wa.vincularTitle')}</h3>
                <div className="wa-19">
                    <button className="wa-20" type="button" onClick={() => switchTab('qr')}
                        style={{ color: qrTab === 'qr' ? '#10b981' : 'var(--color-text-3)', fontWeight: qrTab === 'qr' ? 'bold' : 'normal' }}>
                        {t('wa.qrTab')}
                    </button>
                    <button className="wa-20" type="button" onClick={() => switchTab('code')}
                        style={{ color: qrTab === 'code' ? '#10b981' : 'var(--color-text-3)', fontWeight: qrTab === 'code' ? 'bold' : 'normal' }}>
                        {t('wa.codeTab')}
                    </button>
                </div>

                {qrTab === 'qr' && (
                    <div className="wa-12">
                        {qrLoading && <div className="wa-8"><div className="spinner"></div><p className="wa-21">{t('wa.loadingQr')}</p></div>}
                        {qrSrc && <img className="wa-22" src={qrSrc} alt={t('wa.qrAlt')} />}
                    </div>
                )}

                {qrTab === 'code' && (
                    <div className="wa-23">
                        <p className="wa-24">{t('wa.phoneDesc')}</p>
                        <label className="wa-25" htmlFor="input-phone-pair">{t('wa.phoneLabel')}</label>
                        <input className="wa-26" id="input-phone-pair" type="text" placeholder={t('wa.phonePh')} value={pairPhone}
                            onChange={e => setPairPhone(e.target.value)} />
                        <button className="wa-27" type="button" onClick={pedirCodigo} disabled={gettingCode}>
                            {gettingCode ? <><i className="fas fa-circle-notch fa-spin"></i>{' '}{t('wa.generating')}</> : pairCode ? t('wa.reloadCode') : t('wa.getCode')}
                        </button>
                        {pairCode && (
                            <div className="wa-28">
                                <p className="wa-29">{t('wa.codePrompt')}</p>
                                <div className="wa-30">{pairCode}</div>
                                <p className="wa-31">{t('wa.codeExpiry')}</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="modal-actions wa-32">
                    <button className="btn-modal btn-cancel" onClick={cerrarQr}>{t('wa.close')}</button>
                </div>
            </Modal>
        </div>
    );
}