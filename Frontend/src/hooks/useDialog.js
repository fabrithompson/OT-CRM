import { useEffect, useId, useMemo, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de diálogos abiertos: Esc y el foco atrapado solo actúan sobre el de
// arriba (p. ej. la vista previa de un archivo abierta dentro del chat).
const stack = [];

/**
 * Comportamiento accesible de diálogo modal para modales existentes, sin tocar
 * su markup ni su estilo:
 *  - role="dialog", aria-modal y aria-labelledby (toma el primer título del contenido)
 *  - foco inicial dentro del diálogo y foco atrapado con Tab / Shift+Tab
 *  - Esc cierra (salvo `canClose: false`, p. ej. mientras se guarda)
 *  - al cerrar, el foco vuelve al elemento que abrió el diálogo
 *
 * Uso:
 *   const dialog = useDialog(open, onClose, { canClose: !saving });
 *   <div className="overlay"><div className="box" {...dialog}>…</div></div>
 *
 * Los hooks van antes de cualquier `if (!open) return null`.
 */
export default function useDialog(open, onClose, { canClose = true } = {}) {
    const ref = useRef(null);
    const titleId = useId();
    const latest = useRef({ onClose, canClose });
    useEffect(() => { latest.current = { onClose, canClose }; });

    // Quién tenía el foco al abrir. Se lee durante el render en que `open` pasa a
    // true: después, en el commit, un `autoFocus` dentro del modal ya lo habría
    // movido adentro y no sabríamos a dónde devolverlo al cerrar.
    const opener = useMemo(
        () => (open && typeof document !== 'undefined' ? document.activeElement : null),
        [open],
    );

    useEffect(() => {
        if (!open) return undefined;
        const node = ref.current;
        if (!node) return undefined;

        const token = {};
        stack.push(token);
        const previouslyFocused = opener && !node.contains(opener) ? opener : null;

        if (!node.hasAttribute('aria-labelledby') && !node.hasAttribute('aria-label')) {
            const title = node.querySelector('h1, h2, h3, h4, h5, h6, .modal-title, [data-dialog-title]');
            if (title) {
                if (!title.id) title.id = titleId;
                node.setAttribute('aria-labelledby', title.id);
            }
        }

        // Foco inicial: [data-autofocus], el primer campo de formulario, o el primer control
        const initial = node.querySelector('[data-autofocus]')
            || node.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
            || node.querySelector(FOCUSABLE)
            || node;
        initial.focus({ preventScroll: true });

        const onKeyDown = (e) => {
            if (stack[stack.length - 1] !== token) return;
            if (e.key === 'Escape') {
                // Otro componente (un menú desplegable, el autocompletado) ya lo usó
                if (e.defaultPrevented) return;
                if (latest.current.canClose) {
                    e.preventDefault();
                    latest.current.onClose?.();
                }
                return;
            }
            if (e.key !== 'Tab') return;
            const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
            if (items.length === 0) { e.preventDefault(); node.focus(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (!node.contains(active)) {
                e.preventDefault(); first.focus();
            } else if (e.shiftKey && (active === first || active === node)) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            const i = stack.indexOf(token);
            if (i >= 0) stack.splice(i, 1);
            if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, [open, titleId, opener]);

    return { ref, role: 'dialog', 'aria-modal': true, tabIndex: -1 };
}
