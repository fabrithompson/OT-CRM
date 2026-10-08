import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useLanguage } from '../context/LangContext';

const storageKey = (username) => `ot_onboarding_oculto_${username || 'anon'}`;
const readHidden = (username) => {
    try { return localStorage.getItem(storageKey(username)) === '1'; } catch { return false; }
};

/**
 * "Primeros pasos" del Dashboard (UX-29). Se oculta sola cuando todo está hecho,
 * o con el botón "Ocultar" (se recuerda por usuario en este navegador).
 */
export default function OnboardingChecklist({ username, hasChannel, hasStages, teamSize, isAdmin }) {
    const { t } = useLanguage();
    const [hidden, setHidden] = useState(() => readHidden(username));
    const [replies, setReplies] = useState(null); // null = todavía no se sabe

    useEffect(() => {
        if (hidden) return undefined;
        let alive = true;
        api.get('/respuestas-rapidas')
            .then(res => { if (alive) setReplies(Array.isArray(res.data) ? res.data.length : 0); })
            .catch(() => { if (alive) setReplies(0); });
        return () => { alive = false; };
    }, [hidden]);

    const steps = [
        { id: 'channel', done: hasChannel, to: '/whatsapp-vincular', icon: 'fa-link' },
        { id: 'stages', done: hasStages, to: '/kanban', icon: 'fa-chart-gantt' },
        { id: 'replies', done: (replies ?? 0) > 0, to: '/respuestas-rapidas', icon: 'fa-bolt-lightning' },
        ...(isAdmin ? [{ id: 'team', done: teamSize > 1, to: '/perfil', icon: 'fa-user-plus' }] : []),
    ];
    const doneCount = steps.filter(s => s.done).length;

    if (hidden || replies === null || doneCount === steps.length) return null;

    const hide = () => {
        try { localStorage.setItem(storageKey(username), '1'); } catch { /* sin storage: se oculta solo en esta sesión */ }
        setHidden(true);
    };

    return (
        <section className="onboarding" aria-labelledby="onboarding-title">
            <div className="onboarding__head">
                <div>
                    <h2 id="onboarding-title" className="onboarding__title">{t('onboarding.title')}</h2>
                    <p className="onboarding__progress">{t('onboarding.progress').replace('{done}', doneCount).replace('{total}', steps.length)}</p>
                </div>
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={hide}>{t('onboarding.hide')}</button>
            </div>
            <div className="onboarding__bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-labelledby="onboarding-title">
                <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="onboarding__list">
                {steps.map(step => (
                    <li key={step.id} className={`onboarding__item${step.done ? ' is-done' : ''}`}>
                        <span className="onboarding__check" aria-hidden="true">
                            <i className={`fa-solid ${step.done ? 'fa-check' : step.icon}`} />
                        </span>
                        <span className="onboarding__text">
                            <strong>{t(`onboarding.${step.id}.title`)}</strong>
                            <span>{t(`onboarding.${step.id}.desc`)}</span>
                        </span>
                        {step.done
                            ? <span className="onboarding__state">{t('onboarding.done')}</span>
                            : <Link className="ui-btn ui-btn--secondary ui-btn--sm" to={step.to}>{t('onboarding.go')}</Link>}
                    </li>
                ))}
            </ol>
        </section>
    );
}

OnboardingChecklist.propTypes = {
    username: PropTypes.string,
    hasChannel: PropTypes.bool.isRequired,
    hasStages: PropTypes.bool.isRequired,
    teamSize: PropTypes.number.isRequired,
    isAdmin: PropTypes.bool.isRequired,
};
