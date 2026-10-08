import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useLanguage } from '../context/LangContext';
import useDialog from '../hooks/useDialog';
import EmptyState from '../components/ui/EmptyState';
import '../assets/css/pages/RespuestasRapidas.css';

export default function RespuestasRapidas() {
    const { t } = useLanguage();
    const [respuestas, setRespuestas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const formDialog = useDialog(modalOpen, () => setModalOpen(false));
    const deleteDialog = useDialog(deleteModalOpen, () => setDeleteModalOpen(false));
    const [formData, setFormData] = useState({ id: null, atajo: '', respuesta: '' });
    const [deleteId, setDeleteId] = useState(null);

    const fetchRespuestas = useCallback(async () => {
        try {
            const res = await api.get('/respuestas-rapidas');
            setRespuestas(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchRespuestas(); }, [fetchRespuestas]);

    const handleSave = async () => {
        if (!formData.atajo.trim() || !formData.respuesta.trim()) return;
        try {
            if (formData.id) {
                await api.put(`/respuestas-rapidas/${formData.id}`, {
                    atajo: formData.atajo.trim(),
                    respuesta: formData.respuesta.trim()
                });
            } else {
                await api.post('/respuestas-rapidas', {
                    atajo: formData.atajo.trim(),
                    respuesta: formData.respuesta.trim()
                });
            }
            setModalOpen(false);
            fetchRespuestas();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`/respuestas-rapidas/${deleteId}`);
            setDeleteModalOpen(false);
            fetchRespuestas();
        } catch (error) {
            console.error(error);
        }
    };

    const openCreate = () => {
        setFormData({ id: null, atajo: '', respuesta: '' });
        setModalOpen(true);
    };

    const openEdit = (r) => {
        setFormData({ id: r.id, atajo: r.atajo, respuesta: r.respuesta });
        setModalOpen(true);
    };

    const openDelete = (id) => {
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    if (loading) return <div className="rr-1"><div className="spinner"></div></div>;

    return (
        <section className="page-wrapper rr-2">
            <div className="header-top rr-3">
                <div className="header-title rr-4">
                    <i className="fas fa-bolt text-warning rr-5"></i>
                    <span className="rr-6">{t('respuestas.title')}</span>
                </div>
            </div>

            <div className="dashboard-content custom-scrollbar rr-7">
                {respuestas.length === 0 ? (
                    <EmptyState
                        icon="fas fa-bolt"
                        title={t('respuestas.empty.title')}
                        description={t('respuestas.empty.desc')}
                        action={(
                            <button type="button" className="ui-btn ui-btn--primary" onClick={openCreate}>
                                <i className="fas fa-plus" aria-hidden="true" /> {t('respuestas.empty.cta')}
                            </button>
                        )}
                    />
                ) : (
                <div className="responses-grid rr-8" id="containerRespuestas">
                    
                    {respuestas.map(r => (
                        <div key={r.id} className="response-card rr-9">
                            <div className="rr-10">
                                <span className="shortcut-badge rr-11">
                                    <i className="fas fa-terminal"></i>
                                    <span>/{r.atajo}</span>
                                </span>
                            </div>

                            <p className="response-text rr-12">
                                {r.respuesta}
                            </p>

                            <div className="card-actions rr-13">
                                <button className="rr-14" type="button" onClick={() => openEdit(r)} aria-label={`${t('common.edit')} /${r.atajo}`}>
                                    <i className="fas fa-pen"></i>
                                </button>
                                
                                <button className="rr-15" type="button" onClick={() => openDelete(r.id)} aria-label={`${t('common.delete')} /${r.atajo}`}>
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))}

                    <button className="ghost-column-placeholder rr-16" onClick={openCreate}>
                        <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                        <span className="ghost-text">{t('respuestas.new')}</span>
                    </button>

                </div>
                )}
            </div>

            {modalOpen && (
                <div className="rr-17"
                    onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
                    <div className="rr-18" {...formDialog}>
                        <h3 className="rr-19">
                            {formData.id ? t('respuestas.editTitle') : t('respuestas.new')}
                        </h3>
                        <p className="rr-20">
                            {formData.id ? t('respuestas.editSub') : t('respuestas.createSub')}
                        </p>

                        <label className="rr-21">{t('respuestas.shortcut')}</label>
                        <input aria-label={t('respuestas.shortcut')}
                            className="clean-input rr-22"
                            autoFocus
                            placeholder={t('respuestas.shortcutPlaceholder')}
                            value={formData.atajo}
                            onChange={e => setFormData({...formData, atajo: e.target.value})}
                            autoComplete="off"
                        />

                        <label className="rr-21">{t('respuestas.content')}</label>
                        <textarea aria-label={t('respuestas.content')}
                            className="clean-input no-resize rr-23"
                            placeholder={t('respuestas.contentPlaceholder')}
                            value={formData.respuesta}
                            onChange={e => setFormData({...formData, respuesta: e.target.value})}
                        ></textarea>

                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
                            <button className="btn-modal btn-confirm" onClick={handleSave}>
                                {formData.id ? t('common.save') : t('common.create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteModalOpen && (
                <div className="rr-17"
                    onClick={e => { if (e.target === e.currentTarget) setDeleteModalOpen(false); }}>
                    <div className="rr-24" {...deleteDialog}>
                        <div className="rr-25">
                            <div className="icon-trash-bg rr-26">
                                <i className="fas fa-trash-alt"></i>
                            </div>
                            <h3 className="rr-27">{t('respuestas.deleteTitle')}</h3>
                            <p className="rr-28">{t('common.irreversible')}</p>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={() => setDeleteModalOpen(false)}>{t('common.cancel')}</button>
                            <button className="btn-modal btn-confirm-danger" onClick={handleDelete}>{t('common.delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}