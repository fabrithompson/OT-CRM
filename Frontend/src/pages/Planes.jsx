import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import api from '../utils/api';
import { useLanguage } from '../context/LangContext';
import useDialog from '../hooks/useDialog';
import '../assets/css/pages/Planes.css';


const PLAN_CONFIG = {
    FREE:       { icon: 'fa-seedling', clase: 'free',       badge: null,      ilimitado: false, benIconos: ['fa-user-plus','fa-users','fa-th-list',    'fa-ban'],         benGolden: [false,false,false,false] },
    PRO:        { icon: 'fa-bolt',     clase: 'pro',        badge: 'popular', ilimitado: false, benIconos: ['fa-user-plus','fa-users','fa-paper-plane','fa-check'],       benGolden: [false,false,false,false] },
    BUSINESS:   { icon: 'fa-building', clase: 'business',   badge: null,      ilimitado: false, benIconos: ['fa-user-plus','fa-users','fa-chart-pie',  'fa-check'],       benGolden: [false,false,false,false] },
    ENTERPRISE: { icon: 'fa-gem',      clase: 'enterprise', badge: 'vip',     ilimitado: true,  benIconos: ['fa-infinity', 'fa-robot','fa-paper-plane','fa-check'],       benGolden: [true, true, false,false] },
};


const formatPrecio = (precio) =>
    Number(precio).toLocaleString('es-AR', { minimumFractionDigits: 0 });


