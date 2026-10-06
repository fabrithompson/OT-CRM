import PropTypes from 'prop-types';
import { Button, EmptyState } from './ui';
import { useLanguage } from '../context/LangContext';

/**
 * Pantalla de error para los ErrorBoundary. Los links usan <a href> y no <Link>
 * a propósito: si el error vino del router, un <Link> también fallaría.
 * Con `inline` (error dentro de una página) se muestra "Reintentar" para
 * resetear el boundary sin recargar y el sidebar sigue disponible.
 */
export default function ErrorFallback({ onReset, inline = false }) {
    const { t } = useLanguage();
    return (
        <div className={`ui-center${inline ? ' ui-center--inline' : ''}`} role="alert">
            <EmptyState
                icon="fas fa-triangle-exclamation"
                title={t('errors.title')}
                description={t('errors.message')}
                action={(
                    <div className="ui-actions">
                        {inline && onReset && (
                            <Button variant="primary" icon="fas fa-rotate-right" onClick={onReset}>{t('errors.retry')}</Button>
                        )}
                        <Button variant={inline ? 'secondary' : 'primary'} icon="fas fa-rotate" onClick={() => window.location.reload()}>
                            {t('errors.reload')}
                        </Button>
                        <a className="ui-btn ui-btn--ghost" href="/dashboard">{t('errors.backDashboard')}</a>
                    </div>
                )}
            />
        </div>
    );
}

ErrorFallback.propTypes = {
    onReset: PropTypes.func,
    inline: PropTypes.bool,
};
