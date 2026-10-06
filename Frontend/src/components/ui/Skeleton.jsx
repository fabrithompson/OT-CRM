import PropTypes from 'prop-types';

/** Placeholder de carga con la forma del contenido. Decorativo: aria-hidden. */
export default function Skeleton({ variant = 'rect', width, height, className = '', style }) {
    const classes = ['ui-skeleton', variant !== 'rect' && `ui-skeleton--${variant}`, className].filter(Boolean).join(' ');
    return <span className={classes} style={{ width, height, ...style }} aria-hidden="true" />;
}

Skeleton.propTypes = {
    variant: PropTypes.oneOf(['rect', 'text', 'circle']),
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    className: PropTypes.string,
    style: PropTypes.object,
};
