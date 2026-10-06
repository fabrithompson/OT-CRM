import PropTypes from 'prop-types';

/** Estado vacío con una acción sugerida (`action` suele ser un <Button>). */
export default function EmptyState({ icon = 'fas fa-inbox', title, description, action }) {
    return (
        <div className="ui-empty">
            <i className={`ui-empty__icon ${icon}`} aria-hidden="true" />
            <h3 className="ui-empty__title">{title}</h3>
            {description && <p className="ui-empty__desc">{description}</p>}
            {action}
        </div>
    );
}

EmptyState.propTypes = {
    icon: PropTypes.string,
    title: PropTypes.node.isRequired,
    description: PropTypes.node,
    action: PropTypes.node,
};
