import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import api from '../utils/api';


const PLAN_CONFIG = {
    FREE: {
        icon: 'fa-seedling',
        clase: 'free',
        tagline: 'Empezá sin costo, ideal para pruebas.',
        badge: null,
        dispositivos: '1 línea conectada',
        beneficios: [
            { texto: 'Hasta 25 contactos nuevos', destacado: true, icono: 'fa-user-plus' },
            { texto: 'Contactos guardados interactúan sin límite', icono: 'fa-users' },
            { texto: 'CRM básico', icono: 'fa-check' },
            { texto: 'Dashboard con métricas', icono: 'fa-check' },
        ],
    },
    PRO: {
        icon: 'fa-bolt',
        clase: 'pro',
        tagline: 'Para equipos de ventas en crecimiento.',
        badge: 'popular',
        dispositivos: '5 líneas conectadas',
        beneficios: [
            { texto: 'Hasta 75 contactos nuevos', destacado: true, icono: 'fa-user-plus' },
            { texto: 'Tu equipo hereda tus beneficios', icono: 'fa-users' },
            { texto: 'Todo lo del plan Free', icono: 'fa-check' },
            { texto: 'Múltiples operadores simultáneos', icono: 'fa-check' },
        ],
    },
    BUSINESS: {
        icon: 'fa-building',
        clase: 'business',
        tagline: 'Volumen alto y agencias consolidadas.',
        badge: null,
        dispositivos: '10 líneas conectadas',
        beneficios: [
            { texto: 'Hasta 250 contactos nuevos', destacado: true, icono: 'fa-user-plus' },
            { texto: 'Espacio de trabajo ampliado', icono: 'fa-users' },
            { texto: 'Todo lo del plan Pro', icono: 'fa-check' },
            { texto: 'Reportes avanzados', icono: 'fa-check' },
        ],
    },
    ENTERPRISE: {
        icon: 'fa-gem',
        clase: 'enterprise',
        tagline: 'Libertad absoluta sin ningún límite.',
        badge: 'vip',
        dispositivos: 'Conexiones Ilimitadas',
        ilimitado: true,
        beneficios: [
            { texto: 'Contactos ilimitados', destacado: true, icono: 'fa-infinity', golden: true },
            { texto: 'Sin tope de ingreso al embudo', icono: 'fa-check' },
            { texto: 'Todo lo del plan Business', icono: 'fa-check' },
            { texto: 'Soporte dedicado 24/7', icono: 'fa-check' },
        ],
    },
};


const formatPrecio = (precio) =>
    Number(precio).toLocaleString('es-AR', { minimumFractionDigits: 0 });


