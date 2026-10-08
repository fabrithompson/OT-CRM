import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import Button from './Button';
import useDialog from '../../hooks/useDialog';
import { useLanguage } from '../../context/LangContext';

/**
 * Diálogo modal accesible. El comportamiento (role="dialog", foco atrapado,
 * Esc, devolución del foco) viene de useDialog; acá van el markup y el bloqueo
 * del scroll del body.
 */
export default function Modal({
    open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true,
}) {
    const { t } = useLanguage();
    const titleId = useId();
    const dialog = useDialog(open, onClose, { canClose: Boolean(onClose) });

    useEffect(() => {
        if (!open) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prevOverflow; };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div
            className="ui-modal-backdrop"
            onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
        >
            <div
                {...dialog}
                className={`ui-modal${size !== 'md' ? ` ui-modal--${size}` : ''}`}
                aria-labelledby={titleId}
            >
                <div className="ui-modal__header">
                    <h2 id={titleId} className="ui-modal__title">{title}</h2>
                    <Button variant="ghost" iconOnly icon="fas fa-times" onClick={onClose} aria-label={t('ui.close')} />
                </div>
                <div className="ui-modal__body">{children}</div>
                {footer && <div className="ui-modal__footer">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

Modal.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func,
    title: PropTypes.node.isRequired,
    children: PropTypes.node,
    footer: PropTypes.node,
    size: PropTypes.oneOf(['sm', 'md', 'lg']),
    closeOnBackdrop: PropTypes.bool,
};
