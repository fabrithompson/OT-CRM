import { cloneElement, useId } from 'react';
import PropTypes from 'prop-types';

/**
 * Campo de formulario accesible: asocia la etiqueta con el control (`htmlFor`/`id`)
 * y vincula pista y error con `aria-describedby`. `children` debe ser un único
 * <input>, <select> o <textarea>; Field le inyecta id, aria-invalid y aria-describedby.
 */
export default function Field({ label, hint, error, required = false, children }) {
    const id = useId();
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const control = cloneElement(children, {
        id,
        required: required || children.props.required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        className: ['ui-input', children.props.className].filter(Boolean).join(' '),
    });

    return (
        <div className="ui-field">
            <label className="ui-field__label" htmlFor={id}>
                {label}
                {required && <span className="ui-field__required" aria-hidden="true">*</span>}
            </label>
            {control}
            {hint && <span id={hintId} className="ui-field__hint">{hint}</span>}
            {error && <span id={errorId} className="ui-field__error" role="alert">{error}</span>}
        </div>
    );
}

Field.propTypes = {
    label: PropTypes.node.isRequired,
    hint: PropTypes.node,
    error: PropTypes.node,
    required: PropTypes.bool,
    children: PropTypes.element.isRequired,
};
