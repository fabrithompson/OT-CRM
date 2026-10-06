import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';
import { useLanguage } from '../context/LangContext';
import { getToken } from '../utils/api';

export default function NotFound() {
    const { t } = useLanguage();
    const logged = Boolean(getToken());

    return (
        <div className="ui-center">
            <EmptyState
                icon="fas fa-compass"
                title={t('errors.notFoundTitle')}
                description={t('errors.notFoundMsg')}
                action={(
                    <Link className="ui-btn ui-btn--primary" to={logged ? '/dashboard' : '/'}>
                        {logged ? t('errors.backDashboard') : t('errors.backHome')}
                    </Link>
                )}
            />
        </div>
    );
}
