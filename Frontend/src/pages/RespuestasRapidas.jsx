import React, { useState, useEffect } from 'react';
import api from '../utils/api';

export default function RespuestasRapidas() {
    const [respuestas, setRespuestas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [formData, setFormData] = useState({ id: null, atajo: '', respuesta: '' });
    const [deleteId, setDeleteId] = useState(null);

    useEffect(() => {
        fetchRespuestas();
    }, []);

    const fetchRespuestas = async () => {
        try {
            const res = await api.get('/respuestas-rapidas');
            setRespuestas(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

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

    if (loading) return <div style={{ padding: '2rem', color: 'white', display: 'flex', justifyContent: 'center' }}><div className="spinner"></div></div>;

    return (
        <section className="page-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="header-top" style={{ padding: '20px 30px', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
                <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fas fa-bolt text-warning" style={{ fontSize: '1.4rem' }}></i>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Respuestas Rápidas</span>
                </div>
            </div>

            <div className="dashboard-content custom-scrollbar" style={{ padding: '30px', overflowY: 'auto', flex: 1 }}>
                <div className="responses-grid" id="containerRespuestas" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                    
                    {respuestas.map(r => (
                        <div key={r.id} className="response-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                <span className="shortcut-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                    <i className="fas fa-terminal"></i>
                                    <span>/{r.atajo}</span>
                                </span>
                            </div>

                            <p className="response-text" style={{ color: '#d1d5db', fontSize: '0.95rem', flexGrow: 1, margin: '0 0 20px 0', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                {r.respuesta}
                            </p>

                            <div className="card-actions" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                                <button type="button" onClick={() => openEdit(r)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                    <i className="fas fa-pen"></i>
                                </button>
                                
                                <button type="button" onClick={() => openDelete(r.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))}

                    <button className="ghost-column-placeholder" onClick={openCreate} style={{ minHeight: '200px', height: 'auto', maxWidth: 'none', width: '100%' }}>
                        <div className="ghost-icon-circle"><i className="fas fa-plus"></i></div>
                        <span className="ghost-text">Nueva Respuesta</span>
                    </button>

                </div>
            </div>

            {modalOpen && (
                <div role="dialog" aria-modal="true" tabIndex={-1}
                    onKeyDown={e => { if (e.key === 'Escape') setModalOpen(false); }}
                    onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1060, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 30, width: '90%', maxWidth: 440, boxShadow: '0 25px 50px rgba(0,0,0,0.7)' }}>
                        <h3 style={{ margin: '0 0 5px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            {formData.id ? 'Editar Respuesta' : 'Nueva Respuesta'}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>
                            {formData.id ? 'Modifica los datos de esta respuesta rápida' : 'Crea una nueva respuesta rápida'}
                        </p>

                        <label style={{ display: 'block', color: '#94a3b8', marginBottom: 6, fontSize: '0.85rem', fontWeight: 500 }}>Atajo</label>
                        <input
                            className="clean-input"
                            autoFocus
                            style={{ width: '100%', marginBottom: 16, fontFamily: 'monospace' }}
                            placeholder="Nombre del atajo..."
                            value={formData.atajo}
                            onChange={e => setFormData({...formData, atajo: e.target.value})}
                            autoComplete="off"
                        />

                        <label style={{ display: 'block', color: '#94a3b8', marginBottom: 6, fontSize: '0.85rem', fontWeight: 500 }}>Contenido de la respuesta</label>
                        <textarea
                            className="clean-input no-resize"
                            style={{ width: '100%', marginBottom: 20, minHeight: 120, lineHeight: '1.5' }}
                            placeholder="Escribe la respuesta..."
                            value={formData.respuesta}
                            onChange={e => setFormData({...formData, respuesta: e.target.value})}
                        ></textarea>

                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
                            <button className="btn-modal btn-confirm" onClick={handleSave}>
                                {formData.id ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteModalOpen && (
                <div role="dialog" aria-modal="true" tabIndex={-1}
                    onKeyDown={e => { if (e.key === 'Escape') setDeleteModalOpen(false); }}
                    onClick={e => { if (e.target === e.currentTarget) setDeleteModalOpen(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1060, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 30, width: '90%', maxWidth: 400, boxShadow: '0 25px 50px rgba(0,0,0,0.7)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div className="icon-trash-bg" style={{ margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#ef4444' }}>
                                <i className="fas fa-trash-alt"></i>
                            </div>
                            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Eliminar respuesta?</h3>
                            <p style={{ color: '#94a3b8', marginBottom: 20 }}>Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={() => setDeleteModalOpen(false)}>Cancelar</button>
                            <button className="btn-modal btn-confirm-danger" onClick={handleDelete}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}