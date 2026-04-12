import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import '../assets/css/login.css';
import LogoOrb from '../components/LogoOrb';
import WaveCanvas from '../components/WaveCanvas';

export default function Auth() {
    const [activePanel, setActivePanel] = useState('login');
    const [showPassword, setShowPassword] = useState({ login: false, register: false, new: false, confirm: false });
    const [formData, setFormData] = useState({
        username: '', password: '', email: '', codigoInvitacion: '',
        code: '', newPassword: '', confirmPassword: '', verifyCode: '', pendingUsername: '',
    });
    const [error, setError]     = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const sliderRef  = useRef(null);
    const wrapperRef = useRef(null);
    const navigate   = useNavigate();

    useEffect(() => {
        if (wrapperRef.current && sliderRef.current) {
            const idx = { reset: 0, forgot: 1, login: 2, register: 3, verify: 4 }[activePanel] ?? 2;
            const child = sliderRef.current.children[idx];
            if (child) wrapperRef.current.style.height = `${child.offsetHeight}px`;
        }
    }, [activePanel, error, success]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const slideTo = (panel) => { setError(null); setSuccess(null); setActivePanel(panel); };

    const getSliderTransform = () => {
        const pct = { reset: 0, forgot: -20, login: -40, register: -60, verify: -80 };
        return `translateX(${pct[activePanel] ?? -40}%)`;
    };

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleLogin = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            const res = await api.post('/auth/login', {
                username: formData.username, password: formData.password,
            });
            if (res.data && res.data.token && res.data.token !== 'undefined') {
                localStorage.setItem('token', res.data.token);
                localStorage.removeItem('crm_theme');
                navigate('/dashboard');
            } else {
                setError('Error en el servidor: No se generó un token válido.');
            }
        } catch (err) {
            const msg = err.response?.data?.error || 'Credenciales incorrectas';
            if (err.response?.status === 403) {
                setFormData(f => ({ ...f, pendingUsername: formData.username }));
                slideTo('verify');
            } else {
                setError(msg);
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
            setSuccess('Cuenta creada. Revisá tu email para verificarla.');
            slideTo('verify');
        } catch (err) {
            setError(err.response?.data?.error || 'Error al registrarse');
        } finally { setLoading(false); }
    };

    const handleVerify = async (e) => {
        e.preventDefault(); setError(null); setLoading(true);
        try {
            await api.post('/auth/verify', {
                username: formData.pendingUsername || formData.username,
                code: formData.verifyCode,
            });
            setSuccess('¡Cuenta verificada! Ya podés iniciar sesión.');
            slideTo('login');
        } catch (err) {
            setError(err.response?.data?.error || 'Código incorrecto o expirado.');
        } finally { setLoading(false); }
    };

    const handleResendCode = async () => {
        if (resendCooldown > 0) return;
        try {
            await api.post('/auth/resend-code', {
                emailOrUsername: formData.pendingUsername || formData.username,
            });
            setResendCooldown(60);
            setSuccess('Código reenviado. Revisá tu email.');
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo reenviar el código.');
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault(); setError(null); setSuccess(null); setLoading(true);
        try {
            await api.post('/auth/forgot-password', { email: formData.email });
            setSuccess('Código enviado a tu correo.');
            slideTo('reset');
        } catch (err) {
            setError(err.response?.data?.error || 'Error al enviar el correo');
        } finally { setLoading(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault(); setError(null); setSuccess(null);
        if (formData.newPassword !== formData.confirmPassword) return setError('Las contraseñas no coinciden');
        setLoading(true);
        try {
            await api.post('/auth/reset-password', {
                email: formData.email, code: formData.code,
                newPassword: formData.newPassword, confirmPassword: formData.confirmPassword,
            });
            setSuccess('Contraseña actualizada. Ya podés iniciar sesión.');
            slideTo('login');
        } catch (err) {
            setError(err.response?.data?.error || 'Código inválido o expirado');
        } finally { setLoading(false); }
    };

    const togglePassword = (field) => setShowPassword({ ...showPassword, [field]: !showPassword[field] });

    const Btn = ({ children, ...props }) => (
        <button type="submit" className="primary-btn" disabled={loading} {...props}>
            {loading ? <i className="fas fa-spinner fa-spin"></i> : children}
        </button>
    );

    return (
        <>
            {/* ── Animated wave background (shared with Landing) ── */}
            <WaveCanvas />
            <div className="landing-noise" aria-hidden="true" />

            {/* ── Back to landing — fixed top-left ── */}
            <button
                type="button"
                className="auth-back-btn"
                onClick={() => navigate('/')}
            >
                <i className="fas fa-arrow-left" />
                Volver al inicio
            </button>

            {/* ── Centered layout ── */}
            <div className="auth-layout">

                {/* ── Form panel ── */}
                <div className="auth-form-side">
                    <div className="auth-card">

                        {/* Logo inside card */}
                        <div className="brand-mini brand-fixed">
                            <LogoOrb size={62} />
                        </div>

                        <div className="auth-slider-wrapper" ref={wrapperRef}>
                            <div className="auth-slider" ref={sliderRef} style={{ transform: getSliderTransform(), width: '500%' }}>

                                {/* ── 0: RESET PASSWORD ── */}
                                <div className="auth-panel" id="panel-reset">
                                    <div className="auth-content">
                                        <div className="back-link">
                                            <button type="button" className="switch-btn" onClick={() => slideTo('forgot')} style={{ color: 'var(--text-muted)' }}>
                                                <i className="fas fa-arrow-left"></i> Volver a Email
                                            </button>
                                        </div>
                                        <h1>Nueva Contraseña</h1>
                                        <p className="subtitle">Ingresá el código que enviamos a tu email.</p>
                                        {error && activePanel === 'reset' && <div className="alert-box alert-error"><i className="fas fa-exclamation-triangle"></i> {error}</div>}
                                        <form onSubmit={handleResetPassword}>
                                            <div className="field">
                                                <label htmlFor="reset-code">Código de Seguridad</label>
                                                <input id="reset-code" name="code" type="text" placeholder="Ej: 123456" required value={formData.code} onChange={handleInputChange} />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="reset-new-password">Nueva Contraseña</label>
                                                <div className="password-wrapper">
                                                    <input id="reset-new-password" name="newPassword" type={showPassword.new ? 'text' : 'password'} placeholder="••••••••" required value={formData.newPassword} onChange={handleInputChange} />
                                                    <button type="button" className="password-toggle-icon toggle-btn" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => togglePassword('new')}>
                                                        <i className={`fas ${showPassword.new ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="field">
                                                <label htmlFor="reset-confirm-password">Confirmar Contraseña</label>
                                                <div className="password-wrapper">
                                                    <input id="reset-confirm-password" name="confirmPassword" type={showPassword.confirm ? 'text' : 'password'} placeholder="••••••••" required value={formData.confirmPassword} onChange={handleInputChange} />
                                                    <button type="button" className="password-toggle-icon toggle-btn" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => togglePassword('confirm')}>
                                                        <i className={`fas ${showPassword.confirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <Btn>Cambiar Contraseña</Btn>
                                        </form>
                                    </div>
                                </div>

                                {/* ── 1: FORGOT PASSWORD ── */}
                                <div className="auth-panel" id="panel-forgot">
                                    <div className="auth-content">
                                        <div className="back-link">
                                            <button type="button" className="switch-btn" onClick={() => slideTo('login')} style={{ color: 'var(--text-muted)' }}>
                                                <i className="fas fa-arrow-left"></i> Volver al login
                                            </button>
                                        </div>
                                        <h1>Recuperar</h1>
                                        <p className="subtitle">Te enviaremos un código de recuperación.</p>
                                        {error   && activePanel === 'forgot' && <div className="alert-box alert-error"><i className="fas fa-exclamation-triangle"></i> {error}</div>}
                                        {success && activePanel === 'forgot' && <div className="alert-box alert-success"><i className="fas fa-check-circle"></i> {success}</div>}
                                        <form onSubmit={handleForgotPassword}>
                                            <div className="field">
                                                <label htmlFor="forgot-email">Email registrado</label>
                                                <input id="forgot-email" name="email" type="email" placeholder="tu@empresa.com" required value={formData.email} onChange={handleInputChange} />
                                            </div>
                                            <Btn>Enviar Código</Btn>
                                        </form>
                                    </div>
                                </div>

                                {/* ── 2: LOGIN ── */}
                                <div className="auth-panel" id="panel-login">
                                    <div className="auth-content">
                                        <h1>Bienvenido</h1>
                                        <p className="subtitle">Iniciá sesión para gestionar tu imperio.</p>
                                        {error   && activePanel === 'login' && <div className="alert-box alert-error"><i className="fas fa-exclamation-triangle"></i> {error}</div>}
                                        {success && activePanel === 'login' && <div className="alert-box alert-success"><i className="fas fa-check-circle"></i> {success}</div>}
                                        <form onSubmit={handleLogin}>
                                            <div className="field">
                                                <label htmlFor="username">Usuario</label>
                                                <input id="username" name="username" type="text" placeholder="Ej: admin" required value={formData.username} onChange={handleInputChange} />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="password-login">Contraseña</label>
                                                <div className="password-wrapper">
                                                    <input id="password-login" name="password" type={showPassword.login ? 'text' : 'password'} placeholder="••••••••" required value={formData.password} onChange={handleInputChange} />
                                                    <button type="button" className="password-toggle-icon toggle-btn" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => togglePassword('login')}>
                                                        <i className={`fas ${showPassword.login ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <Btn>Ingresar</Btn>
                                            <p className="switch-text">
                                                ¿Nuevo en OT?{' '}
                                                <button type="button" className="switch-btn" onClick={() => slideTo('register')}>Crear cuenta</button>
                                            </p>
                                            <div className="forgot-password-link">
                                                <button type="button" className="switch-btn" onClick={() => slideTo('forgot')}>¿Olvidaste tu contraseña?</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>

                                {/* ── 3: REGISTER ── */}
                                <div className="auth-panel" id="panel-register">
                                    <div className="auth-content">
                                        <h1>Crear Cuenta</h1>
                                        <p className="subtitle">Únete a OT y potenciá tus operaciones.</p>
                                        {error && activePanel === 'register' && <div className="alert-box alert-error"><i className="fas fa-exclamation-triangle"></i> {error}</div>}
                                        <form onSubmit={handleRegister}>
                                            <div className="field">
                                                <label htmlFor="reg-username">Usuario</label>
                                                <input id="reg-username" name="username" type="text" placeholder="Ej: usuario_pro" required value={formData.username} onChange={handleInputChange} />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="reg-email">Email</label>
                                                <input id="reg-email" name="email" type="email" placeholder="tu@empresa.com" required value={formData.email} onChange={handleInputChange} />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="password-register">Contraseña</label>
                                                <div className="password-wrapper">
                                                    <input id="password-register" name="password" type={showPassword.register ? 'text' : 'password'} placeholder="••••••••" required value={formData.password} onChange={handleInputChange} />
                                                    <button type="button" className="password-toggle-icon toggle-btn" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => togglePassword('register')}>
                                                        <i className={`fas ${showPassword.register ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="field">
                                                <label htmlFor="codigoInvitacion">Código (Opcional)</label>
                                                <input id="codigoInvitacion" name="codigoInvitacion" type="text" placeholder="Si tenés un código, pegalo aquí" value={formData.codigoInvitacion} onChange={handleInputChange} />
                                            </div>
                                            <Btn>Registrarse</Btn>
                                            <p className="switch-text">
                                                ¿Ya tenés acceso?{' '}
                                                <button type="button" className="switch-btn" onClick={() => slideTo('login')}>Iniciá Sesión</button>
                                            </p>
                                        </form>
                                    </div>
                                </div>

                                {/* ── 4: VERIFY ── */}
                                <div className="auth-panel" id="panel-verify">
                                    <div className="auth-content">
                                        <div className="back-link">
                                            <button type="button" className="switch-btn" onClick={() => slideTo('login')} style={{ color: 'var(--text-muted)' }}>
                                                <i className="fas fa-arrow-left"></i> Volver al login
                                            </button>
                                        </div>

                                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '1.5rem', color: '#10b981' }}>
                                                <i className="fas fa-shield-alt"></i>
                                            </div>
                                            <h1>Verificación</h1>
                                            <p className="subtitle">Ingresá el código de 6 dígitos enviado a tu correo.</p>
                                        </div>

                                        {error   && activePanel === 'verify' && <div className="alert-box alert-error"><i className="fas fa-exclamation-triangle"></i> {error}</div>}
                                        {success && activePanel === 'verify' && <div className="alert-box alert-success"><i className="fas fa-check-circle"></i> {success}</div>}

                                        <form onSubmit={handleVerify}>
                                            <div className="field">
                                                <label htmlFor="verify-code">Código de Verificación</label>
                                                <input
                                                    id="verify-code"
                                                    name="verifyCode"
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="123456"
                                                    maxLength={6}
                                                    required
                                                    autoComplete="one-time-code"
                                                    value={formData.verifyCode}
                                                    onChange={handleInputChange}
                                                    style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: '1.4rem' }}
                                                />
                                            </div>
                                            <Btn>Verificar Cuenta</Btn>
                                        </form>

                                        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            ¿No te llegó el código?{' '}
                                            <button
                                                type="button"
                                                className="switch-btn"
                                                onClick={handleResendCode}
                                                disabled={resendCooldown > 0}
                                                style={{ opacity: resendCooldown > 0 ? 0.5 : 1 }}
                                            >
                                                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
                                            </button>
                                        </p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
