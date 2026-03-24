import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const METODOS = [
    {
        id: 'mp',
        nombre: 'Mercado Pago',
        desc: 'Tarjetas, saldo y cuotas',
        activo: true,
        logoStyle: { background: 'rgba(0,158,227,0.15)', borderColor: 'rgba(0,158,227,0.3)', color: '#009ee3' },
        logo: <i className="fas fa-wallet" />,
        extra: (
            <div style={{ display: 'flex', gap: 6, fontSize: '1.05rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                <i className="fab fa-cc-visa" /><i className="fab fa-cc-mastercard" />
            </div>
        ),
        btnGradient: 'linear-gradient(135deg, #10b981, #059669)',
        btnShadow: '0 4px 20px rgba(16,185,129,0.35)',
    },
    {
        id: 'paypal',
        nombre: 'PayPal',
        desc: 'Pago internacional seguro',
        activo: true,
        logoStyle: { background: 'rgba(0,48,135,0.2)', borderColor: 'rgba(0,112,186,0.35)', color: '#009cde' },
        logo: <i className="fab fa-paypal" />,
        extra: null,
        btnGradient: 'linear-gradient(135deg, #003087, #009cde)',
        btnShadow: '0 4px 20px rgba(0,48,135,0.4)',
    },
    {
        id: 'cards',
        nombre: 'Tarjetas de crédito o débito',
        desc: 'Visa, Mastercard o Maestro',
        activo: false,
        logoStyle: { background: 'rgba(255,255,255,0.04)' },
        logo: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1 }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 900, color: '#fff', letterSpacing: 1 }}>VISA</span>
                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#eb001b' }}>MC</span>
            </div>
        ),
    },
    {
        id: 'rapipago',
        nombre: 'Rapipago',
        desc: 'Pago en efectivo en sucursales',
        activo: false,
        logoStyle: { background: 'rgba(255,100,0,0.15)', borderColor: 'rgba(255,100,0,0.3)', color: '#ff6400' },
        logo: <i className="fas fa-money-bill-wave" />,
    },
    {
        id: 'gpay',
        nombre: 'Google Pay',
        desc: 'Pay with Google Pay',
        activo: false,
        logoStyle: { background: 'rgba(255,255,255,0.04)' },
        logo: (
            <svg width="38" height="14" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
                <text fontFamily="Arial" fontWeight="700" fontSize="15" y="15">
                    <tspan fill="#4285F4">G</tspan><tspan fill="#EA4335">o</tspan><tspan fill="#FBBC05">o</tspan>
                    <tspan fill="#4285F4">g</tspan><tspan fill="#34A853">l</tspan><tspan fill="#EA4335">e</tspan>
                </text>
            </svg>
        ),
    },
    {
        id: 'apple',
        nombre: 'Apple Pay',
        desc: 'Pay with Apple Pay',
        activo: false,
        logoStyle: { background: 'rgba(255,255,255,0.04)', color: '#fff' },
        logo: <i className="fab fa-apple" style={{ fontSize: '1.25rem' }} />,
    },
    {
        id: 'crypto',
        nombre: 'Criptomonedas',
        desc: 'Pagá con tu criptomoneda favorita',
        activo: false,
        logoStyle: { background: 'rgba(247,147,26,0.15)', borderColor: 'rgba(247,147,26,0.3)', color: '#f7931a' },
        logo: <i className="fab fa-bitcoin" />,
    },
];

const formatPrecio = (v) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0 });

