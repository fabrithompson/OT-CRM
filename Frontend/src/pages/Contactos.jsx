import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import NotificationBell from '../components/kanban/NotificationBell';

const FORMAT_BYTES = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};



function ConfirmDeleteModal({ active, onClose, onConfirm, deleting }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        if (active) document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [active, onClose]);

    if (!active) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" style={{ textAlign: 'center' }}>
                <div className="icon-trash-bg" style={{ margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#ef4444' }}>
                    <i className="fas fa-trash-alt"></i>
                </div>
                <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Eliminar contacto?</h3>
                <p style={{ color: '#94a3b8', marginBottom: 20 }}>
                    Esta acción es <strong style={{ color: '#fff' }}>irreversible</strong>. Se eliminará el contacto del sistema.
                </p>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>Cancelar</button>
                    <button className="btn-modal btn-confirm-danger" onClick={onConfirm} disabled={deleting}>
                        {deleting ? <i className="fas fa-spinner fa-spin"></i> : 'Eliminar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
ConfirmDeleteModal.propTypes = { active: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onConfirm: PropTypes.func.isRequired, deleting: PropTypes.bool.isRequired };

function ConfirmImportModal({ active, file, onClose, onConfirm, importing }) {
    if (!active || !file) return null;
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="custom-modal" style={{ textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px', fontSize: '1.8rem' }}>
                    <i className="fas fa-file-upload"></i>
                </div>
                <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Confirmar importación?</h3>
                <p style={{ color: '#94a3b8', marginBottom: 20 }}>Archivo: <strong style={{ color: '#fff' }}>{file.name}</strong><br />Tamaño: {FORMAT_BYTES(file.size)}</p>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose} disabled={importing}>Cancelar</button>
                    <button className="btn-modal btn-confirm" onClick={onConfirm} disabled={importing}>
                        {importing ? <><i className="fas fa-spinner fa-spin"></i>{' '}Importando...</> : 'Importar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
ConfirmImportModal.propTypes = { active: PropTypes.bool.isRequired, file: PropTypes.instanceOf(File), onClose: PropTypes.func.isRequired, onConfirm: PropTypes.func.isRequired, importing: PropTypes.bool.isRequired };
function ResultModal({ active, type, title, message, onClose }) {
    if (!active) return null;
    const isError = type === 'error';
    return (
        <div className="custom-modal-overlay active" role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {/* FIX: add maxWidth and maxHeight so it doesn't stretch the screen */}
            <div className="custom-modal" style={{ maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
                <div className={`modal-icon ${isError ? 'icon-danger' : 'icon-success'}`}><i className={`fas ${isError ? 'fa-times-circle' : 'fa-check-circle'}`}></i></div>
                <div className="modal-title">{title}</div>
                <div className="modal-desc" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{message?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')}</div>
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
            toast('Error', 'No se pudieron cargar los contactos', '#ef4444');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadClientes(page, pageSize, search); }, [page, pageSize, loadClientes]);

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
            toast('Error', 'No se pudieron exportar los contactos', '#ef4444');
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
            let msg = e.response?.data?.error || 'No se pudo eliminar el contacto';
            if (msg.includes('foreign key') || msg.includes('FK3')) {
                msg = '<strong>No se puede eliminar este contacto</strong><br><br>El contacto tiene mensajes asociados. Elimina primero el historial del chat.';
            }
            showResult('error', 'No se pudo eliminar', msg);
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
            return <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner"></div></td></tr>;
        }
        if (clientes.length === 0) {
            return (
                <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8', height: 'calc(100vh - 268px)', verticalAlign: 'middle' }}>
                        <i className="fas fa-users" style={{ fontSize: '2.5rem', marginBottom: 16, opacity: 0.3, display: 'block' }}></i>
                        <span style={{ fontSize: '1rem' }}>No se encontraron contactos</span>
                    </td>
                </tr>
            );
        }
        return clientes.map(c => (
            <tr key={c.id} id={`row-${c.id}`}>
                <td className="col-left ps-4" style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar-circle"><span>{(c.nombre || '?').charAt(0).toUpperCase()}</span></div>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{c.nombre}</span>
                    </div>
                </td>
                <td className="col-center" style={{ textAlign: 'center' }}><div className="session-cell" style={{ justifyContent: 'center' }}><PlatformIcon origen={c.origen} /></div></td>
                <td className="col-center text-muted" style={{ textAlign: 'center', fontFamily: 'monospace' }}>{c.telefono}</td>
                <td className="col-center" style={{ textAlign: 'center' }}>
                    {c.dispositivo ? <span className="badge-device"><i className="fas fa-mobile-alt" style={{ marginRight: 4 }}></i>{c.dispositivo.alias}</span> : <span style={{ color: '#666' }}>-</span>}
                </td>
                <td className="col-center" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {c.etiquetas?.length > 0
                            ? c.etiquetas.map(tag => (<span key={tag.id} className="badge-tag" style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}>{tag.nombre}</span>))
                            : <span style={{ color: '#666' }}>-</span>
                        }
                    </div>
                </td>
                <td className="col-center" style={{ textAlign: 'center' }}>
                    {c.etapa ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><span className="stage-dot"></span><span className="text-sec">{c.etapa.nombre}</span></div> : <span style={{ color: '#666' }}>-</span>}
                </td>
                <td className="col-center" style={{ textAlign: 'center' }}>
                    <p style={{ maxWidth: 200, margin: '0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '0.85rem' }}>{c.ultimoMensajeResumen || '-'}</p>
                </td>
                <td className="col-center pe-4" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <button type="button" className="btn-action-icon chat" title="Abrir Chat" onClick={() => abrirChat(c.id)}><i className="fas fa-comment-dots"></i></button>
                        <button type="button" className="btn-action-icon trash" title="Eliminar" onClick={() => setDeleteId(c.id)}><i className="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            </tr>
        ));
    };

    return (
        <section className="page-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="header-top" style={{ flexShrink: 0, padding: '20px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <i className="fas fa-users text-primary" style={{ fontSize: '1.4rem' }}></i>
                    <div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', margin: 0 }}>Contactos</h2>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>{totalItems} Clientes</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div className="search-wrapper" style={{ margin: 0, height: 40, position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}></i>
                        <input type="text" placeholder="Buscar en toda la BD..." value={search} onChange={e => handleSearch(e.target.value)} autoComplete="off" style={{ height: '100%', width: 240, paddingLeft: 35, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: 8, color: 'white', outline: 'none' }} />
                    </div>
                    <button type="button" className="btn-excel-animado" onClick={exportar} style={{ backgroundColor: '#1D6F42', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <i className="fas fa-file-download"></i><span className="texto-btn" style={{ marginLeft: 5 }}>Exportar Contactos</span>
                    </button>
                    <button type="button" className="btn-excel-animado" onClick={() => fileInputRef.current?.click()} style={{ backgroundColor: '#0061f2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-file-upload"></i><span className="texto-btn" style={{ marginLeft: 5 }}>Importar Contactos</span>
                    </button>
                    <NotificationBell />
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFileSelect} />
                </div>
            </div>

            <div className="dashboard-content" style={{ flex: 1, overflow: 'hidden', padding: '30px 30px 20px 30px', display: 'flex', flexDirection: 'column' }}>
                <div className="glass-table-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 150px)' }}>
                    <div className="table-scroll-wrapper custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
                        <table className="table custom-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                            <thead style={{ backgroundColor: '#0f1214' }}>
                                <tr>
                                    <th className="col-left ps-4 sticky-header" style={{ textAlign: 'left' }}>Nombre</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Plataforma</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Teléfono</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Dispositivo</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Etiquetas</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Estado</th>
                                    <th className="col-center sticky-header" style={{ textAlign: 'center' }}>Mensaje</th>
                                    <th className="col-center pe-4 sticky-header" style={{ textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>{renderTableBody()}</tbody>
                        </table>
                    </div>

                    <div className="table-footer" style={{ padding: '15px 20px', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', gap: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500 }}>Filas por página:</span>
                            <select value={pageSize} onChange={handlePageSize} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', outline: 'none', cursor: 'pointer', backgroundColor: '#1e293b', color: 'white' }}>
                                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                            </select>
                        </div>
                        {totalPages > 1 ? (
                            <nav className="pagination-wrapper">
                                <button type="button" className="btn-page" onClick={() => goToPage(page - 1)} disabled={page === 0}>
                                    <i className="fas fa-chevron-left" style={{ fontSize: '0.7rem' }}></i><span>Anterior</span>
                                </button>
                                <div className="page-info-capsule">
                                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>Página</span>
                                    <span className="current">{page + 1}</span>
                                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>de</span>
                                    <span className="total">{totalPages}</span>
                                </div>
                                <button type="button" className="btn-page" onClick={() => goToPage(page + 1)} disabled={page + 1 >= totalPages}>
                                    <span>Siguiente</span><i className="fas fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
                                </button>
                            </nav>
                        ) : (
                            <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>Mostrando todos los resultados</div>
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