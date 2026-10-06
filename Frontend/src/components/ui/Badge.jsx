import PropTypes from 'prop-types';

/** Etiqueta de estado. El significado debe estar en el texto, no solo en el color. */
export default function Badge({ tone = 'neutral', className = '', children }) {
    const classes = ['ui-badge', tone !== 'neutral' && `ui-badge--${tone}`, className].filter(Boolean).join(' ');
    return <span className={classes}>{children}</span>;
}

Badge.propTypes = {
    tone: PropTypes.oneOf(['neutral', 'success', 'warning', 'danger', 'info']),
    className: PropTypes.string,
    children: PropTypes.node,
};
