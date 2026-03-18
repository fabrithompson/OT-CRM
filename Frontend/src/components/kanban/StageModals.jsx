import React, { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';

// ─── Modal base ─────────────────────────────────────────────────────────────
function Overlay({ show, onClose, children }) {
    if (!show) return null;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    return (
        <div
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1060, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
            {children}
        </div>
    );
}

Overlay.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
};

function ModalBox({ children }) {
    return (
        <div style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 30, width: '90%', maxWidth: 400, boxShadow: '0 25px 50px rgba(0,0,0,0.7)' }}>
            {children}
        </div>
    );
}

ModalBox.propTypes = {
    children: PropTypes.node.isRequired,
};

// ─── Create Stage Modal ──────────────────────────────────────────────────────
export function CreateStageModal({ show, onClose, agenciaId }) {
    const [nombre, setNombre]   = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (!nombre.trim()) return;
        setLoading(true);
        try {
            await api.post('/etapas', { nombre: nombre.trim(), agencia: { id: agenciaId } });
            setNombre('');
            onClose();
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <Overlay show={show} onClose={onClose}>
            <ModalBox>
                <h3 style={{ margin: '0 0 5px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nueva Etapa</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>Crea una nueva columna en tu embudo</p>
                <input
                    id="create-stage-nombre"
                    className="clean-input"
                    autoFocus
                    style={{ width: '100%', marginBottom: 20 }}
                    placeholder="Nombre de la etapa..."
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>Cancelar</button>
                    <button className="btn-modal btn-confirm" onClick={handleCreate} disabled={loading}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Crear'}
                    </button>
                </div>
            </ModalBox>
        </Overlay>
    );
}

CreateStageModal.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    agenciaId: PropTypes.number,
};
CreateStageModal.defaultProps = { agenciaId: null };

// ─── Edit Stage Modal ────────────────────────────────────────────────────────
export function EditStageModal({ show, onClose, stage }) {
    const [nombre, setNombre]   = useState(stage?.nombre || '');
    const [loading, setLoading] = useState(false);

    React.useEffect(() => { setNombre(stage?.nombre || ''); }, [stage]);

    const handleSave = async () => {
        if (!nombre.trim() || !stage) return;
        setLoading(true);
        try {
            await api.put(`/etapas/${stage.id}`, { nombre: nombre.trim() });
            onClose();
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <Overlay show={show} onClose={onClose}>
            <ModalBox>
                <h3 style={{ margin: '0 0 5px', fontSize: '1.4rem', background: 'linear-gradient(to right, #fff, #aebac1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Editar Etapa</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>Cambia el nombre de esta etapa</p>
                <input
                    id="edit-stage-nombre"
                    className="clean-input"
                    autoFocus
                    style={{ width: '100%', marginBottom: 20 }}
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>Cancelar</button>
                    <button className="btn-modal btn-confirm" onClick={handleSave} disabled={loading}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Guardar'}
                    </button>
                </div>
            </ModalBox>
        </Overlay>
    );
}

EditStageModal.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    stage: PropTypes.shape({ id: PropTypes.number, nombre: PropTypes.string }),
};
EditStageModal.defaultProps = { stage: null };

// ─── Delete Stage Modal ──────────────────────────────────────────────────────
export function DeleteStageModal({ show, onClose, stage }) {
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!stage) return;
        setLoading(true);
        try {
            await api.delete(`/etapas/${stage.id}`);
            onClose();
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <Overlay show={show} onClose={onClose}>
            <ModalBox>
                <div style={{ textAlign: 'center' }}>
                    <div className="icon-trash-bg" style={{ margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#ef4444' }}>
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: '1.3rem' }}>¿Eliminar etapa?</h3>
                    <p style={{ color: '#94a3b8', marginBottom: 20 }}>
                        Estás por eliminar <strong style={{ color: '#fff' }}>{stage?.nombre}</strong>. Los clientes que estén en esta etapa no serán eliminados.
                    </p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>Cancelar</button>
                    <button className="btn-modal btn-confirm-danger" onClick={handleDelete} disabled={loading}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Eliminar'}
                    </button>
                </div>
            </ModalBox>
        </Overlay>
    );
}

DeleteStageModal.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    stage: PropTypes.shape({ id: PropTypes.number, nombre: PropTypes.string }),
};
DeleteStageModal.defaultProps = { stage: null };