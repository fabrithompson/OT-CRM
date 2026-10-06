import PropTypes from 'prop-types';

/**
 * Contenedor de superficie. Si recibe `onClick` se comporta como un botón
 * (role, tabIndex y activación con Enter/Espacio) para que sea usable con teclado.
 */
export default function Card({ title, flush = false, onClick, className = '', children, ...rest }) {
    const interactive = typeof onClick === 'function';
    const classes = ['ui-card', flush && 'ui-card--flush', interactive && 'ui-card--interactive', className]
        .filter(Boolean).join(' ');

    const handleKeyDown = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
    };

    return (
        <div
            className={classes}
            onClick={onClick}
            onKeyDown={interactive ? handleKeyDown : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            {...rest}
        >
            {title && <h3 className="ui-card__title">{title}</h3>}
            {children}
        </div>
    );
}

Card.propTypes = {
    title: PropTypes.node,
    flush: PropTypes.bool,
    onClick: PropTypes.func,
    className: PropTypes.string,
    children: PropTypes.node,
};
