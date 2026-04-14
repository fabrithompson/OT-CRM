import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import '../assets/css/login.css';
import LogoOrb from '../components/LogoOrb';
import WaveCanvas from '../components/WaveCanvas';
import { useLanguage } from '../context/LangContext';

function PwdField({ id, name, field, labelKey, placeholder, showPassword, formData, handleInput, togglePwd, t }) {
    return (
        <div className="auth-field">
            <label htmlFor={id}>{t(labelKey)}</label>
            <div className="auth-pwd-wrap">
                <input
                    id={id} name={name} placeholder={placeholder} required
                    type={showPassword[field] ? 'text' : 'password'}
                    value={formData[name]} onChange={handleInput}
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => togglePwd(field)}>
                    <i className={`fas ${showPassword[field] ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
            </div>
        </div>
    );
}

export default function Auth() {
    const [mode, setMode] = useState('login'); // login | register | forgot | reset | verify
    const [showPassword, setShowPassword] = useState({ login: false, register: false, new: false, confirm: false });
    const [formData, setFormData] = useState({
        username: '', password: '', email: '', codigoInvitacion: '',
        code: '', newPassword: '', confirmPassword: '', verifyCode: '', pendingUsername: '',
    });
    const [error, setError]     = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

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

    /* ── Handlers ── */
    const handleLogin = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            const res = await api.post('/auth/login', { username: formData.username, password: formData.password });
            if (res.data?.token && res.data.token !== 'undefined') {
                localStorage.setItem('token', res.data.token);
                localStorage.removeItem('crm_theme');
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

    /* ── Reusable sub-components ── */
    const SubmitBtn = ({ children }) => (
        <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? <i className="fas fa-spinner fa-spin" /> : children}
        </button>
    );

    const Alert = ({ type, msg }) => msg ? (
        <div className={`auth-alert auth-alert--${type}`}>
            <i className={`fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-check-circle'}`} />
            {msg}
        </div>
    ) : null;

    const pwdProps = { showPassword, formData, handleInput, togglePwd, t };

    const isMain   = mode === 'login' || mode === 'register';
    const isReg    = mode === 'register';

    return (
        <>
            <WaveCanvas />
            <div className="landing-noise" aria-hidden="true" />

            {/* ── Top bar: back button only ── */}
            <div className="auth-topbar">
                <button className="auth-topbar-btn" onClick={() => navigate('/')}>
                    <i className="fa-solid fa-arrow-left" />
                    {t('auth.backToHome')}
                </button>
            </div>

            <div className="auth-scene">
                {isMain ? (
                    /* ════════════════════════════════════════
                       SPLIT CARD — Login / Register
                    ════════════════════════════════════════ */
                    <div className={`auth-split-card${isReg ? ' is-register' : ''}`}>

                        {/* ── LEFT HALF: Login form ── */}
                        <div className="auth-half auth-half--login" aria-hidden={isReg}>
                            <div className="auth-half-inner">
                                <h1 className="auth-title">{t('auth.panels.login.title')}</h1>
                                <p className="auth-subtitle">{t('auth.panels.login.subtitle')}</p>
                                <Alert type="error"   msg={!isReg && error}   />
                                <Alert type="success" msg={!isReg && success} />
                                <form onSubmit={handleLogin}>
                                    <div className="auth-field">
                                        <label htmlFor="login-user">{t('auth.panels.login.username')}</label>
                                        <input id="login-user" name="username" type="text"
                                            placeholder={t('auth.panels.login.userPlaceholder')}
                                            required value={formData.username} onChange={handleInput} />
                                    </div>
                                    <PwdField id="login-pwd" name="password" field="login"
                                        labelKey="auth.panels.login.password"
                                        placeholder="••••••••" {...pwdProps} />
                                    <SubmitBtn>{t('auth.panels.login.submit')}</SubmitBtn>
                                    <div className="auth-forgot-link">
                                        <button type="button" className="auth-link-btn" onClick={() => switchTo('forgot')}>
                                            {t('auth.panels.login.forgotPwd')}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* ── RIGHT HALF: Register form ── */}
                        <div className="auth-half auth-half--register" aria-hidden={!isReg}>
                            <div className="auth-half-inner">
                                <h1 className="auth-title">{t('auth.panels.register.title')}</h1>
                                <p className="auth-subtitle">{t('auth.panels.register.subtitle')}</p>
                                <Alert type="error" msg={isReg && error} />
                                <form onSubmit={handleRegister}>
                                    <div className="auth-field">
                                        <label htmlFor="reg-user">{t('auth.panels.register.username')}</label>
                                        <input id="reg-user" name="username" type="text"
                                            placeholder={t('auth.panels.register.userPlaceholder')}
                                            required value={formData.username} onChange={handleInput} />
                                    </div>
                                    <div className="auth-field">
                                        <label htmlFor="reg-email">{t('auth.panels.register.email')}</label>
                                        <input id="reg-email" name="email" type="email"
                                            placeholder={t('auth.panels.register.emailPlaceholder')}
                                            required value={formData.email} onChange={handleInput} />
                                    </div>
                                    <PwdField id="reg-pwd" name="password" field="register"
                                        labelKey="auth.panels.register.password"
                                        placeholder="••••••••" {...pwdProps} />
                                    <div className="auth-field">
                                        <label htmlFor="reg-code">{t('auth.panels.register.inviteCode')}</label>
                                        <input id="reg-code" name="codigoInvitacion" type="text"
                                            placeholder={t('auth.panels.register.invitePlaceholder')}
                                            value={formData.codigoInvitacion} onChange={handleInput} />
                                    </div>
                                    <SubmitBtn>{t('auth.panels.register.submit')}</SubmitBtn>
                                </form>
                            </div>
                        </div>

                        {/* ══ SLIDING OVERLAY PANEL ══ */}
                        <div className="auth-overlay-panel">
                            {/* Ambient glows */}
                            <div className="overlay-glow overlay-glow--top"    aria-hidden="true" />
                            <div className="overlay-glow overlay-glow--bottom" aria-hidden="true" />

                            <div className="overlay-inner">
                                {/* Content shown when overlay is on right (LOGIN mode) */}
                                <div className="overlay-content overlay-for-login">
                                    <LogoOrb width={72} height={74} showText={false} />
                                    <h2 className="overlay-heading">{t('auth.overlay.forLogin.heading')}</h2>
                                    <p className="overlay-sub">{t('auth.overlay.forLogin.sub')}</p>
                                    <button className="overlay-action-btn" onClick={() => switchTo('register')}>
                                        {t('auth.overlay.forLogin.btn')}
                                    </button>
                                </div>

                                {/* Content shown when overlay is on left (REGISTER mode) */}
                                <div className="overlay-content overlay-for-register">
                                    <LogoOrb width={72} height={74} showText={false} />
                                    <h2 className="overlay-heading">{t('auth.overlay.forRegister.heading')}</h2>
                                    <p className="overlay-sub">{t('auth.overlay.forRegister.sub')}</p>
                                    <button className="overlay-action-btn" onClick={() => switchTo('login')}>
                                        {t('auth.overlay.forRegister.btn')}
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    /* ════════════════════════════════════════
                       UTILITY CARD — Forgot / Reset / Verify
                    ════════════════════════════════════════ */
                    <div className="auth-util-card" key={mode}>

                        {mode === 'forgot' && (
                            <div className="auth-util-inner">
                                <div className="util-back">
                                    <button type="button" className="auth-link-btn" onClick={() => switchTo('login')}>
                                        <i className="fas fa-arrow-left" /> {t('auth.panels.forgot.back')}
                                    </button>
                                </div>
                                <h1 className="auth-title">{t('auth.panels.forgot.title')}</h1>
                                <p className="auth-subtitle">{t('auth.panels.forgot.subtitle')}</p>
                                <Alert type="error"   msg={error}   />
                                <Alert type="success" msg={success} />
                                <form onSubmit={handleForgot}>
                                    <div className="auth-field">
                                        <label htmlFor="forgot-email">{t('auth.panels.forgot.email')}</label>
                                        <input id="forgot-email" name="email" type="email"
                                            placeholder={t('auth.panels.forgot.emailPlaceholder')}
                                            required value={formData.email} onChange={handleInput} />
                                    </div>
                                    <SubmitBtn>{t('auth.panels.forgot.submit')}</SubmitBtn>
                                </form>
                            </div>
                        )}

                        {mode === 'reset' && (
                            <div className="auth-util-inner">
                                <div className="util-back">
                                    <button type="button" className="auth-link-btn" onClick={() => switchTo('forgot')}>
                                        <i className="fas fa-arrow-left" /> {t('auth.panels.reset.back')}
                                    </button>
                                </div>
                                <h1 className="auth-title">{t('auth.panels.reset.title')}</h1>
                                <p className="auth-subtitle">{t('auth.panels.reset.subtitle')}</p>
                                <Alert type="error"   msg={error}   />
                                <Alert type="success" msg={success} />
                                <form onSubmit={handleReset}>
                                    <div className="auth-field">
                                        <label htmlFor="reset-code">{t('auth.panels.reset.code')}</label>
                                        <input id="reset-code" name="code" type="text"
                                            placeholder={t('auth.panels.reset.codePlaceholder')}
                                            required value={formData.code} onChange={handleInput} />
                                    </div>
                                    <PwdField id="reset-new"  name="newPassword"     field="new"     labelKey="auth.panels.reset.newPwd"     placeholder="••••••••" {...pwdProps} />
                                    <PwdField id="reset-conf" name="confirmPassword" field="confirm" labelKey="auth.panels.reset.confirmPwd" placeholder="••••••••" {...pwdProps} />
                                    <SubmitBtn>{t('auth.panels.reset.submit')}</SubmitBtn>
                                </form>
                            </div>
                        )}

                        {mode === 'verify' && (
                            <div className="auth-util-inner">
                                <div className="util-back">
                                    <button type="button" className="auth-link-btn" onClick={() => switchTo('login')}>
                                        <i className="fas fa-arrow-left" /> {t('auth.panels.verify.back')}
                                    </button>
                                </div>
                                <div className="util-icon-wrap">
                                    <i className="fas fa-shield-alt" />
                                </div>
                                <h1 className="auth-title">{t('auth.panels.verify.title')}</h1>
                                <p className="auth-subtitle">{t('auth.panels.verify.subtitle')}</p>
                                <Alert type="error"   msg={error}   />
                                <Alert type="success" msg={success} />
                                <form onSubmit={handleVerify}>
                                    <div className="auth-field">
                                        <label htmlFor="verify-code">{t('auth.panels.verify.code')}</label>
                                        <input
                                            id="verify-code" name="verifyCode" type="text"
                                            inputMode="numeric" placeholder="123456"
                                            maxLength={6} required autoComplete="one-time-code"
                                            value={formData.verifyCode} onChange={handleInput}
                                            style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: '1.4rem' }}
                                        />
                                    </div>
                                    <SubmitBtn>{t('auth.panels.verify.submit')}</SubmitBtn>
                                </form>
                                <p className="util-resend-text">
                                    {t('auth.panels.verify.noCode')}{' '}
                                    <button type="button" className="auth-link-btn"
                                        onClick={handleResend} disabled={resendCooldown > 0}
                                        style={{ opacity: resendCooldown > 0 ? 0.5 : 1 }}>
                                        {resendCooldown > 0
                                            ? `${t('auth.panels.verify.resendIn')} ${resendCooldown}s`
                                            : t('auth.panels.verify.resend')}
                                    </button>
                                </p>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </>
    );
}
