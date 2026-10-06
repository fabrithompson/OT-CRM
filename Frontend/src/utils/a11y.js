/**
 * Props para que un elemento que no es <button> (una tarjeta, una fila, un chip)
 * sea operable con teclado: rol accesible, foco con Tab y activación con
 * Enter/Espacio. Usarlo solo cuando un <button> real rompería el layout o
 * quedaría anidado dentro de otro botón.
 *
 *   <div {...clickable(() => abrir(id))}>…</div>
 *   <div {...clickable(toggle, { role: 'checkbox', checked })}>…</div>
 */
export function clickable(handler, { role = 'button', disabled = false, checked, label } = {}) {
    const props = {
        role,
        tabIndex: disabled ? -1 : 0,
        onClick: disabled ? undefined : handler,
        onKeyDown: disabled ? undefined : (e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler(e);
            }
        },
    };
    if (disabled) props['aria-disabled'] = true;
    if (checked !== undefined) props['aria-checked'] = Boolean(checked);
    if (label) props['aria-label'] = label;
    return props;
}
