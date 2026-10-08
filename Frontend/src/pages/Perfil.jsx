import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';
import '../assets/css/pages/Perfil.css';

export default function Perfil() {
    const { t } = useLanguage();
    const { refresh: refreshGlobal } = useUser();
    const location = useLocation();
    const [usuario, setUsuario]         = useState({ nombreCompleto: '', email: '', fotoUrl: '', username: '' });
    const [newPassword, setNewPassword] = useState('');
    const [fotoFile, setFotoFile]       = useState(null);
    const [previewUrl, setPreviewUrl]   = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [mensaje, setMensaje]         = useState({ tipo: '', texto: '' });
    const [loading, setLoading]           = useState(true);
    const [saving, setSaving]             = useState(false);
    const [codigoEquipo, setCodigoEquipo] = useState('');
    const [mensajeEquipo, setMensajeEquipo] = useState({ tipo: '', texto: '' });
    const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
    const [solicitudes, setSolicitudes]   = useState([]);
    const [gestionando, setGestionando]   = useState(null);

    // Google Contacts
    const [googleConectado, setGoogleConectado] = useState(false);
    const [googleMsg, setGoogleMsg]             = useState({ tipo: '', texto: '' });
    const [googleLoading, setGoogleLoading]     = useState(false);

    const fetchGoogleStatus = useCallback(async () => {
        try {
            const res = await api.get('/google/status');
            setGoogleConectado(res.data.conectado);
        } catch {
            setGoogleConectado(false);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchGoogleStatus(); }, [fetchGoogleStatus]);

    // Detectar resultado del OAuth redirect (?google=ok|error|denied)
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const googleParam = params.get('google');
        if (!googleParam) return;
        if (googleParam === 'ok') {
            setGoogleMsg({ tipo: 'exito', texto: 'Google Contacts conectado correctamente.' });
            setGoogleConectado(true);
        } else if (googleParam === 'denied') {
            setGoogleMsg({ tipo: 'error', texto: 'Acceso denegado. No se conectó Google Contacts.' });
        } else {
            setGoogleMsg({ tipo: 'error', texto: 'Error al conectar Google Contacts. Intentalo de nuevo.' });
        }
        window.history.replaceState({}, '', window.location.pathname);
    }, [location.search]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleGoogleConectar = async () => {
        setGoogleLoading(true);
        setGoogleMsg({ tipo: '', texto: '' });
        try {
            const res = await api.get('/google/auth-url');
            window.location.href = res.data.url;
        } catch {
            setGoogleMsg({ tipo: 'error', texto: 'No se pudo obtener el link de autorización.' });
            setGoogleLoading(false);
        }
    };

    const handleGoogleDesconectar = async () => {
        setGoogleLoading(true);
        setGoogleMsg({ tipo: '', texto: '' });
        try {
            await api.delete('/google/disconnect');
            setGoogleConectado(false);
            setGoogleMsg({ tipo: 'exito', texto: 'Cuenta Google desconectada.' });
        } catch {
            setGoogleMsg({ tipo: 'error', texto: 'Error al desconectar.' });
        } finally {
            setGoogleLoading(false);
        }
    };

    const isAdmin = ['OWNER', 'ADMIN'].includes(usuario.rol);

    const fetchPerfil = useCallback(async () => {
        try {
            const res = await api.get('/perfil');
            setUsuario(res.data);
            setPreviewUrl(res.data.fotoUrl || '');
        } catch {
            setMensaje({ tipo: 'error', texto: 'Error al cargar el perfil.' });
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSolicitudes = useCallback(async () => {
        try {
            const res = await api.get('/dashboard/equipo/solicitudes-pendientes');
            setSolicitudes(res.data || []);
        } catch (err) {
            console.warn('No se pudieron cargar solicitudes del equipo:', err);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchPerfil(); }, [fetchPerfil]);

    // Carga inicial + escucha del evento global de nuevas solicitudes.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isAdmin) return;
        fetchSolicitudes();
        const handler = () => fetchSolicitudes();
        window.addEventListener('crm:nueva-solicitud', handler);
        return () => window.removeEventListener('crm:nueva-solicitud', handler);
    }, [isAdmin, fetchSolicitudes]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleFotoChange = (e) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            setFotoFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const formData = new FormData();
            formData.append('nombreCompleto', usuario.nombreCompleto || '');
            formData.append('email',          usuario.email          || '');
            if (newPassword) formData.append('newPassword', newPassword);
            if (fotoFile)    formData.append('foto', fotoFile);

            // ✅ PUT (no POST)
            const res = await api.put('/perfil/actualizar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setMensaje({ tipo: 'exito', texto: res.data?.message || 'Perfil actualizado correctamente.' });
            fetchPerfil();
            refreshGlobal();
            setNewPassword('');
            setFotoFile(null);
        } catch (error) {
            setMensaje({ tipo: 'error', texto: error.response?.data?.error || 'Error al actualizar el perfil.' });
        } finally {
            setSaving(false);
        }
    };

    const handleGestionar = async (solicitudId, aprobar) => {
        setGestionando(solicitudId);
        try {
            await api.post('/dashboard/equipo/gestionar-solicitud', { solicitudId, aprobar });
            setSolicitudes(prev => prev.filter(s => s.id !== solicitudId));
        } catch (err) {
            console.warn('No se pudo gestionar la solicitud:', err);
        }
        finally { setGestionando(null); }
    };

    const handleUnirseEquipo = async (e) => {
        e.preventDefault();
        const codigo = codigoEquipo.trim().toUpperCase();
        if (!codigo) return;
        setEnviandoSolicitud(true);
        setMensajeEquipo({ tipo: '', texto: '' });
        try {
            const res = await api.post('/dashboard/equipo/solicitar-union', { codigo });
            setMensajeEquipo({ tipo: 'exito', texto: res.data?.message || t('perfil.team.successFallback') });
            setCodigoEquipo('');
        } catch (error) {
            setMensajeEquipo({ tipo: 'error', texto: error.response?.data?.error || t('perfil.team.errorFallback') });
        } finally {
            setEnviandoSolicitud(false);
        }
    };

    if (loading) return (
        <div className="prf-1">
            <div className="spinner"></div>
        </div>
    );

    return (
        <div id="profile-wrapper" className="profile-wrapper prf-2">
            <div className="profile-content prf-3">
                <h2 className="prf-4">{t('perfil.title')}</h2>

                {mensaje.texto && (
                    <div className="prf-65" style={{ borderRadius: '10px', background: mensaje.tipo === 'exito' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color:      mensaje.tipo === 'exito' ? '#86efac' : '#fca5a5', border:     `1px solid ${mensaje.tipo === 'exito' ? '#10b981' : '#ef4444'}` }}>
                        <i className={`fas ${mensaje.tipo === 'exito' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{mensaje.texto}</span>
                    </div>
                )}

                {/* Grid: configuración (izq) | equipo + solicitudes (der) */}
                <div className="prf-6">
                <div className="content-card prf-7">
                    <form className="prf-8" onSubmit={handleSubmit}>

                        {/* Avatar */}
                        <div className="prf-9">
                            {previewUrl ? (
                                <img className="prf-10" src={previewUrl} alt={t('perfil.photoAlt')} />
                            ) : (
                                <div className="prf-11">
                                    {(usuario.nombreCompleto || usuario.username || 'U').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <label className="prf-12">
                                <i className="fas fa-camera"></i> {t('perfil.changePhoto')}
                                <input className="prf-13" type="file" accept="image/*" onChange={handleFotoChange} />
                            </label>
                        </div>

                        {/* Campos */}
                        <div className="prf-14">
                            <div>
                                <label className="prf-15">{t('perfil.fullName')}</label>
                                <input aria-label={t('perfil.fullName')} autoComplete="name"
                                    type="text"
                                    className="form-control prf-16"
                                    value={usuario.nombreCompleto || ''}
                                    onChange={e => setUsuario({ ...usuario, nombreCompleto: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="prf-15">{t('perfil.email')}</label>
                                <input aria-label={t('perfil.email')} autoComplete="email"
                                    type="email"
                                    className="form-control prf-16"
                                    value={usuario.email || ''}
                                    onChange={e => setUsuario({ ...usuario, email: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Contraseña */}
                        <div>
                            <label className="prf-15">
                                {t('perfil.newPwd')} <span className="prf-17">({t('common.optional')})</span>
                            </label>
                            <div className="prf-18">
                                <input aria-label={t('perfil.pwdPlaceholder')} autoComplete="new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={t('perfil.pwdPlaceholder')}
                                    className="form-control prf-19"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                />
                                <button className="prf-20"
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    aria-label={t('auth.x.showPwd')}
                                >
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary prf-21"
                            disabled={saving}
                            style={{ cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                            {saving ? <i className="fas fa-spinner fa-spin"></i> : t('perfil.saveBtn')}
                        </button>
                    </form>
                </div>
                {/* Columna derecha: Equipo + Solicitudes apiladas */}
                <div className="prf-22">
                {/* Equipo */}
                <div className="content-card prf-7">
                    <div className="prf-23">
                        <div className="prf-24">
                            <i className="fas fa-users prf-25"></i>
                        </div>
                        <div>
                            <h3 className="prf-26">{t('perfil.team.title')}</h3>
                            <p className="prf-27">{t('perfil.team.subtitle')}</p>
                        </div>
                    </div>

                    {usuario.agencia && (
                        <div className="prf-28">
                            <div className="prf-29">
                                <i className="fas fa-shield-alt prf-30"></i>
                                <span className="prf-31">
                                    {t('perfil.team.currentTeam')} <strong className="prf-32">{usuario.agencia.nombre}</strong>
                                </span>
                            </div>
                            {usuario.agencia.codigoInvitacion && (
                                <div className="prf-33">
                                    <i className="fas fa-key prf-34"></i>
                                    <span className="prf-35">{t('perfil.team.yourCode')}</span>
                                    <code className="prf-36">
                                        {usuario.agencia.codigoInvitacion}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}

                    {mensajeEquipo.texto && (
                        <div className="prf-66" style={{ borderRadius: '10px', background: mensajeEquipo.tipo === 'exito' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color:      mensajeEquipo.tipo === 'exito' ? '#86efac' : '#fca5a5', border:     `1px solid ${mensajeEquipo.tipo === 'exito' ? '#10b981' : '#ef4444'}` }}>
                            <i className={`fas ${mensajeEquipo.tipo === 'exito' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>{mensajeEquipo.texto}</span>
                        </div>
                    )}

                    <form className="prf-38" onSubmit={handleUnirseEquipo}>
                        <div className="prf-39">
                            <label className="prf-40">
                                {t('perfil.team.codeLabel')}
                            </label>
                            <input aria-label={t('perfil.team.codeLabel')}
                                type="text"
                                className="form-control prf-41"
                                placeholder={t('perfil.team.codePlaceholder')}
                                maxLength={7}
                                value={codigoEquipo}
                                onChange={e => setCodigoEquipo(e.target.value.toUpperCase())}
                            />
                        </div>
                        <button className="prf-42"
                            type="submit"
                            disabled={enviandoSolicitud || !codigoEquipo.trim()}
                            style={{ cursor: enviandoSolicitud || !codigoEquipo.trim() ? 'not-allowed' : 'pointer', opacity: enviandoSolicitud || !codigoEquipo.trim() ? 0.6 : 1 }}
                        >
                            {enviandoSolicitud
                                ? <><i className="fas fa-spinner fa-spin"></i> {t('perfil.team.sending')}</>
                                : <><i className="fas fa-paper-plane"></i> {t('perfil.team.sendBtn')}</>
                            }
                        </button>
                    </form>
                </div>

                {/* Solicitudes pendientes — solo admins */}
                {isAdmin && (
                    <div className="content-card prf-7">
                        <div className="prf-23">
                            <div className="prf-43">
                                <i className="fas fa-user-plus prf-44"></i>
                            </div>
                            <div>
                                <h3 className="prf-26">
                                    {t('solicitudes.title')}
                                    {solicitudes.length > 0 && (
                                        <span className="prf-45">
                                            {solicitudes.length}
                                        </span>
                                    )}
                                </h3>
                                <p className="prf-27">{t('solicitudes.subtitle')}</p>
                            </div>
                        </div>

                        {solicitudes.length === 0 ? (
                            <div className="prf-46">
                                <i className="fas fa-inbox prf-47"></i>
                                {t('solicitudes.empty')}
                            </div>
                        ) : (
                            <div className="prf-48">
                                {solicitudes.map(s => {
                                    const u = s.usuarioSolicitante;
                                    const fecha = new Date(s.fechaCreacion).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
                                    const busy = gestionando === s.id;
                                    return (
                                        <div className="prf-49" key={s.id}>
                                            {u.fotoUrl ? (
                                                <img className="prf-50" src={u.fotoUrl} alt="" />
                                            ) : (
                                                <div className="prf-51">
                                                    {(u.nombreCompleto || u.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="prf-52">
                                                <div className="prf-53">
                                                    {u.nombreCompleto || u.username}
                                                </div>
                                                <div className="prf-54">
                                                    @{u.username} · {t('solicitudes.requested')} {fecha}
                                                </div>
                                            </div>
                                            <div className="prf-55">
                                                <button className="prf-56"
                                                    onClick={() => handleGestionar(s.id, true)}
                                                    disabled={busy}
                                                    style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
                                                >
                                                    {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                                    {t('solicitudes.approve')}
                                                </button>
                                                <button className="prf-57"
                                                    onClick={() => handleGestionar(s.id, false)}
                                                    disabled={busy}
                                                    style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
                                                >
                                                    {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times"></i>}
                                                    {t('solicitudes.reject')}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {/* Google Contacts */}
                <div className="content-card prf-7">
                    <div className="prf-23">
                        <div className="prf-58">
                            <i className="fab fa-google prf-59"></i>
                        </div>
                        <div>
                            <h3 className="prf-26">Google Contacts</h3>
                            <p className="prf-27">
                                {t('perfil.gcSub')}
                            </p>
                        </div>
                        <div className="prf-60">
                            <span className="prf-67" style={{ borderRadius: '20px', background: googleConectado ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)', color: googleConectado ? '#10b981' : 'var(--color-text-3)', border: `1px solid ${googleConectado ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)'}` }}>
                                {googleConectado ? 'Conectado' : 'No conectado'}
                            </span>
                        </div>
                    </div>

                    {googleMsg.texto && (
                        <div className="prf-66" style={{ borderRadius: '10px', background: googleMsg.tipo === 'exito' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color:      googleMsg.tipo === 'exito' ? '#86efac' : '#fca5a5', border:     `1px solid ${googleMsg.tipo === 'exito' ? '#10b981' : '#ef4444'}` }}>
                            <i className={`fas ${googleMsg.tipo === 'exito' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>{googleMsg.texto}</span>
                        </div>
                    )}

                    <p className="prf-62">
                        {t('perfil.gcDesc')}
                    </p>

                    {googleConectado ? (
                        <button className="prf-63"
                            onClick={handleGoogleDesconectar}
                            disabled={googleLoading}
                            style={{ cursor: googleLoading ? 'not-allowed' : 'pointer' }}
                        >
                            {googleLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-unlink"></i>}
                            {t('perfil.gcDisconnect')}
                        </button>
                    ) : (
                        <button className="prf-64"
                            onClick={handleGoogleConectar}
                            disabled={googleLoading}
                            style={{ cursor: googleLoading ? 'not-allowed' : 'pointer' }}
                        >
                            {googleLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fab fa-google"></i>}
                            {t('perfil.gcConnect')}
                        </button>
                    )}
                </div>

                </div>
                </div>
            </div>
        </div>
    );
}