export default function Planes() {
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

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (showExito) {
            const t = setTimeout(() => setShowExito(false), 8000);
            return () => clearTimeout(t);
        }
    }, [showExito]);

    // FIX: use Promise.allSettled so that if mi-plan fails, planes still loads
    const fetchData = async () => {
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
    };


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
            // PayPal endpoint is /api/paypal/ — not under /api/v1/
            const baseRoot = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1\/?$/, '');
            const token = localStorage.getItem('token');
            const res = await fetch(`${baseRoot}/api/paypal/crear-suscripcion?planId=${modalPlan.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorPago(data.error || 'Error al conectar con PayPal.');
                return;
            }
            if (data.paypalUrl) {
                window.location.href = data.paypalUrl;
            } else {
                setErrorPago('No se pudo generar el link de PayPal.');
            }
        } catch (err) {
            setErrorPago('Error de conexión con PayPal. Intentá de nuevo.');
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <section className="page-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            <div className="dashboard-content custom-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '2rem 2rem 3rem' }}>

                {showExito && (
                    <div style={styles.alertaBase('#10b981', 'rgba(16,185,129,0.12)')}>
                        <i className="fas fa-check-circle" style={{ fontSize: '1.3rem', color: '#10b981' }}></i>
                        <div>
                            <strong style={{ color: '#10b981' }}>¡Pago exitoso!</strong>
                            <span style={{ color: '#d1d5db', marginLeft: 8 }}>
                                Tu plan ha sido activado. El sistema puede tardar unos segundos en actualizarse.
                            </span>
                        </div>
                        <button onClick={() => setShowExito(false)} style={styles.closeBtn}>×</button>
                    </div>
                )}
                {showFallido && (
                    <div style={styles.alertaBase('#ef4444', 'rgba(239,68,68,0.12)')}>
                        <i className="fas fa-times-circle" style={{ fontSize: '1.3rem', color: '#ef4444' }}></i>
                        <div>
                            <strong style={{ color: '#ef4444' }}>Pago fallido.</strong>
                            <span style={{ color: '#d1d5db', marginLeft: 8 }}>
                                No se procesó ningún cargo. Podés intentarlo nuevamente.
                            </span>
                        </div>
                        <button onClick={() => setShowFallido(false)} style={styles.closeBtn}>×</button>
                    </div>
                )}

                {/* FIX: visible error state */}
                {loadError && (
                    <div style={{ ...styles.alertaBase('#ef4444', 'rgba(239,68,68,0.1)'), marginBottom: '1.5rem' }}>
                        <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: '1.3rem' }}></i>
                        <div style={{ flex: 1 }}>
                            <strong style={{ color: '#ef4444' }}>Error al cargar los planes</strong>
                            <p style={{ color: '#fca5a5', margin: '4px 0 0', fontSize: '0.85rem' }}>{loadError}</p>
                        </div>
                        <button onClick={fetchData} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                            <i className="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
                        Elegí tu Plan
                    </h1>
                    <p style={{ color: '#9ca3af', fontSize: '1rem' }}>
                        Escalá tu CRM y tu equipo según las necesidades de tu agencia
                    </p>
                    {vencimiento && vencimiento !== 'Sin vencimiento' && (
                        <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '6px 14px', color: '#f59e0b', fontSize: '0.85rem' }}>
                            <i className="fas fa-calendar-alt"></i>
                            Plan vigente hasta el {new Date(vencimiento).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    )}
                </div>


                {planes.length === 0 && !loadError ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                        <i className="fas fa-box-open" style={{ fontSize: '3rem', marginBottom: 16, opacity: 0.4 }}></i>
                        <p style={{ fontSize: '1rem' }}>No hay planes disponibles en este momento.</p>
                        <button onClick={fetchData} style={{ marginTop: 12, background: '#10b981', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                            <i className="fas fa-sync-alt"></i> Recargar
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


                <div style={{ textAlign: 'center', marginTop: '2rem', color: '#6b7280', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span>
                        <i className="fas fa-shield-alt" style={{ color: '#10b981', marginRight: '6px' }}></i>
                        Pagos procesados de forma segura con Mercado Pago &amp; PayPal · Podés cancelar en cualquier momento
                    </span>
                    <Link to="/mi-suscripcion" style={{ color: '#10b981', fontWeight: 700, textDecoration: 'underline' }}>
                        Mi suscripción
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
    const [hovered, setHovered] = useState(false);
    const colores = {
        free:       { accent: '#6b7280', glow: 'rgba(107,114,128,0.18)', glowStrong: 'rgba(107,114,128,0.35)' },
        pro:        { accent: '#3b82f6', glow: 'rgba(59,130,246,0.18)',  glowStrong: 'rgba(59,130,246,0.4)'  },
        business:   { accent: '#8b5cf6', glow: 'rgba(139,92,246,0.18)', glowStrong: 'rgba(139,92,246,0.4)'  },
        enterprise: { accent: '#f59e0b', glow: 'rgba(245,158,11,0.18)', glowStrong: 'rgba(245,158,11,0.4)'  },
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
                <div style={styles.badgeActual(col.accent)}>Tu plan actual</div>
            )}
            {!esActual && cfg.badge === 'popular' && (
                <div style={styles.badgePopular}>Más popular</div>
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

            <div style={styles.tagline}>{cfg.tagline}</div>

            <div style={styles.precioContainer}>
                {esGratis ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={styles.precioMoneda}>$</span>
                        <span style={{ ...styles.precioMonto, color: col.accent }}>0</span>
                        <span style={styles.precioPeriodo}>/mes</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                        <span style={styles.precioMoneda}>$</span>
                        <span style={{ ...styles.precioMonto, color: col.accent }}>
                            {formatPrecio(plan.precioMensual)}
                        </span>
                        <span style={styles.precioPeriodo}>ARS/mes</span>
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
                {cfg.dispositivos}
            </div>

            <ul style={styles.beneficiosList}>
                {cfg.beneficios.map((b, idx) => (
                    <li key={idx} style={{
                        ...styles.beneficioItem,
                        color: b.destacado ? (b.golden ? '#f59e0b' : '#fff') : '#9ca3af',
                        fontWeight: b.destacado ? 600 : 400,
                    }}>
                        <i className={`fas ${b.icono}`} style={{ color: b.golden ? '#f59e0b' : col.accent, fontSize: '0.8rem', flexShrink: 0 }}></i>
                        {b.texto}
                    </li>
                ))}
            </ul>

            {esActual ? (
                <button disabled style={styles.btnActual}>
                    <i className="fas fa-check-circle"></i> Plan actual
                </button>
            ) : esGratis ? (
                <button onClick={onCambiarFree} style={{ ...styles.btnPlan, background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', color: '#d1d5db' }}>
                    Usar plan gratis
                </button>
            ) : (
                <button onClick={onSuscribirse} style={{ ...styles.btnPlan, background: col.accent, color: '#fff', border: 'none' }}>
                    Suscribirme al Plan {plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase()}
                </button>
            )}
        </div>
    );
}


function ModalCheckout({ plan, procesando, errorPago, onMP, onPayPal, onClose }) {
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
            <div style={{ ...styles.modal, maxWidth: '520px', padding: 0, overflow: 'hidden' }}>

                {/* Header with plan summary */}
                <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ color: '#fff', margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
                                Completar suscripción
                            </h3>
                            <p style={{ color: '#9ca3af', margin: '6px 0 0', fontSize: '0.88rem' }}>
                                Elegí cómo querés pagar
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}
                        >
                            <i className="fas fa-times" />
                        </button>
                    </div>

                    {/* Order summary */}
                    <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className={`fas ${(PLAN_CONFIG[plan.nombre] || PLAN_CONFIG.FREE).icon}`} style={{ color: '#3b82f6', fontSize: '1rem' }} />
                                </div>
                                <div>
                                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Plan {planLabel}</div>
                                    <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Suscripción mensual · Cancelable</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem' }}>${formatPrecio(plan.precioMensual)}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>ARS/mes</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment methods */}
                <div style={{ padding: '20px 32px 24px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                        Método de pago
                    </div>

                    {errorPago && (
                        <div style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 10,
                            padding: '12px 16px',
                            color: '#fca5a5',
                            fontSize: '0.85rem',
                            marginBottom: 16,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            lineHeight: 1.4,
                        }}>
                            <i className="fas fa-exclamation-circle" style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
                            <span>{errorPago}</span>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {metodos.map(m => {
                            const isSelected = selected === m.id;
                            const isLoading = procesando === m.id;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => !procesando && setSelected(m.id)}
                                    disabled={!!procesando && !isLoading}
                                    style={{
                                        width: '100%',
                                        padding: '16px 18px',
                                        background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                                        border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 14,
                                        color: '#fff',
                                        cursor: procesando ? 'wait' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        transition: 'all 0.15s ease',
                                        opacity: (!!procesando && !isLoading) ? 0.5 : 1,
                                    }}
                                >
                                    {/* Radio circle */}
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        border: isSelected ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.2)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        transition: 'border-color 0.15s',
                                    }}>
                                        {isSelected && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />}
                                    </div>

                                    {/* Icon */}
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 10,
                                        background: m.iconBg,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.15rem', color: '#fff', flexShrink: 0,
                                    }}>
                                        {isLoading
                                            ? <i className="fas fa-spinner fa-spin" />
                                            : <i className={m.icon.startsWith('fab') ? m.icon : `fas ${m.icon}`} />
                                        }
                                    </div>

                                    {/* Text */}
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.nombre}</div>
                                        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 2 }}>{m.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Confirm button */}
                    <button
                        onClick={handleConfirm}
                        disabled={!selected || !!procesando}
                        style={{
                            width: '100%',
                            marginTop: 20,
                            padding: '15px',
                            background: selected ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: 12,
                            color: selected ? '#fff' : '#6b7280',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            cursor: (!selected || !!procesando) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                        }}
                    >
                        {procesando ? (
                            <>
                                <i className="fas fa-spinner fa-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-lock" style={{ fontSize: '0.8rem' }} />
                                {selected ? 'Continuar con el pago' : 'Seleccioná un método de pago'}
                            </>
                        )}
                    </button>

                    {/* Footer */}
                    <div style={{ textAlign: 'center', marginTop: 16, color: '#4b5563', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <i className="fas fa-shield-alt" style={{ fontSize: '0.7rem' }} />
                        Pago seguro y encriptado · Sin almacenamiento de datos sensibles
                    </div>
                </div>
            </div>
        </div>
    );
}


function ModalConfirmarFree({ procesando, onConfirmar, onClose }) {
    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...styles.modal, maxWidth: '380px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.8rem' }}>
                    <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h5 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                    ¿Volver al plan gratuito?
                </h5>
                <p style={{ color: '#9ca3af', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    Se limitarán tus funciones y los dispositivos extra se desconectarán automáticamente.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        Cancelar
                    </button>
                    <button onClick={onConfirmar} disabled={procesando} style={{ flex: 1, padding: '12px', background: '#f59e0b', border: 'none', color: '#000', borderRadius: '8px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {procesando ? <i className="fas fa-spinner fa-spin"></i> : 'Confirmar'}
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
    precioPeriodo: { color: '#6b7280', fontSize: '0.85rem' },
    dispositivosBadge: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700 },
    beneficiosList: { listStyle: 'none', padding: 0, margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
    beneficioItem: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '0.85rem' },
    btnActual: { padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af', borderRadius: '10px', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: 'auto' },
    btnPlan: { padding: '13px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', transition: 'opacity 0.2s, filter 0.2s', marginTop: 'auto', textAlign: 'center', letterSpacing: '0.01em' },
    badgeActual: (color) => ({ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: color, color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' }),
    badgePopular: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', textTransform: 'uppercase' },
    badgeVip: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' },
    overlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    modal: { background: 'var(--bg-card)', borderRadius: '16px', width: '100%', padding: '28px', border: '1px solid var(--border-glass)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' },
    closeBtn: { background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.3rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', flexShrink: 0 },
    alertaBase: (borderColor, bg) => ({ background: bg, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '700px', margin: '0 auto 1.5rem' }),
    btnPago: (accent, bg) => ({ width: '100%', padding: '14px 16px', background: bg, border: `1px solid ${accent}40`, borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', transition: 'all 0.2s', textAlign: 'left', justifyContent: 'flex-start' }),
};