export default function Checkout() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const planId = searchParams.get('planId');

    const [plan, setPlan] = useState(null);
    const [email, setEmail] = useState('');
    const [metodo, setMetodo] = useState('mp');
    const [cargando, setCargando] = useState(true);
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!planId) { navigate('/planes'); return; }
        Promise.all([
            api.get('/planes'),
            api.get('/perfil'),
        ]).then(([planesRes, perfilRes]) => {
            const found = planesRes.data.find(p => String(p.id) === String(planId));
            if (!found || found.precioMensual === 0) { navigate('/planes'); return; }
            setPlan(found);
            setEmail(perfilRes.data.email || '');
        }).catch(() => navigate('/planes'))
          .finally(() => setCargando(false));
    }, [planId]);

    const metodoActivo = METODOS.find(m => m.id === metodo);

    const handlePagar = async () => {
        if (!plan) return;
        setProcesando(true);
        setError('');
        try {
            const endpoint = metodo === 'mp'
                ? `/mp/crear-suscripcion?planId=${plan.id}&payerEmail=${encodeURIComponent(email)}`
                : `/paypal/crear-suscripcion?planId=${plan.id}`;
            const res = await api.post(endpoint);
            const url = res.data.initPoint || res.data.paypalUrl;
            if (url) {
                window.location.href = url;
            } else {
                setError(res.data.error || 'No se pudo procesar el pago.');
                setProcesando(false);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error al conectar con la pasarela.');
            setProcesando(false);
        }
    };

    if (cargando) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    return (
        <section className="page-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="dashboard-content custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '30px 20px' }}>

                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    <button onClick={() => navigate('/planes')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                        <i className="fas fa-arrow-left" /> Volver a Planes
                    </button>

                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                        <div style={{ flex: 1, minWidth: 280 }}>
                            <span style={S.sectionLabel}>Elegí tu método de pago</span>

                            <div style={S.list}>
                                {METODOS.map(m => {
                                    const selected = metodo === m.id && m.activo;
                                    return (
                                        <div
                                            key={m.id}
                                            onClick={() => m.activo && setMetodo(m.id)}
                                            style={{
                                                ...S.row,
                                                background: selected ? 'rgba(16,185,129,0.07)' : 'transparent',
                                                cursor: m.activo ? 'pointer' : 'default',
                                                opacity: m.activo ? 1 : 0.48,
                                            }}
                                        >
                                            <div style={{ ...S.radio, borderColor: selected ? '#10b981' : 'rgba(255,255,255,0.2)', background: selected ? 'rgba(16,185,129,0.15)' : 'transparent' }}>
                                                {selected && <div style={S.radioDot} />}
                                            </div>

                                            <div style={{ ...S.logo, ...m.logoStyle }}>
                                                {m.logo}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={S.nombre}>{m.nombre}</span>
                                                <span style={S.desc}>{m.desc}</span>
                                            </div>

                                            {m.activo && m.extra}
                                            {!m.activo && <span style={S.badge}>Próximamente</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {metodo === 'mp' && (
                                <div style={S.aviso}>
                                    <i className="fas fa-info-circle" style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ flex: 1 }}>
                                        <p style={{ color: '#93c5fd', fontSize: '0.82rem', margin: '0 0 8px 0', lineHeight: 1.45 }}>
                                            Email de tu cuenta de Mercado Pago:
                                        </p>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="tu@email.com"
                                            style={{
                                                width: '100%',
                                                background: 'rgba(255,255,255,0.07)',
                                                border: '1px solid rgba(59,130,246,0.35)',
                                                borderRadius: 8,
                                                padding: '7px 10px',
                                                color: '#fff',
                                                fontSize: '0.85rem',
                                                outline: 'none',
                                                boxSizing: 'border-box',
                                            }}
                                        />
                                        <p style={{ color: '#6b8fbd', fontSize: '0.75rem', margin: '5px 0 0 0' }}>
                                            Modificalo si es distinto al email del CRM.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ width: 290, flexShrink: 0, position: 'sticky', top: 20 }}>
                            <div style={S.summary}>
                                <div style={S.summaryHead}>
                                    <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, color: '#10b981', marginBottom: 6 }}>Plan Seleccionado</span>
                                    <span style={{ display: 'block', fontSize: '1.55rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                                        {plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase()}
                                    </span>
                                    <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                                        $ {formatPrecio(plan.precioMensual)} <span style={{ fontSize: '0.68rem', opacity: 0.55 }}>ARS/mes</span>
                                    </span>
                                </div>

                                <div style={{ padding: '16px 20px' }}>
                                    {[
                                        { label: 'Subtotal', valor: `$ ${formatPrecio(plan.precioMensual)}` },
                                        { label: 'Descuento', valor: '— $ 0', color: '#10b981' },
                                        { label: 'Renovación', valor: 'Mensual' },
                                    ].map(r => (
                                        <div key={r.label} style={S.summaryRow}>
                                            <span style={{ color: '#94a3b8' }}>{r.label}</span>
                                            <span style={{ color: r.color || '#e2e8f0', fontWeight: 600 }}>{r.valor}</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>Total hoy</span>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                                        $ {formatPrecio(plan.precioMensual)} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>ARS</span>
                                    </span>
                                </div>
                            </div>

                            {error && (
                                <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <i className="fas fa-exclamation-triangle" />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handlePagar}
                                disabled={procesando}
                                style={{
                                    width: '100%',
                                    padding: 15,
                                    fontWeight: 700,
                                    fontSize: '0.95rem',
                                    borderRadius: 12,
                                    border: 'none',
                                    cursor: procesando ? 'not-allowed' : 'pointer',
                                    marginTop: 14,
                                    background: procesando ? 'rgba(255,255,255,0.1)' : metodoActivo?.btnGradient,
                                    color: '#fff',
                                    boxShadow: procesando ? 'none' : metodoActivo?.btnShadow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    transition: 'all 0.2s',
                                }}
                            >
                                {procesando
                                    ? <><div style={S.spinner} /> Conectando con la pasarela...</>
                                    : <><i className="fas fa-lock" style={{ fontSize: '0.85rem' }} /> Pagar Ahora</>
                                }
                            </button>

                            <p style={{ textAlign: 'center', marginTop: 13, color: '#64748b', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <i className="fas fa-shield-alt" style={{ color: '#10b981' }} />
                                Pago 100% seguro y encriptado
                            </p>
                        </div>

                    </div>
                </div>
            </div>
        </section>
    );
}

const S = {
    sectionLabel: {
        fontSize: '0.68rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#94a3b8',
        marginBottom: 12,
        display: 'block',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '15px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        transition: 'background 0.2s',
    },
    radio: {
        width: 20,
        height: 20,
        minWidth: 20,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.2s',
    },
    radioDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#10b981',
    },
    logo: {
        width: 50,
        minWidth: 50,
        height: 34,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.06)',
        flexShrink: 0,
    },
    nombre: {
        display: 'block',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: '#e2e8f0',
        marginBottom: 2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    desc: {
        display: 'block',
        fontSize: '0.76rem',
        color: '#94a3b8',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    badge: {
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.3)',
        color: '#fbbf24',
        fontSize: '0.62rem',
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 20,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    aviso: {
        marginTop: 12,
        padding: '12px 16px',
        background: 'rgba(59,130,246,0.08)',
        borderRadius: 10,
        border: '1px solid rgba(59,130,246,0.2)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
    },
    summary: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    summaryHead: {
        padding: 20,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
    },
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.86rem',
    },
    spinner: {
        width: 17,
        height: 17,
        border: '2.5px solid rgba(255,255,255,0.3)',
        borderRadius: '50%',
        borderTopColor: '#fff',
        animation: 'spin 1s linear infinite',
        flexShrink: 0,
    },
};