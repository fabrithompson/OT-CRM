import { Skeleton } from './ui';
import { useLanguage } from '../context/LangContext';

/**
 * Fallback del Suspense dentro de MainLayout: reserva la forma genérica de una
 * página (título + tarjetas + bloque grande) mientras se descarga el chunk, sin
 * sacar el sidebar de pantalla.
 */
export default function PageSkeleton() {
    const { t } = useLanguage();
    return (
        <div className="page-skeleton" role="status" aria-busy="true">
            <span className="ui-sr-only">{t('ui.loading')}</span>
            <Skeleton variant="text" width="220px" height="2rem" />
            <div className="page-skeleton__row">
                <Skeleton height="96px" />
                <Skeleton height="96px" />
                <Skeleton height="96px" />
                <Skeleton height="96px" />
            </div>
            <Skeleton height="min(320px, 40dvh)" />
        </div>
    );
}
