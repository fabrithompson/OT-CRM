import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import { useUser } from '../context/UserContext';

const PLAN_ICON = {
    FREE: { icon: 'fa-seedling', color: '#6b7280' },
    PRO: { icon: 'fa-bolt', color: '#3b82f6' },
    BUSINESS: { icon: 'fa-building', color: '#8b5cf6' },
    ENTERPRISE: { icon: 'fa-gem', color: '#f59e0b' },
};

const formatVencimiento = (v) => {
    if (!v || v === 'Sin vencimiento') return 'Sin fecha';
    try {
        return new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return v;
    }
};

const capitalize = (s) => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

export default function MiSuscripcion() {
    const { usuario: perfil, agenciaId, refresh: refreshUser } = useUser();
    const [equipo, setEquipo] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            const equipoRes = await api.get('/planes/equipo');
            setEquipo(equipoRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // WebSocket: listen for plan changes
    const handleWSEvent = useCallback((ev) => {
        if (ev?.tipo === 'PLAN_EQUIPO_ACTUALIZADO') {
            loadData();
            refreshUser();
            window.dispatchEvent(new CustomEvent('crm:plan-updated'));
        }
    }, [loadData, refreshUser]);

    useWebSocket(agenciaId, handleWSEvent, (client) => {
        // Subscribe only needed; the hook auto-subscribes to global-notifications
        // and the agencia topic subscription happens via onEvent in Kanban
        // Here we need to explicitly subscribe to agencia topic for plan events
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try {
                const data = JSON.parse(msg.body);
                if (data.tipo === 'PLAN_EQUIPO_ACTUALIZADO') {
                    loadData();
                }
            } catch { /* ignore */ }
        });
    });

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    const planEfectivo = equipo?.planEfectivo || { nombre: 'FREE' };
    const planNombre = planEfectivo.nombre || 'FREE';
    const planCfg = PLAN_ICON[planNombre] || PLAN_ICON.FREE;
    const miembros = equipo?.miembros || [];
    const esEquipo = miembros.length > 1;
    const esAdmin = perfil?.rol === 'ADMIN';
    const proveedor = planEfectivo.proveedorPago || perfil?.proveedorPago || null;
    const vencimiento = planEfectivo.vencimiento || null;

    return (
        <section className="page-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="dashboard-content custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '40px 20px', alignItems: 'center' }}>
                <div style={{ maxWidth: 650, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Plan Card */}
                    <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
                                Gestión de Suscripción
                            </h2>
                            <p style={{ color: '#9ca3af', margin: '5px 0 0', fontSize: '0.88rem' }}>
                                {esEquipo
                                    ? `Plan del equipo "${equipo.agenciaNombre}" — ${miembros.length} miembros`
                                    : 'Información sobre tu plan actual'}
                            </p>
                        </div>

                        <div style={{ padding: 28 }}>
                            {/* Active Plan */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ height: 60, width: 60, background: '#1e293b', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: planCfg.color, flexShrink: 0 }}>
                                    <i className={`fas ${planCfg.icon}`} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>
                                        {esEquipo ? 'Plan del Equipo' : 'Plan Activo'}
                                    </span>
                                    <h3 style={{ color: '#fff', margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 800 }}>
                                        {capitalize(planNombre)}
                                    </h3>
                                </div>
                                {esEquipo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: 20, flexShrink: 0 }}>
                                        <i className="fas fa-users" style={{ color: '#10b981', fontSize: '0.75rem' }} />
                                        <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>{miembros.length}</span>
                                    </div>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: '#9ca3af', fontSize: '0.72rem', display: 'block', marginBottom: 6, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Próximo Vencimiento</span>
                                    <strong style={{ color: '#fff', fontSize: '1rem' }}>{formatVencimiento(vencimiento)}</strong>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: '#9ca3af', fontSize: '0.72rem', display: 'block', marginBottom: 6, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Estado de cuenta</span>
                                    <strong style={{ color: planNombre !== 'FREE' ? '#10b981' : '#9ca3af', fontSize: '1rem' }}>
                                        {planNombre !== 'FREE' ? 'Activa' : 'Sin suscripción'}
                                    </strong>
                                </div>
                            </div>

                            {/* Payment Provider Actions */}
                            <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 24 }}>
                                {esEquipo && !esAdmin && proveedor && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(59,130,246,0.08)', padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(59,130,246,0.15)', marginBottom: 16 }}>
                                        <i className="fas fa-info-circle" style={{ color: '#3b82f6', fontSize: '1rem', flexShrink: 0 }} />
                                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                                            La suscripción de tu equipo es gestionada por el administrador. Tu plan se actualiza automáticamente.
                                        </p>
                                    </div>
                                )}

                                {(esAdmin || !esEquipo) && proveedor === 'PayPal' && (
                                    <>
                                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 14, lineHeight: 1.5 }}>
                                            Tu suscripción está vinculada a <strong style={{ color: '#fff' }}>PayPal</strong>. Podés gestionarla o cancelarla desde tu panel de pagos automáticos:
                                        </p>
                                        <a
                                            href="https://www.paypal.com/myaccount/autopay/"
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', padding: 15, background: '#003087', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: '0.95rem' }}
                                        >
                                            <i className="fab fa-paypal" /> Ir a Gestionar en PayPal
                                        </a>
                                    </>
                                )}

                                {(esAdmin || !esEquipo) && proveedor === 'Mercado Pago' && (
                                    <>
                                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 14, lineHeight: 1.5 }}>
                                            Tu suscripción está vinculada a <strong style={{ color: '#fff' }}>Mercado Pago</strong>. Podés gestionarla desde la sección de suscripciones de tu cuenta:
                                        </p>
                                        <a
                                            href="https://www.mercadopago.com.ar/subscriptions/"
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', padding: 15, background: '#009ee3', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: '0.95rem' }}
                                        >
                                            <i className="fas fa-wallet" /> Gestionar en Mercado Pago
                                        </a>
                                    </>
                                )}

                                {(esAdmin || !esEquipo) && !proveedor && (
                                    <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center' }}>
                                        No tenés una suscripción recurrente activa actualmente.
                                    </p>
                                )}

                                <p style={{ textAlign: 'center', marginTop: 22 }}>
                                    <Link to="/planes" style={{ color: '#9ca3af', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fas fa-arrow-left" /> Volver a Planes
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Team Members Card */}
                    {esEquipo && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
                            <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Miembros del Equipo</h3>
                                    <p style={{ color: '#9ca3af', margin: '3px 0 0', fontSize: '0.8rem' }}>Suscripción de cada miembro</p>
                                </div>
                                <span style={{ color: '#9ca3af', fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 8 }}>
                                    {miembros.length} miembro{miembros.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div style={{ padding: '8px 12px' }}>
                                {miembros.map(m => {
                                    const mPlan = m.plan?.nombre || 'FREE';
                                    const mCfg = PLAN_ICON[mPlan] || PLAN_ICON.FREE;
                                    const esYo = m.id === perfil?.id;

                                    return (
                                        <div
                                            key={m.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 14,
                                                padding: '14px 16px',
                                                borderRadius: 10,
                                                background: esYo ? 'rgba(255,255,255,0.03)' : 'transparent',
                                                transition: 'background 0.15s',
                                            }}
                                        >
                                            {/* Avatar */}
                                            {m.fotoUrl ? (
                                                <img
                                                    src={m.fotoUrl}
                                                    alt={m.nombreCompleto}
                                                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: 40, height: 40, borderRadius: '50%', background: '#1e293b',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.95rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                                                }}>
                                                    {(m.nombreCompleto || m.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}

                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ color: '#fff', fontSize: '0.92rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {m.nombreCompleto || m.username}
                                                    </span>
                                                    {esYo && (
                                                        <span style={{ color: '#9ca3af', fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>Vos</span>
                                                    )}
                                                </div>
                                                <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                                                    {m.rol === 'ADMIN' ? 'Administrador' : 'Colaborador'}
                                                </span>
                                            </div>

                                            {/* Plan Badge */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                background: `${mCfg.color}15`,
                                                border: `1px solid ${mCfg.color}30`,
                                                padding: '5px 12px',
                                                borderRadius: 20,
                                                flexShrink: 0,
                                            }}>
                                                <i className={`fas ${mCfg.icon}`} style={{ color: mCfg.color, fontSize: '0.7rem' }} />
                                                <span style={{ color: mCfg.color, fontSize: '0.78rem', fontWeight: 700 }}>
                                                    {capitalize(mPlan)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </section>
    );
}
