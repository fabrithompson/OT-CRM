import React, { useState, useEffect } from 'react';
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

    useEffect(() => { fetchPerfil(); }, []);

    const fetchPerfil = async () => {
        try {
            const res = await api.get('/perfil');
            setUsuario(res.data);
            setPreviewUrl(res.data.fotoUrl || '');
        } catch {
            setMensaje({ tipo: 'error', texto: 'Error al cargar el perfil.' });
        } finally {
            setLoading(false);
        }
    };

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
        <div id="profile-wrapper" className="profile-wrapper" style={{ height: '100vh', overflowY: 'auto', padding: '2rem' }}>
            <div className="profile-content" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <h2 style={{ marginBottom: '25px', fontSize: '2rem', color: '#fff' }}>{t('perfil.title')}</h2>

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

                <div className="content-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '30px', marginBottom: '24px' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                        {/* Avatar */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Perfil" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 0 20px rgba(255,255,255,0.2)' }} />
                            ) : (
                                <div style={{ width: '120px', height: '120px', fontSize: '2.5rem', border: '3px solid white', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '50%', background: '#333', color: '#fff' }}>
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
                {/* Equipo */}
                <div className="content-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '30px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }}>
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
            </div>
        </div>
    );
}