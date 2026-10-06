import PropTypes from 'prop-types';
import { useLanguage } from '../../context/LangContext';

/** Indicador de carga. `label` es el texto para lectores de pantalla. */
export default function Spinner({ size, label, className = '' }) {
    const { t } = useLanguage();
    return (
        <span role="status" className={className}>
            <span className={`ui-spinner${size === 'lg' ? ' ui-spinner--lg' : ''}`} aria-hidden="true" />
            <span className="ui-sr-only">{label || t('ui.loading')}</span>
        </span>
    );
}

Spinner.propTypes = {
    size: PropTypes.oneOf(['md', 'lg']),
    label: PropTypes.string,
    className: PropTypes.string,
};
