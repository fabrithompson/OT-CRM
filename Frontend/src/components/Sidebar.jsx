import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import LogoOrb from './LogoOrb';
import { useLanguage } from '../context/LangContext';

const NAV_ITEMS = [
    { to: '/dashboard',          icon: 'fa-house',          labelKey: 'nav.inicio',      accent: 'nav-green'  },
    { to: '/kanban',             icon: 'fa-chart-gantt',    labelKey: 'nav.embudo',      accent: 'nav-orange' },
    { to: '/respuestas-rapidas', icon: 'fa-bolt-lightning', labelKey: 'nav.respuestas',  accent: 'nav-blue'   },
    { to: '/contactos',          icon: 'fa-user-group',     labelKey: 'nav.contactos',   accent: 'nav-purple' },
    { to: '/planes',             icon: 'fa-crown',          labelKey: 'nav.suscripcion', accent: 'nav-gold',  suscripcion: true },
    { to: '/perfil',             icon: 'fa-circle-user',    labelKey: 'nav.cuenta',      accent: 'nav-teal'   },
];

export default function Sidebar({ onHelpClick }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { lang, toggleLang, t } = useLanguage();

    const isSuscripcionActive = ['/planes', '/mi-suscripcion', '/checkout'].includes(pathname);

    return (
        <div className="sidebar">
            <div className="sidebar-glow" aria-hidden="true" />

            {/* Logo */}
            <div className="sidebar-header">
                <LogoOrb width={48} height={49} showText={false} onClick={() => navigate('/dashboard')} />
            </div>

            {/* Nav */}
            <ul className="menu-list">
                {NAV_ITEMS.map(({ to, icon, labelKey, accent, suscripcion }) => (
                    <li key={to} className="menu-item">
                        <NavLink
                            to={to}
                            className={({ isActive }) =>
                                `nav-pill ${accent}${(isActive || (suscripcion && isSuscripcionActive)) ? ' active' : ''}`
                            }
                        >
                            <span className="nav-pill-icon">
                                <i className={`fa-solid ${icon}`} />
                            </span>
                            <span className="link-text">{t(labelKey)}</span>
                        </NavLink>
                    </li>
                ))}
            </ul>

            {/* Bottom: Idioma + Soporte */}
            <ul className="menu-bottom">
                <li className="menu-item">
                    <button onClick={toggleLang} className="nav-pill nav-lang" title={t('lang.name')}>
                        <span className="nav-pill-icon nav-pill-icon--lang">
                            <i className="fa-solid fa-globe" />
                        </span>
                        <span className="link-text">{lang === 'es' ? 'EN' : 'ES'}</span>
                    </button>
                </li>
                <li className="menu-item">
                    <button onClick={onHelpClick} className="nav-pill nav-support" title={t('nav.soporte')}>
                        <span className="nav-pill-icon">
                            <i className="fa-solid fa-headset" />
                        </span>
                        <span className="link-text">{t('nav.soporte')}</span>
                    </button>
                </li>
                <li className="menu-item">
                    <button
                        onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
                        className="nav-pill nav-logout"
                        title={t('common.logout')}
                    >
                        <span className="nav-pill-icon">
                            <i className="fa-solid fa-arrow-right-from-bracket" />
                        </span>
                        <span className="link-text">{t('common.logout')}</span>
                    </button>
                </li>
            </ul>
        </div>
    );
}
