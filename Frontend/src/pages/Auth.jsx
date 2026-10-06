import React, { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import api, { setTokens } from '../utils/api';
import '../assets/css/landing-x.css';
import '../assets/css/auth-x.css';
import LogoOrb from '../components/LogoOrb';
import PlanetHorizon from '../components/landing/PlanetHorizon';
import LineIcon from '../components/landing/LineIcon';
import { useLanguage } from '../context/LangContext';
import cielo1280 from '../assets/landing/cielo-1280.webp';
import cielo2400 from '../assets/landing/cielo-2400.webp';

const ALERT_ID = 'auth-alert';

/* Campo de texto con etiqueta asociada. Si hay un error general visible, el
   campo lo referencia con aria-describedby para que el lector lo anuncie. */
function Field({ id, label, describedBy, ...inputProps }) {
    return (
        <label className="lx-field" htmlFor={id}>
            <span>{label}</span>
            <input id={id} aria-describedby={describedBy} {...inputProps} />
        </label>
    );
}

Field.propTypes = {
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    describedBy: PropTypes.string,
};

function PwdField({ id, name, field, labelKey, autoComplete, showPassword, formData, handleInput, togglePwd, describedBy, t }) {
    const visible = showPassword[field];
    return (
        <div className="lx-field">
            <label htmlFor={id}>{t(labelKey)}</label>
            <div className="ax-pwd">
                <input
                    id={id} name={name} placeholder="••••••••" required
                    type={visible ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    aria-describedby={describedBy}
                    value={formData[name]} onChange={handleInput}
                />
                <button
                    type="button"
                    className="ax-pwd__toggle"
                    onClick={() => togglePwd(field)}
                    aria-label={visible ? t('auth.x.hidePwd') : t('auth.x.showPwd')}
                    aria-pressed={visible}
                >
                    <i className={`fas ${visible ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

PwdField.propTypes = {
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    field: PropTypes.string.isRequired,
    labelKey: PropTypes.string.isRequired,
    autoComplete: PropTypes.string.isRequired,
    showPassword: PropTypes.object.isRequired,
    formData: PropTypes.object.isRequired,
    handleInput: PropTypes.func.isRequired,
    togglePwd: PropTypes.func.isRequired,
    describedBy: PropTypes.string,
    t: PropTypes.func.isRequired,
};

function SubmitBtn({ children, loading }) {
    return (
        <button type="submit" className="lx-btn lx-btn--primary lx-btn--lg ax-submit" disabled={loading} aria-busy={loading || undefined}>
            {loading ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : children}
        </button>
    );
}

SubmitBtn.propTypes = { children: PropTypes.node, loading: PropTypes.bool };

/* Errores: role="alert" (se anuncian al aparecer). Éxitos: role="status". */
function Alert({ type, msg }) {
    if (!msg) return null;
    return (
        <div id={type === 'error' ? ALERT_ID : undefined} className={`ax-alert ax-alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
            <i className={`fas ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} aria-hidden="true" />
            <span>{msg}</span>
        </div>
    );
}

Alert.propTypes = { type: PropTypes.oneOf(['error', 'success']).isRequired, msg: PropTypes.node };

export default function Auth() {
    // /login?modo=registro abre directo en "Crear cuenta" (CTA "Empezar gratis" de la landing)
    const [mode, setMode] = useState(() => (
        new URLSearchParams(window.location.search).get('modo') === 'registro' ? 'register' : 'login'
    )); // login | register | forgot | reset | verify
    const [showPassword, setShowPassword] = useState({ login: false, register: false, new: false, confirm: false });
    const [formData, setFormData] = useState({
        username: '', password: '', email: '', codigoInvitacion: '',
        code: '', newPassword: '', confirmPassword: '', verifyCode: '', pendingUsername: '',
    });
    const [error, setError]     = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const tabsId = useId();

    const navigate = useNavigate();
    const { lang, toggleLang, t } = useLanguage();

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    const switchTo = (newMode) => {
        setError(null);
        setSuccess(null);
        setMode(newMode);
    };

    const handleInput = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const togglePwd   = (field) => setShowPassword(s => ({ ...s, [field]: !s[field] }));

    /* ── Handlers (sin cambios de lógica) ── */
    const handleLogin = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            const res = await api.post('/auth/login', { username: formData.username, password: formData.password });
            if (res.data?.token && res.data.token !== 'undefined') {
                setTokens(res.data.token, res.data.refreshToken);
                localStorage.removeItem('crm_theme');
                window.dispatchEvent(new CustomEvent('crm:auth-changed'));
                navigate('/dashboard');
            } else {
                setError(t('auth.errors.serverError'));
            }
        } catch (err) {
            if (err.response?.status === 403) {
                setFormData(f => ({ ...f, pendingUsername: formData.username }));
                switchTo('verify');
            } else {
                setError(err.response?.data?.error || t('auth.errors.badCredentials'));
            }
        } finally { setLoading(false); }
    };

    const handleRegister = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            await api.post('/auth/register', {
                username: formData.username, password: formData.password,
                email: formData.email, codigoInvitacion: formData.codigoInvitacion,
            });
            setFormData(f => ({ ...f, pendingUsername: formData.username }));
            setSuccess(t('auth.success.registered'));
            switchTo('verify');
        } catch (err) {
            setError(err.response?.data?.error || t('auth.errors.badCredentials'));
        } finally { setLoading(false); }
    };

    const handleVerify = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            await api.post('/auth/verify', {
                username: formData.pendingUsername || formData.username,
                code: formData.verifyCode,
            });
            setSuccess(t('auth.success.verified'));
            switchTo('login');
        } catch (err) {
            setError(err.response?.data?.error || t('auth.errors.badCredentials'));
        } finally { setLoading(false); }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        try {
            await api.post('/auth/resend-code', { emailOrUsername: formData.pendingUsername || formData.username });
            setResendCooldown(60);
            setSuccess(t('auth.success.codeResent'));
        } catch (err) {
            setError(err.response?.data?.error || t('auth.errors.badCredentials'));
        }
    };

    const handleForgot = async (e) => {
        e.preventDefault(); setError(null); setSuccess(null); setLoading(true);
        try {
            await api.post('/auth/forgot-password', { email: formData.email });
            setSuccess(t('auth.success.codeSent'));
            switchTo('reset');
        } catch (err) {
            setError(err.response?.data?.error || t('auth.errors.badCredentials'));
        } finally { setLoading(false); }
    };

    const handleReset = async (e) => {
        e.preventDefault(); setError(null); setSuccess(null);
        if (formData.newPassword !== formData.confirmPassword) return setError(t('auth.errors.pwdMismatch'));
        setLoading(true);
        try {
            await api.post('/auth/reset-password', {
                email: formData.email, code: formData.code,
                newPassword: formData.newPassword, confirmPassword: formData.confirmPassword,
            });
            setSuccess(t('auth.success.pwdChanged'));
            switchTo('login');
        } catch (err) {
            setError(err.response?.data?.error || t('auth.errors.badCredentials'));
        } finally { setLoading(false); }
    };

    const describedBy = error ? ALERT_ID : undefined;
    const pwdProps = { showPassword, formData, handleInput, togglePwd, describedBy, t };
    const isMain = mode === 'login' || mode === 'register';
    const isReg  = mode === 'register';

    // Pestañas con flechas izquierda/derecha (patrón ARIA "tabs")
    const onTabKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = isReg ? 'login' : 'register';
            switchTo(next);
            document.getElementById(`${tabsId}-${next}`)?.focus();
        }
    };

    const backLink = (to, labelKey) => (
        <button type="button" className="lx-link ax-back" onClick={() => switchTo(to)}>
            <i className="fas fa-arrow-left" aria-hidden="true" /> {t(labelKey)}
        </button>
    );

    return (
        <div className="lx ax" data-mode={mode}>
            {/* ── Panel cinematográfico ── */}
            <aside className="ax-visual">
                <div className="ax-visual__media" aria-hidden="true">
                    <img className="lx-sky__photo" src={cielo2400} srcSet={`${cielo1280} 1280w, ${cielo2400} 2400w`}
                        sizes="(max-width: 900px) 100vw, 50vw" alt="" decoding="async" fetchPriority="high" />
                    <PlanetHorizon className="lx-sky__horizon" />
                </div>
                <div className="ax-visual__veil" aria-hidden="true" />
                <div className="ax-visual__inner">
                    <div className="ax-visual__top">
                        <a href="/" className="lx-logo" onClick={(e) => { e.preventDefault(); navigate('/'); }} aria-label="OT CRM">
                            <LogoOrb width={56} height={46} showText={false} />
                        </a>
                        <button type="button" className="lx-btn lx-btn--ghost lx-btn--sm" onClick={() => navigate('/')}>
                            <i className="fas fa-arrow-left" aria-hidden="true" /> {t('auth.backToHome')}
                        </button>
                    </div>
                    <div className="ax-visual__copy">
                        <span className="lx-pill"><span className="lx-pill__dot" aria-hidden="true" />{t('landing.hero.badge')}</span>
                        <p className="ax-visual__title">
                            {t('landing.hero.titleA')} <span className="lx-accent">{t('landing.hero.titleB')}</span> {t('landing.hero.titleC')}
                        </p>
                        <p className="ax-visual__text">{t('auth.x.panelText')}</p>
                    </div>
                </div>
            </aside>

            {/* ── Formularios ── */}
            <main className="ax-main">
                <div className="ax-main__top">
                    <button type="button" className="lx-btn lx-btn--ghost lx-btn--sm" onClick={toggleLang} aria-label={t('landing.x.langLabel')}>
                        <LineIcon name="globe" size={18} />
                        {lang === 'es' ? 'EN' : 'ES'}
                    </button>
                </div>

                <div className="ax-card" key={isMain ? 'main' : mode}>
                    {isMain ? (
                        <>
                            <div className="ax-tabs" role="tablist" aria-label={t('auth.x.tabsLabel')}>
                                {['login', 'register'].map((m) => (
                                    <button
                                        key={m}
                                        id={`${tabsId}-${m}`}
                                        type="button"
                                        role="tab"
                                        aria-selected={mode === m}
                                        aria-controls={`${tabsId}-panel`}
                                        tabIndex={mode === m ? 0 : -1}
                                        className={`ax-tab${mode === m ? ' is-active' : ''}`}
                                        onClick={() => switchTo(m)}
                                        onKeyDown={onTabKey}
                                    >
                                        {m === 'login' ? t('landing.nav.ingresar') : t('auth.overlay.forLogin.btn')}
                                    </button>
                                ))}
                            </div>

                            <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${mode}`}>
                                <h1 className="ax-title">{t(`auth.panels.${mode}.title`)}</h1>
                                <p className="ax-subtitle">{t(`auth.panels.${mode}.subtitle`)}</p>
                                <Alert type="error" msg={error} />
                                <Alert type="success" msg={success} />

                                {!isReg ? (
                                    <form className="ax-form" onSubmit={handleLogin}>
                                        <Field id="login-user" name="username" type="text" autoComplete="username" required
                                            label={t('auth.panels.login.username')} placeholder={t('auth.panels.login.userPlaceholder')}
                                            value={formData.username} onChange={handleInput} describedBy={describedBy} />
                                        <PwdField id="login-pwd" name="password" field="login" autoComplete="current-password"
                                            labelKey="auth.panels.login.password" {...pwdProps} />
                                        <button type="button" className="lx-link ax-forgot" onClick={() => switchTo('forgot')}>
                                            {t('auth.panels.login.forgotPwd')}
                                        </button>
                                        <SubmitBtn loading={loading}>{t('auth.panels.login.submit')}</SubmitBtn>
                                    </form>
                                ) : (
                                    <form className="ax-form" onSubmit={handleRegister}>
                                        <Field id="reg-user" name="username" type="text" autoComplete="username" required
                                            label={t('auth.panels.register.username')} placeholder={t('auth.panels.register.userPlaceholder')}
                                            value={formData.username} onChange={handleInput} describedBy={describedBy} />
                                        <Field id="reg-email" name="email" type="email" autoComplete="email" required
                                            label={t('auth.panels.register.email')} placeholder={t('auth.panels.register.emailPlaceholder')}
                                            value={formData.email} onChange={handleInput} describedBy={describedBy} />
                                        <PwdField id="reg-pwd" name="password" field="register" autoComplete="new-password"
                                            labelKey="auth.panels.register.password" {...pwdProps} />
                                        <Field id="reg-code" name="codigoInvitacion" type="text" autoComplete="off"
                                            label={t('auth.panels.register.inviteCode')} placeholder={t('auth.panels.register.invitePlaceholder')}
                                            value={formData.codigoInvitacion} onChange={handleInput} />
                                        <SubmitBtn loading={loading}>{t('auth.panels.register.submit')}</SubmitBtn>
                                    </form>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {mode === 'forgot' && (
                                <>
                                    {backLink('login', 'auth.panels.forgot.back')}
                                    <h1 className="ax-title">{t('auth.panels.forgot.title')}</h1>
                                    <p className="ax-subtitle">{t('auth.panels.forgot.subtitle')}</p>
                                    <Alert type="error" msg={error} />
                                    <Alert type="success" msg={success} />
                                    <form className="ax-form" onSubmit={handleForgot}>
                                        <Field id="forgot-email" name="email" type="email" autoComplete="email" required
                                            label={t('auth.panels.forgot.email')} placeholder={t('auth.panels.forgot.emailPlaceholder')}
                                            value={formData.email} onChange={handleInput} describedBy={describedBy} />
                                        <SubmitBtn loading={loading}>{t('auth.panels.forgot.submit')}</SubmitBtn>
                                    </form>
                                </>
                            )}

                            {mode === 'reset' && (
                                <>
                                    {backLink('forgot', 'auth.panels.reset.back')}
                                    <h1 className="ax-title">{t('auth.panels.reset.title')}</h1>
                                    <p className="ax-subtitle">{t('auth.panels.reset.subtitle')}</p>
                                    <Alert type="error" msg={error} />
                                    <Alert type="success" msg={success} />
                                    <form className="ax-form" onSubmit={handleReset}>
                                        <Field id="reset-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
                                            label={t('auth.panels.reset.code')} placeholder={t('auth.panels.reset.codePlaceholder')}
                                            value={formData.code} onChange={handleInput} describedBy={describedBy} />
                                        <PwdField id="reset-new" name="newPassword" field="new" autoComplete="new-password"
                                            labelKey="auth.panels.reset.newPwd" {...pwdProps} />
                                        <PwdField id="reset-conf" name="confirmPassword" field="confirm" autoComplete="new-password"
                                            labelKey="auth.panels.reset.confirmPwd" {...pwdProps} />
                                        <SubmitBtn loading={loading}>{t('auth.panels.reset.submit')}</SubmitBtn>
                                    </form>
                                </>
                            )}

                            {mode === 'verify' && (
                                <>
                                    {backLink('login', 'auth.panels.verify.back')}
                                    <span className="ax-icon" aria-hidden="true"><LineIcon name="shield" size={28} /></span>
                                    <h1 className="ax-title">{t('auth.panels.verify.title')}</h1>
                                    <p className="ax-subtitle">{t('auth.panels.verify.subtitle')}</p>
                                    <Alert type="error" msg={error} />
                                    <Alert type="success" msg={success} />
                                    <form className="ax-form" onSubmit={handleVerify}>
                                        <label className="lx-field" htmlFor="verify-code">
                                            <span>{t('auth.panels.verify.code')}</span>
                                            <input
                                                id="verify-code" name="verifyCode" type="text" className="ax-code"
                                                inputMode="numeric" placeholder="123456"
                                                maxLength={6} required autoComplete="one-time-code"
                                                aria-describedby={describedBy}
                                                value={formData.verifyCode} onChange={handleInput}
                                            />
                                        </label>
                                        <SubmitBtn loading={loading}>{t('auth.panels.verify.submit')}</SubmitBtn>
                                    </form>
                                    <p className="ax-resend">
                                        {t('auth.panels.verify.noCode')}{' '}
                                        <button type="button" className="lx-link ax-inline-link"
                                            onClick={handleResend} disabled={resendCooldown > 0}>
                                            {resendCooldown > 0
                                                ? `${t('auth.panels.verify.resendIn')} ${resendCooldown}s`
                                                : t('auth.panels.verify.resend')}
                                        </button>
                                    </p>
                                </>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
