import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import Button from './Button';
import { useLanguage } from '../../context/LangContext';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: role="dialog" + aria-modal, foco atrapado dentro,
 * cierra con Esc (y con clic en el fondo si `closeOnBackdrop`), bloquea el scroll
 * del body y devuelve el foco al elemento que lo abrió.
 */
export default function Modal({
    open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true,
}) {
    const { t } = useLanguage();
    const titleId = useId();
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const previouslyFocused = document.activeElement;
        const dialog = dialogRef.current;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Foco inicial: primer control del cuerpo; si no hay, el primero del diálogo o el diálogo mismo.
        const body = dialog.querySelector('.ui-modal__body');
        (body?.querySelector(FOCUSABLE) || dialog.querySelector(FOCUSABLE) || dialog).focus();

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current?.();
                return;
            }
            if (e.key !== 'Tab') return;
            const items = [...dialog.querySelectorAll(FOCUSABLE)];
            if (items.length === 0) { e.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = prevOverflow;
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div
            className="ui-modal-backdrop"
            onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
        >
            <div
                ref={dialogRef}
                className={`ui-modal${size !== 'md' ? ` ui-modal--${size}` : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
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
