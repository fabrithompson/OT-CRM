import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import useWebSocket from '../hooks/useWebSocket';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';
import '../assets/css/pages/MiSuscripcion.css';

const PLAN_ICON = {
    FREE: { icon: 'fa-seedling', color: 'var(--color-text-3)' },
    PRO: { icon: 'fa-bolt', color: '#3b82f6' },
    BUSINESS: { icon: 'fa-building', color: '#8b5cf6' },
    ENTERPRISE: { icon: 'fa-gem', color: '#f59e0b' },
};

const formatVencimiento = (v, noDateLabel) => {
    if (!v || v === 'Sin vencimiento') return noDateLabel || 'Sin fecha';
    try {
        return new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return v;
    }
};

const capitalize = (s) => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

// "X / max" o "X / ∞" si el máximo es -1
const fmtUso = (used, max, unlimitedLabel) => {
    if (max === -1) return `${used ?? 0} / ${unlimitedLabel || '∞'}`;
    return `${used ?? 0} / ${max ?? 0}`;
};

export default function MiSuscripcion() {
    const { t } = useLanguage();
    const { usuario: perfil, agenciaId, refresh: refreshUser } = useUser();
    const [equipo, setEquipo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [okMsg, setOkMsg] = useState('');

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

    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        client.subscribe(`/topic/agencia/${agenciaId}`, (msg) => {
            try {
                const data = JSON.parse(msg.body);
                if (data.tipo === 'PLAN_EQUIPO_ACTUALIZADO') {
                    loadData();
                }
            } catch { /* ignore */ }
        });
    });

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        setOkMsg('');
        try {
            await api.post('/planes/refresh');
            await loadData();
            await refreshUser();
            setOkMsg(t('suscripcion.planRefreshed'));
            setTimeout(() => setOkMsg(''), 3000);
        } catch (e) {
            console.error('Error refrescando plan', e);
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="sub-1">
                <div className="spinner" />
            </div>
        );
    }

    const planEfectivo = equipo?.planEfectivo || { nombre: 'FREE' };
    const planNombre = planEfectivo.nombre || 'FREE';
    const planCfg = PLAN_ICON[planNombre] || PLAN_ICON.FREE;
    const miembros = equipo?.miembros || [];
    const esEquipo = miembros.length > 1;
    const esAdmin = perfil?.rol === 'ADMIN' || perfil?.rol === 'OWNER';
    const proveedor = planEfectivo.proveedorPago || perfil?.proveedorPago || null;
    const vencimiento = planEfectivo.vencimiento || null;
    const uso = equipo?.uso || {};
    const unlimited = t('suscripcion.unlimited');

    return (
        <section className="page-wrapper sub-2">
            <div className="dashboard-content custom-scrollbar sub-3">
                <div className="sub-4">

                    {/* Plan Card */}
                    <div className="sub-5">
                        <div className="sub-6">
                            <div>
                                <h2 className="sub-7">
                                    {t('suscripcion.title')}
                                </h2>
                                <p className="sub-8">
                                    {esEquipo
                                        ? `Plan "${equipo.agenciaNombre}" — ${miembros.length} ${miembros.length !== 1 ? t('suscripcion.members') : t('suscripcion.member')}`
                                        : t('suscripcion.currentPlanInfo')}
                                </p>
                            </div>
                            <button className="sub-9"
                                onClick={handleRefresh}
                                disabled={refreshing}
                                title={t('suscripcion.refreshPlan')}
                                style={{ cursor: refreshing ? 'wait' : 'pointer' }}
                            >
                                <i className={`fas ${refreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
                                {refreshing ? t('suscripcion.refreshing') : t('suscripcion.refreshPlan')}
                            </button>
                        </div>

                        {okMsg && (
                            <div className="sub-10">
                                <i className="fas fa-check-circle" />
                                {okMsg}
                            </div>
                        )}

                        <div className="sub-11">
                            {/* Active Plan */}
                            <div className="sub-12">
                                <div className="sub-13" style={{ color: planCfg.color }}>
                                    <i className={`fas ${planCfg.icon}`} />
                                </div>
                                <div className="sub-14">
                                    <span className="sub-15">
                                        {esEquipo ? t('suscripcion.teamPlanLabel') : t('suscripcion.activePlanLabel')}
                                    </span>
                                    <h3 className="sub-16">
                                        {capitalize(planNombre)}
                                    </h3>
                                </div>
                                {esEquipo && (
                                    <div className="sub-17">
                                        <i className="fas fa-users sub-18" />
                                        <span className="sub-19">{miembros.length}</span>
                                    </div>
                                )}
                            </div>

                            {/* Stats Grid: vencimiento + estado */}
                            <div className="sub-20">
                                <div className="sub-21">
                                    <span className="sub-22">{t('suscripcion.nextExpiry')}</span>
                                    <strong className="sub-23">{formatVencimiento(vencimiento, t('suscripcion.noDate'))}</strong>
                                </div>
                                <div className="sub-21">
                                    <span className="sub-22">{t('suscripcion.accountStatus')}</span>
                                    <strong className="sub-24" style={{ color: planNombre !== 'FREE' ? '#10b981' : '#9ca3af' }}>
                                        {planNombre !== 'FREE' ? t('suscripcion.statusActive') : t('suscripcion.statusNone')}
                                    </strong>
                                </div>
                            </div>

                            {/* Payment Provider Actions */}
                            <div className="sub-25">
                                {esEquipo && !esAdmin && proveedor && (
                                    <div className="sub-26">
                                        <i className="fas fa-info-circle sub-27" />
                                        <p className="sub-28">
                                            {t('suscripcion.managedByAdmin')}
                                        </p>
                                    </div>
                                )}

                                {(esAdmin || !esEquipo) && proveedor === 'PayPal' && (
                                    <>
                                        <p className="sub-29">
                                            {t('suscripcion.paypalManage')}
                                        </p>
                                        <a className="sub-30"
                                            href="https://www.paypal.com/myaccount/autopay/"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            <i className="fab fa-paypal" /> {t('suscripcion.paypalBtn')}
                                        </a>
                                    </>
                                )}

                                {(esAdmin || !esEquipo) && proveedor === 'Mercado Pago' && (
                                    <>
                                        <p className="sub-29">
                                            {t('suscripcion.mpManage')}
                                        </p>
                                        <a className="sub-31"
                                            href="https://www.mercadopago.com.ar/subscriptions/"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            <i className="fas fa-wallet" /> {t('suscripcion.mpBtn')}
                                        </a>
                                    </>
                                )}

                                {(esAdmin || !esEquipo) && !proveedor && (
                                    <p className="sub-32">
                                        {t('suscripcion.noSub')}
                                    </p>
                                )}

                                <p className="sub-33">
                                    <Link to="/planes" style={{ color: '#9ca3af', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <i className="fas fa-arrow-left" /> {t('suscripcion.backToPlans')}
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Limits Card */}
                    {planEfectivo.id && (
                        <div className="sub-5">
                            <div className="sub-34">
                                <h3 className="sub-35">{t('suscripcion.limitsTitle')}</h3>
                                <p className="sub-36">{t('suscripcion.limitsSubtitle')}</p>
                            </div>
                            <div className="sub-37">
                                <LimitItem icon="fa-users" label={t('suscripcion.limitContactos')} value={fmtUso(uso.contactos, planEfectivo.maxContactos, unlimited)} color={planCfg.color} />
                                <LimitItem icon="fa-mobile-alt" label={t('suscripcion.limitDispEmbudo')} value={fmtUso(uso.dispositivosEmbudo, planEfectivo.maxDispositivos, unlimited)} color={planCfg.color} />
                                <LimitItem icon="fa-bullhorn" label={t('suscripcion.limitDispCampanias')} value={fmtUso(uso.dispositivosCampanias, planEfectivo.maxDispositivosCampanias, unlimited)} color={planCfg.color} />
                                <LimitItem icon="fa-user-friends" label={t('suscripcion.limitMiembros')} value={fmtUso(uso.miembros, planEfectivo.maxMiembrosEquipo, unlimited)} color={planCfg.color} />
                                <FeatureItem icon="fa-robot" label={t('suscripcion.featAgenteIA')} enabled={planEfectivo.agenteIaHabilitado} tIncluded={t('suscripcion.included')} tNot={t('suscripcion.notIncluded')} />
                                <FeatureItem icon="fa-paper-plane" label={t('suscripcion.featCampanias')} enabled={planEfectivo.campaniasHabilitadas} tIncluded={t('suscripcion.included')} tNot={t('suscripcion.notIncluded')} />
                            </div>
                        </div>
                    )}

                    {/* Team Members Card */}
                    {esEquipo && (
                        <div className="sub-5">
                            <div className="sub-38">
                                <div>
                                    <h3 className="sub-35">{t('suscripcion.teamMembers')}</h3>
                                    <p className="sub-36">{t('suscripcion.eachMember')}</p>
                                </div>
                                <span className="sub-39">
                                    {miembros.length} {miembros.length !== 1 ? t('suscripcion.members') : t('suscripcion.member')}
                                </span>
                            </div>
                            <div className="sub-40">
                                {miembros.map(m => {
                                    const mPlan = m.plan?.nombre || 'FREE';
                                    const mCfg = PLAN_ICON[mPlan] || PLAN_ICON.FREE;
                                    const esYo = m.id === perfil?.id;

                                    return (
                                        <div className="sub-41"
                                            key={m.id}
                                            style={{ background: esYo ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                                        >
                                            {m.fotoUrl ? (
                                                <img className="sub-42"
                                                    src={m.fotoUrl}
                                                    alt={m.nombreCompleto}
                                                />
                                            ) : (
                                                <div className="sub-43">
                                                    {(m.nombreCompleto || m.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}

                                            <div className="sub-44">
                                                <div className="sub-45">
                                                    <span className="sub-46">
                                                        {m.nombreCompleto || m.username}
                                                    </span>
                                                    {esYo && (
                                                        <span className="sub-47">{t('suscripcion.you')}</span>
                                                    )}
                                                </div>
                                                <span className="sub-48">
                                                    {(m.rol === 'ADMIN' || m.rol === 'OWNER') ? t('suscripcion.admin') : t('suscripcion.collaborator')}
                                                </span>
                                            </div>

                                            <div className="sub-57" style={{ borderRadius: '20px', background: `${mCfg.color}15`, border: `1px solid ${mCfg.color}30` }}>
                                                <i className={`fas ${mCfg.icon} sub-50`} style={{ color: mCfg.color }} />
                                                <span className="sub-51" style={{ color: mCfg.color }}>
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

function LimitItem({ icon, label, value, color }) {
    return (
        <div className="sub-52">
            <div className="sub-53">
                <i className={`fas ${icon}`} style={{ color }} />
                {label}
            </div>
            <strong className="sub-54">{value}</strong>
        </div>
    );
}

function FeatureItem({ icon, label, enabled, tIncluded, tNot }) {
    const c = enabled ? '#10b981' : '#6b7280';
    return (
        <div className="sub-52">
            <div className="sub-53">
                <i className={`fas ${icon}`} style={{ color: c }} />
                {label}
            </div>
            <strong className="sub-55" style={{ color: c }}>
                <i className={`fas ${enabled ? 'fa-check-circle' : 'fa-times-circle'} sub-56`} />
                {enabled ? tIncluded : tNot}
            </strong>
        </div>
    );
}
