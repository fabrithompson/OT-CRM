import PropTypes from 'prop-types';
import Spinner from './Spinner';

/**
 * Botón base. `type` es "button" por defecto para no enviar formularios sin querer.
 * Con `loading` queda deshabilitado, muestra un spinner y marca `aria-busy`.
 * Para botones solo con ícono pasá `iconOnly` y un `aria-label`.
 */
export default function Button({
    variant = 'secondary', size = 'md', icon, iconOnly = false, loading = false,
    block = false, disabled = false, type = 'button', className = '', children, ...rest
}) {
    const classes = [
        'ui-btn', `ui-btn--${variant}`,
        size !== 'md' && `ui-btn--${size}`,
        iconOnly && 'ui-btn--icon',
        block && 'ui-btn--block',
        className,
    ].filter(Boolean).join(' ');

    return (
        <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
            {loading ? <Spinner /> : icon && <i className={icon} aria-hidden="true" />}
            {children}
        </button>
    );
}

Button.propTypes = {
    variant: PropTypes.oneOf(['primary', 'secondary', 'ghost', 'danger']),
    size: PropTypes.oneOf(['sm', 'md', 'lg']),
    icon: PropTypes.string,
    iconOnly: PropTypes.bool,
    loading: PropTypes.bool,
    block: PropTypes.bool,
    disabled: PropTypes.bool,
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    className: PropTypes.string,
    children: PropTypes.node,
};
