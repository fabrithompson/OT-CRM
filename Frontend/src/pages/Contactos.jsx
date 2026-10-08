import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import NotificationBell from '../components/kanban/NotificationBell';
import { useLanguage } from '../context/LangContext';
import useDialog from '../hooks/useDialog';
import Skeleton from '../components/ui/Skeleton';
import '../assets/css/pages/Contactos.css';

const FORMAT_BYTES = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};



function ConfirmDeleteModal({ active, onClose, onConfirm, deleting }) {
    const { t } = useLanguage();
    const dialog = useDialog(active, onClose, { canClose: !deleting });

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal cnt-1" {...dialog}>
                <div className="icon-trash-bg cnt-2">
                    <i className="fas fa-trash-alt"></i>
                </div>
                <h3 className="cnt-3">{t('contactos.deleteTitle')}</h3>
                <p className="cnt-4">{t('contactos.deleteMsg')}</p>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm-danger" onClick={onConfirm} disabled={deleting}>
                        {deleting ? <i className="fas fa-spinner fa-spin"></i> : t('common.delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}
ConfirmDeleteModal.propTypes = { active: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onConfirm: PropTypes.func.isRequired, deleting: PropTypes.bool.isRequired };

function ConfirmImportModal({ active, file, onClose, onConfirm, importing }) {
    const { t } = useLanguage();
    const dialog = useDialog(active && !!file, onClose, { canClose: !importing });
    if (!active || !file) return null;
    return (
        <div className="custom-modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal cnt-1" {...dialog}>
                <div className="cnt-5">
                    <i className="fas fa-file-upload"></i>
                </div>
                <h3 className="cnt-3">{t('contactos.importTitle')}</h3>
                <p className="cnt-4">{t('contactos.fileLabel')} <strong className="cnt-6">{file.name}</strong><br />{t('contactos.sizeLabel')} {FORMAT_BYTES(file.size)}</p>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose} disabled={importing}>{t('common.cancel')}</button>
                    <button className="btn-modal btn-confirm" onClick={onConfirm} disabled={importing}>
                        {importing ? <><i className="fas fa-spinner fa-spin"></i>{' '}{t('contactos.importing')}</> : t('contactos.importBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
}
ConfirmImportModal.propTypes = { active: PropTypes.bool.isRequired, file: PropTypes.instanceOf(File), onClose: PropTypes.func.isRequired, onConfirm: PropTypes.func.isRequired, importing: PropTypes.bool.isRequired };
function ResultModal({ active, type, title, message, onClose }) {
    const dialog = useDialog(active, onClose);
    if (!active) return null;
    const isError = type === 'error';
    return (
        <div className="custom-modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {/* FIX: add maxWidth and maxHeight so it doesn't stretch the screen */}
            <div className="custom-modal cnt-7" {...dialog}>
                <div className={`modal-icon ${isError ? 'icon-danger' : 'icon-success'}`}><i className={`fas ${isError ? 'fa-times-circle' : 'fa-check-circle'}`}></i></div>
                <div className="modal-title">{title}</div>
                <div className="modal-desc cnt-8">{message?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')}</div>
                <div className="modal-actions">
                    <button className="btn-modal btn-confirm" onClick={onClose}>{isError ? 'Entendido' : 'Aceptar'}</button>
                </div>
            </div>
        </div>
    );
}
ResultModal.propTypes = { active: PropTypes.bool.isRequired, type: PropTypes.oneOf(['success', 'error']).isRequired, title: PropTypes.string.isRequired, message: PropTypes.string.isRequired, onClose: PropTypes.func.isRequired };

function PlatformIcon({ origen }) {
    const isTelegram = origen === 'TELEGRAM';
    return (
        <div className={`platform-icon ${isTelegram ? 'telegram' : 'whatsapp'}`}>
            <i className={isTelegram ? 'fab fa-telegram-plane' : 'fab fa-whatsapp'}></i>
        </div>
    );
}
PlatformIcon.propTypes = { origen: PropTypes.string };

export default function Contactos() {
    const { t } = useLanguage();
    const toast    = useToast();
    const navigate = useNavigate();

    const [clientes, setClientes]     = useState([]);
    const [loading, setLoading]       = useState(true);
    const [search, setSearch]         = useState('');
    const [page, setPage]             = useState(0);
    const [pageSize, setPageSize]     = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [deleteId, setDeleteId]     = useState(null);
    const [deleting, setDeleting]     = useState(false);

    const [importFile, setImportFile]           = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importing, setImporting]             = useState(false);

    const [resultModal, setResultModal] = useState({ active: false, type: 'success', title: '', message: '', onClose: null });

    const fileInputRef  = useRef(null);
    const searchTimeout = useRef(null);

    const loadClientes = useCallback(async (p, size, q) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, size });
            if (q && q.trim()) params.set('search', q.trim());
            const res = await api.get(`/contactos/paginados?${params}`);
            const data = res.data;
            if (data.content !== undefined) {
                setClientes(data.content);
                setTotalPages(data.totalPages ?? 1);
                setTotalItems(data.totalElements ?? data.content.length);
            } else {
                setClientes(Array.isArray(data) ? data : []);
                setTotalPages(1);
                setTotalItems(Array.isArray(data) ? data.length : 0);
            }
        } catch {
            toast(t('common.errorTitle'), t('contactos.errLoad'), '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    // Recarga al cambiar página/tamaño. La búsqueda se dispara manualmente desde
    // handleSearch (con debouncing); por eso 'search' no está en deps a propósito.
    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    useEffect(() => { loadClientes(page, pageSize, search); }, [page, pageSize, loadClientes]);
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

    const handleSearch = (value) => {
        setSearch(value);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setPage(0);
            loadClientes(0, pageSize, value);
        }, 400);
    };

    const handlePageSize = (e) => {
        const s = Number.parseInt(e.target.value, 10);
        setPageSize(s);
        setPage(0);
        loadClientes(0, s, search);
    };

    const goToPage = (p) => {
        setPage(p);
        loadClientes(p, pageSize, search);
    };

    const exportar = async () => {
        try {
            const res = await api.get('/contactos/exportar', { responseType: 'blob' });
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'contactos.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch {
            toast(t('common.errorTitle'), t('contactos.errExport'), '#ef4444');
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showResult('error', 'Formato inválido', 'Por favor selecciona un archivo Excel (.xlsx o .xls)');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showResult('error', 'Archivo muy grande', 'El archivo excede el tamaño máximo permitido de 10MB');
            return;
        }
        setImportFile(file);
        setShowImportModal(true);
    };

    const procesarImport = async () => {
        if (!importFile) return;
        setImporting(true);
        const formData = new FormData();
        formData.append('file', importFile);

        try {
            const res = await api.post('/contactos/importar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setShowImportModal(false);
            setImportFile(null);

            const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            setPage(0);
            loadClientes(0, pageSize, search);
            showResult('success', 'Importación exitosa', text);
        } catch (err) {
            setShowImportModal(false);
            setImportFile(null);
            const text = err.response?.data || err.message;
            const isPlanLimit = err.response?.status === 402;
            showResult('error', isPlanLimit ? 'Límite de plan alcanzado' : 'Error en la importación', typeof text === 'string' ? text : JSON.stringify(text));
        } finally {
            setImporting(false);
        }
    };

    const confirmarEliminar = async () => {
        setDeleting(true);
        try {
            await api.delete(`/clientes/${deleteId}`);
            setDeleteId(null);
            showResult('success', '¡Contacto eliminado!', 'El contacto ha sido eliminado correctamente del sistema.');
            loadClientes(page, pageSize, search);
        } catch (e) {
            setDeleteId(null);
            let msg = e.response?.data?.error || t('contactos.errDelete');
            if (msg.includes('foreign key') || msg.includes('FK3')) {
                msg = `${t('contactos.cantDelete')}\n\n${t('contactos.cantDeleteDetail')}`;
            }
            showResult('error', t('common.errDelete'), msg);
        } finally {
            setDeleting(false);
        }
    };

    const showResult = (type, title, message, onCloseCb) => {
        setResultModal({ active: true, type, title, message, onClose: () => { setResultModal(r => ({ ...r, active: false })); if (onCloseCb) onCloseCb(); } });
    };

    const abrirChat = (clienteId) => { navigate(`/kanban?openChat=${clienteId}`); };

    const renderTableBody = () => {
        if (loading) {
            return Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`} className="contactos-skeleton-row" aria-hidden="true">
                    <td className="cell-primary"><div className="contactos-skeleton-name"><Skeleton variant="circle" width={36} height={36} /><Skeleton variant="text" width="60%" /></div></td>
                    {[1, 2, 3, 4, 5, 6, 7].map(j => <td key={j}><Skeleton variant="text" width="70%" /></td>)}
                </tr>
            ));
        }
        if (clientes.length === 0) {
            return (
                <tr>
                    <td colSpan={8} className="table-cards__full cnt-10">
                        <i className="fas fa-users cnt-11"></i>
                        <span className="cnt-12">{search ? t('contactos.empty.noResults') : t('contactos.empty.title')}</span>
                        <div className="ui-actions contactos-empty-actions">
                            {search ? (
                                <button type="button" className="ui-btn ui-btn--secondary" onClick={() => handleSearch('')}>
                                    <i className="fas fa-times" aria-hidden="true" /> {t('contactos.empty.clear')}
                                </button>
                            ) : (
                                <button type="button" className="ui-btn ui-btn--primary" onClick={() => fileInputRef.current?.click()}>
                                    <i className="fas fa-file-upload" aria-hidden="true" /> {t('contactos.empty.import')}
                                </button>
                            )}
                        </div>
                    </td>
                </tr>
            );
        }
        return clientes.map(c => (
            <tr key={c.id} id={`row-${c.id}`}>
                <td className="col-left ps-4 cell-primary cnt-13">
                    <div className="cnt-14">
                        <div className="avatar-circle"><span>{(c.nombre || '?').charAt(0).toUpperCase()}</span></div>
                        <span className="cnt-15">{c.nombre}</span>
                    </div>
                </td>
                <td data-label={t('contactos.colPlatform')} className="col-center cnt-1"><div className="session-cell cnt-16"><PlatformIcon origen={c.origen} /></div></td>
                <td data-label={t('contactos.colPhone')} className="col-center text-muted cnt-17">{c.telefono}</td>
                <td data-label={t('contactos.colDevice')} className="col-center cnt-1">
                    {c.dispositivo ? <span className="badge-device"><i className="fas fa-mobile-alt cnt-18"></i>{c.dispositivo.alias}</span> : <span className="cnt-19">-</span>}
                </td>
                <td data-label={t('contactos.colLabels')} className="col-center cnt-1">
                    <div className="cnt-20">
                        {c.etiquetas?.length > 0
                            ? c.etiquetas.map(tag => (<span key={tag.id} className="badge-tag" style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}>{tag.nombre}</span>))
                            : <span className="cnt-19">-</span>
                        }
                    </div>
                </td>
                <td data-label={t('contactos.colStatus')} className="col-center cnt-1">
                    {c.etapa ? <div className="cnt-21"><span className="stage-dot"></span><span className="text-sec">{c.etapa.nombre}</span></div> : <span className="cnt-19">-</span>}
                </td>
                <td data-label={t('contactos.colMessage')} className="col-center cnt-1">
                    <p className="cnt-22">{c.ultimoMensajeResumen || '-'}</p>
                </td>
                <td data-label={t('contactos.colActions')} className="col-center pe-4 cnt-1">
                    <div className="cnt-23">
                        <button type="button" className="btn-action-icon chat" title={t('contactos.openChat')} onClick={() => abrirChat(c.id)}><i className="fas fa-comment-dots"></i></button>
                        <button type="button" className="btn-action-icon trash" title={t('common.delete')} onClick={() => setDeleteId(c.id)}><i className="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>
        ));
    };

    return (
        <section className="page-wrapper cnt-24">
            <div className="header-top contactos-head cnt-25">
                <div className="cnt-26">
                    <i className="fas fa-users text-primary cnt-27"></i>
                    <div>
                        <h2 className="cnt-28">{t('contactos.title')}</h2>
                        <span className="text-muted cnt-29">{totalItems} {t('contactos.clients')}</span>
                    </div>
                </div>
                <div className="contactos-head__right cnt-26">
                    <div className="search-wrapper cnt-30">
                        <i className="fas fa-search cnt-31"></i>
                        <input className="cnt-32" aria-label={t('contactos.search')} type="text" placeholder={t('contactos.search')} value={search} onChange={e => handleSearch(e.target.value)} autoComplete="off" />
                    </div>
                    <button type="button" className="btn-excel-animado cnt-33" onClick={exportar}>
                        <i className="fas fa-file-download"></i><span className="texto-btn cnt-34">{t('contactos.exportBtn')}</span>
                    </button>
                    <button type="button" className="btn-excel-animado cnt-35" onClick={() => fileInputRef.current?.click()}>
                        <i className="fas fa-file-upload"></i><span className="texto-btn cnt-34">{t('contactos.importBtn2')}</span>
                    </button>
                    <NotificationBell />
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileSelect} />
                </div>
            </div>

            <div className="dashboard-content contactos-body cnt-36">
                <div className="glass-table-card cnt-37">
                    <div className="table-scroll-wrapper custom-scrollbar cnt-38">
                        <table className="table custom-table table-cards cnt-39">
                            <thead className="cnt-40">
                                <tr>
                                    <th className="col-left ps-4 sticky-header cnt-13">{t('contactos.colName')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colPlatform')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colPhone')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colDevice')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colLabels')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colStatus')}</th>
                                    <th className="col-center sticky-header cnt-1">{t('contactos.colMessage')}</th>
                                    <th className="col-center pe-4 sticky-header cnt-1">{t('contactos.colActions')}</th>
                                </tr>
                            </thead>
                            <tbody>{renderTableBody()}</tbody>
                        </table>
                    </div>

                    <div className="table-footer cnt-41">
                        <div className="cnt-42">
                            <span className="cnt-43">{t('contactos.rowsPerPage')}:</span>
                            <select className="cnt-44" aria-label={t('contactos.rowsPerPage')} value={pageSize} onChange={handlePageSize}>
                                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                            </select>
                        </div>
                        {totalPages > 1 ? (
                            <nav className="pagination-wrapper">
                                <button type="button" className="btn-page" onClick={() => goToPage(page - 1)} disabled={page === 0}>
                                    <i className="fas fa-chevron-left cnt-45"></i><span>{t('contactos.prev')}</span>
                                </button>
                                <div className="page-info-capsule">
                                    <span className="text-muted cnt-46">{t('contactos.page')}</span>
                                    <span className="current">{page + 1}</span>
                                    <span className="text-muted cnt-46">{t('contactos.of')}</span>
                                    <span className="total">{totalPages}</span>
                                </div>
                                <button type="button" className="btn-page" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages}>
                                    <span>{t('contactos.next')}</span><i className="fas fa-chevron-right cnt-45"></i>
                                </button>
                            </nav>
                        ) : (
                            <div className="cnt-47">{t('contactos.showingAll')}</div>
                        )}
                    </div>
                </div>
            </div>
            <ConfirmDeleteModal active={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={confirmarEliminar} deleting={deleting} />
            <ConfirmImportModal active={showImportModal} file={importFile} onClose={() => { setShowImportModal(false); setImportFile(null); }} onConfirm={procesarImport} importing={importing} />
            <ResultModal active={resultModal.active} type={resultModal.type} title={resultModal.title} message={resultModal.message} onClose={resultModal.onClose || (() => setResultModal(r => ({ ...r, active: false })))} />
        </section>
    );
}