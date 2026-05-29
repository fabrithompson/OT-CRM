import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';

export default function Perfil() {
    const { t } = useLanguage();
    const { refresh: refreshGlobal } = useUser();
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
        <div style={{ padding: '2rem', color: 'white', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner"></div>
        </div>
    );

    return (
        <div id="profile-wrapper" className="profile-wrapper" style={{ height: '100vh', overflowY: 'auto', padding: '1.25rem 1.5rem', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div className="profile-content" style={{ width: '100%', maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: '#fff' }}>{t('perfil.title')}</h2>

                {mensaje.texto && (
                    <div style={{
                        background: mensaje.tipo === 'exito' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        color:      mensaje.tipo === 'exito' ? '#86efac' : '#fca5a5',
                        border:     `1px solid ${mensaje.tipo === 'exito' ? '#10b981' : '#ef4444'}`,
                        padding: '15px', borderRadius: '10px', marginBottom: '20px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <i className={`fas ${mensaje.tipo === 'exito' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{mensaje.texto}</span>
                    </div>
                )}

                {/* Grid: configuración (izq) | equipo + solicitudes (der) */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                    gap: 14, alignItems: 'start',
                }}>
                <div className="content-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '22px' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Avatar */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--border-glass)' }}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Perfil" style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 0 20px rgba(255,255,255,0.2)' }} />
                            ) : (
                                <div style={{ width: '96px', height: '96px', fontSize: '2.5rem', border: '3px solid white', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '50%', background: '#333', color: '#fff' }}>
                                    {(usuario.nombreCompleto || usuario.username || 'U').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <label style={{ cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}>
                                <i className="fas fa-camera"></i> {t('perfil.changePhoto')}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoChange} />
                            </label>
                        </div>

                        {/* Campos */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#9ca3af' }}>{t('perfil.fullName')}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                    value={usuario.nombreCompleto || ''}
                                    onChange={e => setUsuario({ ...usuario, nombreCompleto: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#9ca3af' }}>{t('perfil.email')}</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                    value={usuario.email || ''}
                                    onChange={e => setUsuario({ ...usuario, email: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Contraseña */}
                        <div>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#9ca3af' }}>
                                {t('perfil.newPwd')} <span style={{ fontWeight: 'normal', opacity: 0.6 }}>({t('common.optional')})</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={t('perfil.pwdPlaceholder')}
                                    className="form-control"
                                    style={{ width: '100%', padding: '12px', paddingRight: '45px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    style={{ position: 'absolute', top: '50%', right: '15px', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '1.1rem' }}
                                >
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={saving}
                            style={{ padding: '15px', margin: '0 auto', width: '100%', maxWidth: '250px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                        >
                            {saving ? <i className="fas fa-spinner fa-spin"></i> : t('perfil.saveBtn')}
                        </button>
                    </form>
                </div>
                {/* Columna derecha: Equipo + Solicitudes apiladas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                {/* Equipo */}
                <div className="content-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--border-glass)' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-users" style={{ color: '#6366f1', fontSize: '1.1rem' }}></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{t('perfil.team.title')}</h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>{t('perfil.team.subtitle')}</p>
                        </div>
                    </div>

                    {usuario.agencia && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                <i className="fas fa-shield-alt" style={{ color: '#6366f1' }}></i>
                                <span style={{ color: '#c4b5fd', fontSize: '0.88rem' }}>
                                    {t('perfil.team.currentTeam')} <strong style={{ color: '#fff' }}>{usuario.agencia.nombre}</strong>
                                </span>
                            </div>
                            {usuario.agencia.codigoInvitacion && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <i className="fas fa-key" style={{ color: '#10b981' }}></i>
                                    <span style={{ color: '#6b7280', fontSize: '0.88rem' }}>{t('perfil.team.yourCode')}</span>
                                    <code style={{ color: '#10b981', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.12em', background: 'rgba(16,185,129,0.1)', padding: '2px 10px', borderRadius: '6px' }}>
                                        {usuario.agencia.codigoInvitacion}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}

                    {mensajeEquipo.texto && (
                        <div style={{
                            background: mensajeEquipo.tipo === 'exito' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            color:      mensajeEquipo.tipo === 'exito' ? '#86efac' : '#fca5a5',
                            border:     `1px solid ${mensajeEquipo.tipo === 'exito' ? '#10b981' : '#ef4444'}`,
                            padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem',
                        }}>
                            <i className={`fas ${mensajeEquipo.tipo === 'exito' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>{mensajeEquipo.texto}</span>
                        </div>
                    )}

                    <form onSubmit={handleUnirseEquipo} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#9ca3af', fontSize: '0.85rem' }}>
                                {t('perfil.team.codeLabel')}
                            </label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder={t('perfil.team.codePlaceholder')}
                                maxLength={7}
                                value={codigoEquipo}
                                onChange={e => setCodigoEquipo(e.target.value.toUpperCase())}
                                style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', outline: 'none', letterSpacing: '0.1em', fontWeight: 600 }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={enviandoSolicitud || !codigoEquipo.trim()}
                            style={{ padding: '12px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: enviandoSolicitud || !codigoEquipo.trim() ? 'not-allowed' : 'pointer', opacity: enviandoSolicitud || !codigoEquipo.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0, marginBottom: "3px" }}
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
                    <div className="content-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--border-glass)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-user-plus" style={{ color: '#a78bfa', fontSize: '1.1rem' }}></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                                    {t('solicitudes.title')}
                                    {solicitudes.length > 0 && (
                                        <span style={{ marginLeft: 8, background: '#a78bfa', color: '#fff', borderRadius: '20px', padding: '2px 9px', fontSize: '0.75rem', fontWeight: 700 }}>
                                            {solicitudes.length}
                                        </span>
                                    )}
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>{t('solicitudes.subtitle')}</p>
                            </div>
                        </div>

                        {solicitudes.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: '0.9rem' }}>
                                <i className="fas fa-inbox" style={{ fontSize: '1.5rem', marginBottom: 8, display: 'block' }}></i>
                                {t('solicitudes.empty')}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {solicitudes.map(s => {
                                    const u = s.usuarioSolicitante;
                                    const fecha = new Date(s.fechaCreacion).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
                                    const busy = gestionando === s.id;
                                    return (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.18)' }}>
                                            {u.fotoUrl ? (
                                                <img src={u.fotoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>
                                                    {(u.nombreCompleto || u.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {u.nombreCompleto || u.username}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                                    @{u.username} · {t('solicitudes.requested')} {fecha}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                                <button
                                                    onClick={() => handleGestionar(s.id, true)}
                                                    disabled={busy}
                                                    style={{ padding: '7px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', borderRadius: '8px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
                                                >
                                                    {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                                    {t('solicitudes.approve')}
                                                </button>
                                                <button
                                                    onClick={() => handleGestionar(s.id, false)}
                                                    disabled={busy}
                                                    style={{ padding: '7px 16px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
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
                </div>
                </div>
            </div>
        </div>
    );
}