import PropTypes from 'prop-types';
import Modal from './Modal';
import Button from './Button';
import { useLanguage } from '../../context/LangContext';

/** Reemplazo de window.confirm. Con `danger` el botón de confirmar se pinta de rojo. */
export default function ConfirmDialog({
    open, title, message, confirmLabel, cancelLabel, danger = false, loading = false, onConfirm, onCancel,
}) {
    const { t } = useLanguage();
    return (
        <Modal
            open={open}
            onClose={loading ? undefined : onCancel}
            title={title}
            size="sm"
            footer={(
                <>
                    <Button variant="ghost" onClick={onCancel} disabled={loading}>{cancelLabel || t('ui.cancel')}</Button>
                    <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
                        {confirmLabel || t('ui.confirm')}
                    </Button>
                </>
            )}
        >
            {message}
        </Modal>
    );
}

ConfirmDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    title: PropTypes.node.isRequired,
    message: PropTypes.node,
    confirmLabel: PropTypes.string,
    cancelLabel: PropTypes.string,
    danger: PropTypes.bool,
    loading: PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
};