export default function Planes() {
    const { t } = useLanguage();
    const { search } = useLocation();
    const queryParams = new URLSearchParams(search);
    const pagoParam = queryParams.get('pago');

    const [planes, setPlanes] = useState([]);
    const [miPlan, setMiPlan] = useState(null);
    const [vencimiento, setVencimiento] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(''); // FIX: show errors visibly

    const [modalPlan, setModalPlan] = useState(null);
    const [procesando, setProcesando] = useState(null);
    const [errorPago, setErrorPago] = useState('');

    const [showFreeModal, setShowFreeModal] = useState(false);
    const [procesandoFree, setProcesandoFree] = useState(false);

    const [showExito, setShowExito] = useState(pagoParam === 'exitoso');
    const [showFallido, setShowFallido] = useState(pagoParam === 'fallido');

    // Promise.allSettled: si mi-plan falla, los planes igual cargan.
    const fetchData = useCallback(async () => {
        setLoadError('');
        setLoading(true);
        try {
            const [planesResult, miPlanResult] = await Promise.allSettled([
                api.get('/planes'),
                api.get('/planes/mi-plan'),
            ]);

            if (planesResult.status === 'fulfilled') {
                setPlanes(planesResult.value.data || []);
            } else {
                console.error('Error cargando planes:', planesResult.reason);
                setLoadError(`No se pudieron cargar los planes: ${planesResult.reason?.response?.data?.error || planesResult.reason?.message || 'Error desconocido'}`);
            }

            if (miPlanResult.status === 'fulfilled') {
                setMiPlan(miPlanResult.value.data.plan);
                setVencimiento(miPlanResult.value.data.vencimiento);
            } else {
                console.warn('No se pudo obtener mi plan:', miPlanResult.reason);
                // Non-fatal: just means we don't know their current plan
            }
        } finally {
            setLoading(false);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (showExito) {
            const t = setTimeout(() => setShowExito(false), 8000);
            return () => clearTimeout(t);
        }
    }, [showExito]);


    const handleSuscribirse = (plan) => {
        setErrorPago('');
        setModalPlan(plan);
    };


    const pagarConMP = async () => {
        if (!modalPlan) return;
        setProcesando('mp');
        setErrorPago('');
        try {
            const res = await api.post(`/mp/crear-suscripcion?planId=${modalPlan.id}`);
            const { initPoint } = res.data;
            if (initPoint) {
                window.location.href = initPoint;
            } else {
                setErrorPago('No se pudo generar el link de MercadoPago.');
            }
        } catch (err) {
            setErrorPago(err.response?.data?.error || 'Error al conectar con MercadoPago.');
        } finally {
            setProcesando(null);
        }
    };


    const pagarConPayPal = async () => {
        if (!modalPlan) return;
        setProcesando('paypal');
        setErrorPago('');
        try {
            // El endpoint pasó a vivir bajo /api/v1/paypal/ (antes era /api/paypal/,
            // fuera de la autenticación por defecto), así que ahora entra por el
            // cliente `api` compartido como cualquier otra llamada autenticada.
            const res = await api.post(`/paypal/crear-suscripcion?planId=${modalPlan.id}`);
            if (res.data.paypalUrl) {
                window.location.href = res.data.paypalUrl;
            } else {
                setErrorPago('No se pudo generar el link de PayPal.');
            }
        } catch (err) {
            setErrorPago(err.response?.data?.error || 'Error de conexión con PayPal. Intentá de nuevo.');
        } finally {
            setProcesando(null);
        }
    };


    const confirmarCambioFree = async () => {
        setProcesandoFree(true);
        try {
            const planFree = planes.find(p => p.nombre === 'FREE');
            if (!planFree) throw new Error('Plan FREE no encontrado');
            await api.post(`/planes/cambiar/${planFree.id}`);
            setShowFreeModal(false);
            await fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setProcesandoFree(false);
        }
    };

    const planActualNombre = miPlan?.nombre || 'FREE';

    if (loading) {
        return (
            <div className="pln-1">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <section className="page-wrapper pln-2">

            <div className="dashboard-content custom-scrollbar pln-3">

                {showExito && (
                    <div style={styles.alertaBase('#10b981', 'rgba(16,185,129,0.12)')}>
                        <i className="fas fa-check-circle pln-4"></i>
                        <div>
                            <strong className="pln-5">{t('planes.paySuccess')}</strong>
                            <span className="pln-6">{t('planes.paySuccessDesc')}</span>
                        </div>
                        <button onClick={() => setShowExito(false)} style={styles.closeBtn}>×</button>
                    </div>
                )}
                {showFallido && (
                    <div style={styles.alertaBase('#ef4444', 'rgba(239,68,68,0.12)')}>
                        <i className="fas fa-times-circle pln-7"></i>
                        <div>
                            <strong className="pln-8">{t('planes.payFailed')}</strong>
                            <span className="pln-6">{t('planes.payFailedDesc')}</span>
                        </div>
                        <button onClick={() => setShowFallido(false)} style={styles.closeBtn}>×</button>
                    </div>
                )}

                {/* FIX: visible error state */}
                {loadError && (
                    <div style={{ ...styles.alertaBase('#ef4444', 'rgba(239,68,68,0.1)'), marginBottom: '1.5rem' }}>
                        <i className="fas fa-exclamation-triangle pln-9"></i>
                        <div className="pln-10">
                            <strong className="pln-8">{t('planes.errLoad')}</strong>
                            <p className="pln-11">{loadError}</p>
                        </div>
                        <button className="pln-12" onClick={fetchData}>
                            <i className="fas fa-redo"></i> {t('errors.retry')}
                        </button>
                    </div>
                )}

                <div className="pln-13">
                    <h1 className="pln-14">
                        {t('planes.title')}
                    </h1>
                    <p className="pln-15">
                        {t('planes.subtitle')}
                    </p>
                    {vencimiento && vencimiento !== 'Sin vencimiento' && (
                        <div className="pln-16">
                            <i className="fas fa-calendar-alt"></i>
                            {t('planes.validUntil')} {new Date(vencimiento).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    )}
                </div>


                {planes.length === 0 && !loadError ? (
                    <div className="pln-17">
                        <i className="fas fa-box-open pln-18"></i>
                        <p className="pln-19">{t('planes.noPlanAvail')}</p>
                        <button className="pln-20" onClick={fetchData}>
                            <i className="fas fa-sync-alt"></i> {t('planes.reload')}
                        </button>
                    </div>
                ) : (
                    <div style={styles.grid}>
                        {planes.map(plan => {
                            const cfg = PLAN_CONFIG[plan.nombre] || PLAN_CONFIG.FREE;
                            const esActual = planActualNombre === plan.nombre;
                            const esGratis = plan.precioMensual === 0 || plan.precioMensual === '0';

                            return (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    cfg={cfg}
                                    esActual={esActual}
                                    esGratis={esGratis}
                                    onSuscribirse={() => handleSuscribirse(plan)}
                                    onCambiarFree={() => setShowFreeModal(true)}
                                />
                            );
                        })}
                    </div>
                )}


                <div className="pln-21">
                    <span>
                        <i className="fas fa-shield-alt pln-22"></i>
                        {t('planes.secureFooter')}
                    </span>
                    <Link to="/mi-suscripcion" style={{ color: '#10b981', fontWeight: 700, textDecoration: 'underline' }}>
                        {t('planes.mySub')}
                    </Link>
                </div>
            </div>


            {modalPlan && (
                <ModalCheckout
                    plan={modalPlan}
                    procesando={procesando}
                    errorPago={errorPago}
                    onMP={pagarConMP}
                    onPayPal={pagarConPayPal}
                    onClose={() => { setModalPlan(null); setErrorPago(''); }}
                />
            )}


            {showFreeModal && (
                <ModalConfirmarFree
                    procesando={procesandoFree}
                    onConfirmar={confirmarCambioFree}
                    onClose={() => setShowFreeModal(false)}
                />
            )}
        </section>
    );
}


function PlanCard({ plan, cfg, esActual, esGratis, onSuscribirse, onCambiarFree }) {
    const { t } = useLanguage();
    const [hovered, setHovered] = useState(false);
    const colores = {
        free:       { accent: '#6b7280', glow: 'rgba(107,114,128,0.18)', glowStrong: 'rgba(107,114,128,0.35)' },
        pro:        { btn: '#2563eb', accent: '#3b82f6', glow: 'rgba(59,130,246,0.18)',  glowStrong: 'rgba(59,130,246,0.4)'  },
        business:   { btn: '#7c3aed', accent: '#8b5cf6', glow: 'rgba(139,92,246,0.18)', glowStrong: 'rgba(139,92,246,0.4)'  },
        enterprise: { btnText: '#1a1205', accent: '#f59e0b', glow: 'rgba(245,158,11,0.18)', glowStrong: 'rgba(245,158,11,0.4)'  },
    };
    const col = colores[cfg.clase] || colores.free;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                ...styles.planCard,
                border: esActual
                    ? `2px solid ${col.accent}`
                    : hovered
                        ? `1px solid ${col.accent}60`
                        : '1px solid rgba(255,255,255,0.08)',
                boxShadow: hovered
                    ? `0 16px 40px rgba(0,0,0,0.5), 0 0 30px ${col.glowStrong}`
                    : esActual
                        ? `0 0 30px ${col.glow}`
                        : '0 4px 12px rgba(0,0,0,0.2)',
                transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
                position: 'relative',
                background: hovered
                    ? `linear-gradient(160deg, var(--bg-card) 60%, ${col.glow})`
                    : 'var(--bg-card)',
            }}>
            {esActual && (
                <div style={styles.badgeActual(col.accent, col.btnText)}>{t('planes.currentPlan')}</div>
            )}
            {!esActual && cfg.badge === 'popular' && (
                <div style={styles.badgePopular}>{t('planes.mostPopular')}</div>
            )}
            {!esActual && cfg.badge === 'vip' && (
                <div style={styles.badgeVip}>
                    <i className="fas fa-crown"></i> VIP
                </div>
            )}

            <div style={{ ...styles.planIcon, background: col.glow, color: col.accent }}>
                <i className={`fas ${cfg.icon}`}></i>
            </div>

            <div style={{ ...styles.planNombre, color: col.accent }}>
                {plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase()}
            </div>

            <div style={styles.tagline}>{t(`planes.${cfg.clase}.tagline`)}</div>

            <div style={styles.precioContainer}>
                {esGratis ? (
                    <div className="pln-23">
                        <span style={styles.precioMoneda}>$</span>
                        <span style={{ ...styles.precioMonto, color: col.accent }}>0</span>
                        <span style={styles.precioPeriodo}>{t('planes.perMonthShort')}</span>
                    </div>
                ) : (
                    <div className="pln-24">
                        <span style={styles.precioMoneda}>$</span>
                        <span style={{ ...styles.precioMonto, color: col.accent }}>
                            {formatPrecio(plan.precioMensual)}
                        </span>
                        <span style={styles.precioPeriodo}>{t('checkout.perMonthArs')}</span>
                    </div>
                )}
            </div>

            <div style={{
                ...styles.dispositivosBadge,
                background: `${col.glow}`,
                border: `1px solid ${col.accent}30`,
                color: cfg.ilimitado ? '#f59e0b' : col.accent,
            }}>
                <i className={`fas ${cfg.ilimitado ? 'fa-infinity' : 'fa-mobile-alt'}`}></i>
                {t(`planes.${cfg.clase}.lines`)}
            </div>

            <ul style={styles.beneficiosList}>
                {['b1','b2','b3','b4'].map((key, idx) => {
                    const isFirst = idx === 0;
                    const isGolden = cfg.benGolden[idx];
                    return (
                        <li key={key} style={{
                            ...styles.beneficioItem,
                            color: isFirst ? (isGolden ? '#f59e0b' : '#fff') : '#9ca3af',
                            fontWeight: isFirst ? 600 : 400,
                        }}>
                            <i className={`fas ${cfg.benIconos[idx]} pln-25`} style={{ color: isGolden ? '#f59e0b' : col.accent }}></i>
                            {t(`planes.${cfg.clase}.${key}`)}
                        </li>
                    );
                })}
            </ul>

            {esActual ? (
                <button disabled style={styles.btnActual}>
                    <i className="fas fa-check-circle"></i> {t('planes.currentPlanBtn')}
                </button>
            ) : esGratis ? (
                <button onClick={onCambiarFree} style={{ ...styles.btnPlan, background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', color: '#d1d5db' }}>
                    {t('planes.useFree')}
                </button>
            ) : (
                <button onClick={onSuscribirse} style={{ ...styles.btnPlan, background: col.btn || col.accent, color: col.btnText || '#fff', border: 'none' }}>
                    {t('planes.subscribeBtn')} {plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase()}
                </button>
            )}
        </div>
    );
}


function ModalCheckout({ plan, procesando, errorPago, onMP, onPayPal, onClose }) {
    const dialog = useDialog(true, onClose, { canClose: !procesando });
    const { t } = useLanguage();
    const [selected, setSelected] = useState(null);
    const planLabel = plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase();

    const metodos = [
        {
            id: 'mp',
            nombre: 'Mercado Pago',
            desc: 'Tarjeta, transferencia o saldo MP',
            icon: 'fa-wallet',
            iconBg: '#009ee3',
            onPay: onMP,
        },
        {
            id: 'paypal',
            nombre: 'PayPal',
            desc: 'Pago en USD · Internacional',
            icon: 'fab fa-paypal',
            iconBg: '#003087',
            onPay: onPayPal,
        },
    ];

    const handleConfirm = () => {
        const m = metodos.find(m => m.id === selected);
        if (m) m.onPay();
    };

    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...styles.modal, maxWidth: '520px', padding: 0, overflow: 'hidden' }} {...dialog}>

                {/* Header with plan summary */}
                <div className="pln-26">
                    <div className="pln-27">
                        <div>
                            <h3 className="pln-28">
                                {t('planes.checkoutTitle')}
                            </h3>
                            <p className="pln-29">
                                {t('planes.checkoutSubtitle')}
                            </p>
                        </div>
                        <button className="pln-30"
                            onClick={onClose}
                        >
                            <i className="fas fa-times" />
                        </button>
                    </div>

                    {/* Order summary */}
                    <div className="pln-31">
                        <div className="pln-32">
                            <div className="pln-33">
                                <div className="pln-34">
                                    <i className={`fas ${(PLAN_CONFIG[plan.nombre] || PLAN_CONFIG.FREE).icon} pln-35`} />
                                </div>
                                <div>
                                    <div className="pln-36">Plan {planLabel}</div>
                                    <div className="pln-37">{t('planes.subscriptionLabel')}</div>
                                </div>
                            </div>
                            <div className="pln-38">
                                <div className="pln-39">${formatPrecio(plan.precioMensual)}</div>
                                <div className="pln-40">{t('checkout.perMonthArs')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment methods */}
                <div className="pln-41">
                    <div className="pln-42">
                        {t('planes.payMethod')}
                    </div>

                    {errorPago && (
                        <div className="pln-43">
                            <i className="fas fa-exclamation-circle pln-44" />
                            <span>{errorPago}</span>
                        </div>
                    )}

                    <div className="pln-45">
                        {metodos.map(m => {
                            const isSelected = selected === m.id;
                            const isLoading = procesando === m.id;
                            return (
                                <button className="pln-63"
                                    key={m.id}
                                    type="button"
                                    onClick={() => !procesando && setSelected(m.id)}
                                    disabled={!!procesando && !isLoading}
                                    style={{ borderRadius: '14px', background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)', border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)', cursor: procesando ? 'wait' : 'pointer', opacity: (!!procesando && !isLoading) ? 0.5 : 1 }}
                                >
                                    {/* Radio circle */}
                                    <div className="pln-64" style={{ borderRadius: '50%', border: isSelected ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.2)' }}>
                                        {isSelected && <div className="pln-48" />}
                                    </div>

                                    {/* Icon */}
                                    <div className="pln-49" style={{ background: m.iconBg }}>
                                        {isLoading
                                            ? <i className="fas fa-spinner fa-spin" />
                                            : <i className={m.icon.startsWith('fab') ? m.icon : `fas ${m.icon}`} />
                                        }
                                    </div>

                                    {/* Text */}
                                    <div className="pln-50">
                                        <div className="pln-51">{m.nombre}</div>
                                        <div className="pln-52">{m.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Confirm button */}
                    <button className="pln-53"
                        onClick={handleConfirm}
                        disabled={!selected || !!procesando}
                        style={{ background: selected ? '#3b82f6' : 'rgba(255,255,255,0.06)', color: selected ? '#fff' : 'var(--color-text-3)', cursor: (!selected || !!procesando) ? 'not-allowed' : 'pointer' }}
                    >
                        {procesando ? (
                            <>
                                <i className="fas fa-spinner fa-spin" />
                                {t('planes.processing')}
                            </>
                        ) : (
                            <>
                                <i className="fas fa-lock pln-54" />
                                {selected ? t('planes.continuePayment') : t('planes.selectPayMethod')}
                            </>
                        )}
                    </button>

                    {/* Footer */}
                    <div className="pln-55">
                        <i className="fas fa-shield-alt pln-56" />
                        {t('planes.securePayment')}
                    </div>
                </div>
            </div>
        </div>
    );
}


function ModalConfirmarFree({ procesando, onConfirmar, onClose }) {
    const { t } = useLanguage();
    const dialog = useDialog(true, onClose, { canClose: !procesando });
    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...styles.modal, maxWidth: '380px', textAlign: 'center' }} {...dialog}>
                <div className="pln-57">
                    <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h5 className="pln-58">
                    {t('planes.backToFreeTitle')}
                </h5>
                <p className="pln-59">
                    {t('planes.backToFreeDesc')}
                </p>
                <div className="pln-60">
                    <button className="pln-61" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button className="pln-62" onClick={onConfirmar} disabled={procesando} style={{ cursor: procesando ? 'not-allowed' : 'pointer' }}>
                        {procesando ? <i className="fas fa-spinner fa-spin"></i> : t('planes.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}


const styles = {
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
    },
    planCard: {
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '30px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
        willChange: 'transform',
        cursor: 'default',
    },
    planIcon: { width: 56, height: 56, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' },
    planNombre: { fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' },
    tagline: { color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.4 },
    precioContainer: { margin: '4px 0' },
    precioMoneda: { color: '#9ca3af', fontSize: '1.1rem', fontWeight: 600 },
    precioMonto: { fontSize: '2.4rem', fontWeight: 800, lineHeight: 1 },
    precioPeriodo: { color: 'var(--color-text-3)', fontSize: '0.85rem' },
    dispositivosBadge: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700 },
    beneficiosList: { listStyle: 'none', padding: 0, margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
    beneficioItem: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '0.85rem' },
    btnActual: { padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af', borderRadius: '10px', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: 'auto' },
    btnPlan: { padding: '13px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', transition: 'opacity 0.2s, filter 0.2s', marginTop: 'auto', textAlign: 'center', letterSpacing: '0.01em' },
    badgeActual: (color, text = '#fff') => ({ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: color, color: text, fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' }),
    badgePopular: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' },
    badgeVip: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#1a1205', fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' },
    overlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    modal: { background: 'var(--bg-card)', borderRadius: '16px', width: '100%', padding: '28px', border: '1px solid var(--border-glass)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' },
    closeBtn: { background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.3rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', flexShrink: 0 },
    alertaBase: (borderColor, bg) => ({ background: bg, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '700px', margin: '0 auto 1.5rem' }),
    btnPago: (accent, bg) => ({ width: '100%', padding: '14px 16px', background: bg, border: `1px solid ${accent}40`, borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', transition: 'all 0.2s', textAlign: 'left', justifyContent: 'flex-start' }),
};