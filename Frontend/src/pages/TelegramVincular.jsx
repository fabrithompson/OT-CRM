import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LangContext';
import NotificationBell from '../components/kanban/NotificationBell';
import useDialog from '../hooks/useDialog';
import '../assets/css/pages/TelegramVincular.css';

// Todos los endpoints de Telegram están bajo /api/v1/telegram-devices — se usa el api estándar

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

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ estado }) {
    const { t } = useLanguage();
    if (estado === 'CONECTADO')  return <span className="status-badge status-connected">{t('tg.statusOnline')}</span>;
    if (estado === 'CONECTANDO') return <span className="status-badge status-pairing">{t('tg.statusPairing')}</span>;
    return <span className="status-badge status-disconnected">{t('tg.statusOffline')}</span>;
}

StatusBadge.propTypes = { estado: PropTypes.string };
StatusBadge.defaultProps = { estado: '' };

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, onConectar, onDesvincular, onEliminar }) {
    const { t } = useLanguage();
    const { estado } = device;
    return (
        <div className="device-card" id={`card-${device.id}`}>
            <div className="device-header">
                <div className="device-icon tg-1">
                    <i className="fab fa-telegram-plane"></i>
                </div>
                <StatusBadge estado={estado} />
            </div>
            <div className="device-info">
                <h3>{device.alias}</h3>
                <p>{device.numeroTelefono || t('tg.statusPending')}</p>
                <div className="device-meta tg-2">
                    ID: {String(device.sessionId || '').slice(0, 12)}
                </div>
            </div>
            <div className="device-actions">
                {estado !== 'CONECTADO' && estado !== 'CONECTANDO' && (
                    <button className="btn-card-action" onClick={() => onConectar(device.id)}>
                        <i className="fas fa-link"></i> {t('tg.connect')}
                    </button>
                )}
                {estado === 'CONECTANDO' && (
                    <button className="btn-card-action tg-3"
                        onClick={() => onConectar(device.id, device.numeroTelefono)}>
                        <i className="fas fa-key"></i> {t('tg.enterCode')}
                    </button>
                )}
                {estado === 'CONECTADO' && (
                    <button className="btn-card-action btn-card-warning tg-4"
                        onClick={() => onDesvincular(device.id)}>
                        <i className="fas fa-unlink"></i> {t('tg.unlink')}
                    </button>
                )}
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
export default function TelegramVincular() {
    const { t } = useLanguage();
    const toast = useToast();
    const [devices, setDevices]               = useState([]);
    const [loading, setLoading]               = useState(true);
    const [modalCrear, setModalCrear]         = useState(false);
    const [modalConectar, setModalConectar]   = useState(false);
    const [modalValidar, setModalValidar]     = useState(false);
    const [modalDesvincular, setModalDesvincular] = useState(false);
    const [modalEliminar, setModalEliminar]   = useState(false);
    const [alias, setAlias]                   = useState('');
    const [creando, setCreando]               = useState(false);
    const [selectedId, setSelectedId]         = useState(null);
    const [telefono, setTelefono]             = useState('');
    const [pidiendoCodigo, setPidiendoCodigo] = useState(false);
    const [codigo, setCodigo]                 = useState('');
    const [hash, setHash]                     = useState('');
    const [validando, setValidando]           = useState(false);
    const [desvinculando, setDesvinculando]   = useState(false);
    const [eliminando, setEliminando]         = useState(false);

    // Endpoint correcto: POST /api/v1/telegram-devices
    const loadDevices = useCallback(async () => {
        try {

            const res = await api.get('/telegram-devices');
            setDevices(res.data);
        } catch {
            toast(t('common.errorTitle'), t('common.errLoadDevices'), '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadDevices(); }, [loadDevices]);

    const confirmarCrear = async () => {
        if (!alias.trim()) { toast(t('common.notice'), t('tg.errName'), '#f59e0b'); return; }
        setCreando(true);
        try {
            const resp = await api.post('/telegram-devices', { deviceId: null, alias: alias.trim(), phone: '' });
            if (resp.status === 402) { window.mostrarUpsell?.(resp.data?.error || 'Límite alcanzado.'); return; }
            setAlias(''); setModalCrear(false); loadDevices();
        } catch (e) {
            if (e.response?.status === 402) window.mostrarUpsell?.(e.response.data?.error || 'Límite alcanzado.');
            else toast(t('common.errorTitle'), t('common.errCreateDevice'), '#ef4444');
        } finally { setCreando(false); }
    };

    const abrirModalConectar = (id, tel = '') => {
        setSelectedId(id); setTelefono(tel || ''); setModalConectar(true);
    };

    const solicitarCodigo = async () => {
        if (!telefono.trim()) { toast(t('common.notice'), t('tg.errPhone'), '#f59e0b'); return; }
        setPidiendoCodigo(true);
        try {
            const res = await api.post('/telegram-devices', { deviceId: selectedId, phone: telefono.trim(), update: true });
            setModalConectar(false);
            // ALREADY_LOGGED_IN: la sesión ya existe en el bridge, no hace falta código
            if (res.data.status === 'ALREADY_LOGGED_IN') {
                toast(t('common.info'), t('tg.alreadyAuth'), '#10b981');
                loadDevices();
                return;
            }
            setHash(res.data.phone_code_hash || '');
            setCodigo('');
            setModalValidar(true);
        } catch (e) {
            toast('Error', e.response?.data?.error || 'Error de conexión', '#ef4444');
        } finally { setPidiendoCodigo(false); }
    };

    const enviarCodigo = async () => {
        if (!codigo.trim()) return;
        setValidando(true);
        try {
            await api.post('/telegram-devices/validate', { deviceId: selectedId, code: codigo.trim(), hash });
            setModalValidar(false); setCodigo(''); loadDevices();
        } catch (e) {
            toast('Error', e.response?.data?.error || 'Código incorrecto', '#ef4444');
        } finally { setValidando(false); }
    };

    const confirmarDesvincular = async () => {
        setDesvinculando(true);
        try {
            await api.post(`/telegram-devices/${selectedId}/disconnect`);
            setModalDesvincular(false); loadDevices();
        } catch { toast(t('common.errorTitle'), t('tg.errUnlink'), '#ef4444'); }
        finally { setDesvinculando(false); }
    };

    const confirmarEliminar = async () => {
        setEliminando(true);
        try {
            await api.delete(`/telegram-devices/${selectedId}`);
            setModalEliminar(false); loadDevices();
        } catch { toast(t('common.errorTitle'), t('common.errDelete'), '#ef4444'); }
        finally { setEliminando(false); }
    };

    return (
        <div>
            <div className="header-top tg-5">
                <div>
                    <h2 className="tg-6">
                        <i className="fab fa-telegram tg-7"></i> {t('tg.title')}
                    </h2>
                    <p className="tg-8">{t('tg.subtitle')}</p>
                </div>
                <NotificationBell />
            </div>

            <div className="dashboard-content tg-9">
                <div className="devices-grid">
                    <button type="button" className="ghost-column-placeholder tg-10"
                        onClick={() => { setAlias(''); setModalCrear(true); }}>
                        <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                        <span className="ghost-text">{t('tg.addNumber')}</span>
                    </button>
                    {loading
                        ? <div className="tg-11"><div className="spinner"></div></div>
                        : devices.map(d => (
                            <DeviceCard key={d.id} device={d} onConectar={abrirModalConectar}
                                onDesvincular={(id) => { setSelectedId(id); setModalDesvincular(true); }}
                                onEliminar={(id) => { setSelectedId(id); setModalEliminar(true); }} />
                        ))
                    }
                </div>
            </div>

            <Modal id="modalCrear" active={modalCrear} onClose={() => setModalCrear(false)}>
                <h3 className="tg-12">{t('tg.newNumber')}</h3>
                <p className="tg-13">{t('tg.newNumberDesc')}</p>
                <input aria-label={t('tg.aliasPlaceholder')} className="clean-input tg-14" autoFocus
                    placeholder={t('tg.aliasPlaceholder')} value={alias} autoComplete="off"
                    onChange={e => setAlias(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmarCrear()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalCrear(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm" onClick={confirmarCrear} disabled={creando}>
                        {creando ? <i className="fas fa-spinner fa-spin"></i> : t('common.create')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalConectar" active={modalConectar} onClose={() => setModalConectar(false)}>
                <h3 className="tg-12">{t('tg.vincularTitle')}</h3>
                <p className="tg-13">{t('tg.vincularDesc')}</p>
                <input aria-label={t('tg.phonePh')} className="clean-input tg-14"
                    placeholder={t('tg.phonePh')} autoComplete="off" value={telefono}
                    onChange={e => setTelefono(e.target.value)} onKeyDown={e => e.key === 'Enter' && solicitarCodigo()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalConectar(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm" onClick={solicitarCodigo} disabled={pidiendoCodigo}>
                        {pidiendoCodigo ? <i className="fas fa-spinner fa-spin"></i> : t('tg.askCode')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalValidar" active={modalValidar} onClose={() => setModalValidar(false)}>
                <h3 className="tg-12">{t('tg.verifyTitle')}</h3>
                <p className="tg-15">
                    {t('tg.verifyDesc')}<br/>
                    <span className="tg-16">{t('tg.verifyNote')}</span>{t('tg.verifyNoteSuffix')}
                </p>
                <input aria-label={t('tg.codePlaceholder')} className="clean-input tg-17" autoFocus
                    placeholder={t('tg.codePlaceholder')} autoComplete="off" value={codigo}
                    onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviarCodigo()} />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalValidar(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm" onClick={enviarCodigo} disabled={validando}>
                        {validando ? <i className="fas fa-spinner fa-spin"></i> : t('tg.verify')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalDesvincular" active={modalDesvincular} onClose={() => setModalDesvincular(false)}>
                <div className="tg-18">
                    <div className="tg-19">
                        <i className="fas fa-unlink"></i>
                    </div>
                    <h3 className="tg-20">{t('tg.unlinkTitle')}</h3>
                    <p className="tg-21">{t('tg.unlinkDesc')}</p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalDesvincular(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal tg-3"
                        onClick={confirmarDesvincular} disabled={desvinculando}>
                        {desvinculando ? <i className="fas fa-spinner fa-spin"></i> : t('tg.unlink')}
                    </button>
                </div>
            </Modal>

            <Modal id="modalEliminar" active={modalEliminar} onClose={() => setModalEliminar(false)}>
                <div className="tg-18">
                    <div className="icon-trash-bg tg-22">
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 className="tg-20">{t('tg.deleteTitle')}</h3>
                    <p className="tg-21">{t('tg.deleteDesc')}</p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={() => setModalEliminar(false)}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm-danger" onClick={confirmarEliminar} disabled={eliminando}>
                        {eliminando ? <i className="fas fa-spinner fa-spin"></i> : t('common.delete')}
                    </button>
                </div>
            </Modal>
        </div>
    );
}