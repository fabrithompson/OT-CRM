import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import LogoOrb from './LogoOrb';
import { useLanguage } from '../context/LangContext';
import { useUser } from '../context/UserContext';

// requiereFlag: nombre del flag del plan que habilita esta sección
const NAV_ITEMS = [
    { to: '/dashboard',          icon: 'fa-house',          labelKey: 'nav.inicio',      accent: 'nav-green'  },
    { to: '/kanban',             icon: 'fa-chart-gantt',    labelKey: 'nav.embudo',      accent: 'nav-orange' },
    { to: '/respuestas-rapidas', icon: 'fa-bolt-lightning', labelKey: 'nav.respuestas',  accent: 'nav-blue'   },
    { to: '/contactos',          icon: 'fa-user-group',     labelKey: 'nav.contactos',   accent: 'nav-purple' },
    { to: '/spam',               icon: 'fa-bullhorn',       labelKey: 'nav.spam',        accent: 'nav-amber',  requiereFlag: 'campaniasHabilitadas', minPlan: 'PRO' },
    { to: '/planes',             icon: 'fa-crown',          labelKey: 'nav.suscripcion', accent: 'nav-gold',   suscripcion: true },
    { to: '/agente-ia',          icon: 'fa-robot',          labelKey: 'nav.agente',      accent: 'nav-indigo', requiereFlag: 'agenteIaHabilitado', minPlan: 'ENTERPRISE' },
    { to: '/perfil',             icon: 'fa-circle-user',    labelKey: 'nav.cuenta',      accent: 'nav-teal'   },
];

export default function Sidebar({ onHelpClick }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { lang, toggleLang, t } = useLanguage();
    const { usuario } = useUser();

    const isSuscripcionActive = ['/planes', '/mi-suscripcion', '/checkout'].includes(pathname);
    const plan = usuario?.plan || {};

    return (
        <div className="sidebar">
            <div className="sidebar-glow" aria-hidden="true" />

            {/* Logo */}
            <div className="sidebar-header">
                <LogoOrb width={60} height={60} showText={false} onClick={() => navigate('/dashboard')} />
            </div>

            {/* Nav */}
            <ul className="menu-list">
                {NAV_ITEMS.map(({ to, icon, labelKey, accent, suscripcion, requiereFlag, minPlan }) => {
                    const bloqueado = requiereFlag && !plan?.[requiereFlag];
                    return (
                        <li key={to} className="menu-item">
                            <NavLink
                                to={bloqueado ? '/planes' : to}
                                title={bloqueado ? `Disponible desde plan ${minPlan}` : undefined}
                                className={({ isActive }) =>
                                    `nav-pill ${accent}${(isActive || (suscripcion && isSuscripcionActive)) ? ' active' : ''}${bloqueado ? ' nav-pill-locked' : ''}`
                                }
                                style={bloqueado ? { opacity: 0.55 } : undefined}
                            >
                                <span className="nav-pill-icon">
                                    <i className={`fa-solid ${icon}`} />
                                </span>
                                <span className="link-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {t(labelKey)}
                                    {bloqueado && (
                                        <span style={{
                                            fontSize: '0.6rem',
                                            background: 'rgba(245,158,11,0.18)',
                                            color: '#f59e0b',
                                            padding: '1px 6px',
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                            border: '1px solid rgba(245,158,11,0.3)',
                                        }}>
                                            <i className="fas fa-lock" style={{ marginRight: 3, fontSize: '0.55rem' }} />
                                            {minPlan}
                                        </span>
                                    )}
                                </span>
                            </NavLink>
                        </li>
                    );
                })}
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
                        onClick={() => {
                            localStorage.removeItem('token');
                            window.dispatchEvent(new CustomEvent('crm:auth-changed'));
                            navigate('/login');
                        }}
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
