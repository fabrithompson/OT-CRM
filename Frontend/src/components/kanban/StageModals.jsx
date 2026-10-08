import React, { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';
import useDialog from '../../hooks/useDialog';
import '../../assets/css/pages/StageModals.css';
import { useLanguage } from '../../context/LangContext';

// ─── Modal base ─────────────────────────────────────────────────────────────
function Overlay({ show, onClose, children }) {
    const dialog = useDialog(show, onClose);
    if (!show) return null;
    return (
        <div className="stg-1"
            {...dialog}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
        <div className="stg-2">
            {children}
        </div>
    );
}

ModalBox.propTypes = {
    children: PropTypes.node.isRequired,
};

// ─── Create Stage Modal ──────────────────────────────────────────────────────
export function CreateStageModal({ show, onClose, agenciaId }) {
    const { t } = useLanguage();
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
                <h3 className="stg-3">{t('kanban.newStage')}</h3>
                <p className="stg-4">{t('kanban.stageCreateSub')}</p>
                <input aria-label={t('kanban.stageNamePh')}
                    id="create-stage-nombre"
                    className="clean-input stg-5"
                    autoFocus
                    placeholder={t('kanban.stageNamePh')}
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
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
// El consumidor pasa key={stage?.id} en el <EditStageModal/> para que React
// desmonte/monte cuando cambia la etapa editada — así el initial state del
// useState refleja siempre la etapa actual sin necesidad de useEffect+setState.
export function EditStageModal({ show, onClose, stage }) {
    const { t } = useLanguage();
    const [nombre, setNombre]   = useState(stage?.nombre || '');
    const [loading, setLoading] = useState(false);

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
                <h3 className="stg-3">{t('kanban.stageEditTitle')}</h3>
                <p className="stg-4">{t('kanban.stageEditSub')}</p>
                <input
                    aria-label={t('kanban.stageName')}
                    id="edit-stage-nombre"
                    className="clean-input stg-5"
                    autoFocus
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
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
    const { t } = useLanguage();
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
                <div className="stg-6">
                    <div className="icon-trash-bg stg-7">
                        <i className="fas fa-trash-alt"></i>
                    </div>
                    <h3 className="stg-8">{t('kanban.stageDeleteTitle')}</h3>
                    <p className="stg-9">
                        {t('kanban.stageDeleteA')} <strong className="stg-10">{stage?.nombre}</strong>{t('kanban.stageDeleteB')}
                    </p>
                </div>
                <div className="modal-actions">
                    <button className="btn-modal btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
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