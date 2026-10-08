import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { clickable } from '../utils/a11y';
import { useUser } from '../context/UserContext';
import '../assets/css/pages/Checkout.css';
import { useLanguage } from '../context/LangContext';

const METODOS = [
    {
        id: 'mp',
        nombre: 'Mercado Pago',
        desc: 'Tarjetas, saldo y cuotas',
        activo: true,
        logoStyle: { background: 'rgba(0,158,227,0.15)', borderColor: 'rgba(0,158,227,0.3)', color: '#009ee3' },
        logo: <i className="fas fa-wallet" />,
        extra: (
            <div className="chk-1">
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
            <div className="chk-2">
                <span className="chk-3">VISA</span>
                <span className="chk-4">MC</span>
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
        logo: <i className="fab fa-apple chk-5" />,
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
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const planId = searchParams.get('planId');
    const { usuario: userCtx } = useUser();

    const [plan, setPlan] = useState(null);
    const [email, setEmail] = useState('');
    const [metodo, setMetodo] = useState('mp');
    const [cargando, setCargando] = useState(true);
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!planId) { navigate('/planes'); return; }
        api.get('/planes').then(planesRes => {
            const found = planesRes.data.find(p => String(p.id) === String(planId));
            if (!found || found.precioMensual === 0) { navigate('/planes'); return; }
            setPlan(found);
            setEmail(userCtx?.email || '');
        }).catch(() => navigate('/planes'))
          .finally(() => setCargando(false));
    }, [planId, userCtx, navigate]);

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
            <div className="chk-6">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <section className="page-wrapper chk-7">
            <div className="dashboard-content custom-scrollbar chk-8">

                <div className="chk-9">
                    <button className="chk-10" onClick={() => navigate('/planes')}>
                        <i className="fas fa-arrow-left" /> {t('checkout.back')}
                    </button>

                    <div className="chk-11">

                        <div className="chk-12">
                            <span id="checkout-metodo-label" style={S.sectionLabel}>{t('checkout.chooseMethod')}</span>

                            <div style={S.list} role="radiogroup" aria-labelledby="checkout-metodo-label">
                                {METODOS.map(m => {
                                    const selected = metodo === m.id && m.activo;
                                    return (
                                        <div
                                            key={m.id}
                                            {...clickable(() => setMetodo(m.id), { role: 'radio', checked: selected, disabled: !m.activo })}
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

                                            <div className="chk-13">
                                                <span style={S.nombre}>{m.nombre}</span>
                                                <span style={S.desc}>{m.desc}</span>
                                            </div>

                                            {m.activo && m.extra}
                                            {!m.activo && <span style={S.badge}>{t('checkout.soon')}</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {metodo === 'mp' && (
                                <div style={S.aviso}>
                                    <i className="fas fa-info-circle chk-14" />
                                    <div className="chk-15">
                                        <p className="chk-16">
                                            {t('checkout.mpEmail')}
                                        </p>
                                        <input className="chk-17" aria-label={t('checkout.mpEmailLabel')} autoComplete="email"
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder={t('checkout.emailPh')}
                                        />
                                        <p className="chk-18">
                                            {t('checkout.mpEmailHint')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="chk-19">
                            <div style={S.summary}>
                                <div style={S.summaryHead}>
                                    <span className="chk-20">{t('checkout.selectedPlan')}</span>
                                    <span className="chk-21">
                                        {plan.nombre.charAt(0) + plan.nombre.slice(1).toLowerCase()}
                                    </span>
                                    <span className="chk-22">
                                        $ {formatPrecio(plan.precioMensual)} <span className="chk-23">{t('checkout.perMonthArs')}</span>
                                    </span>
                                </div>

                                <div className="chk-24">
                                    {[
                                        { label: 'Subtotal', valor: `$ ${formatPrecio(plan.precioMensual)}` },
                                        { label: 'Descuento', valor: '— $ 0', color: '#10b981' },
                                        { label: 'Renovación', valor: 'Mensual' },
                                    ].map(r => (
                                        <div key={r.label} style={S.summaryRow}>
                                            <span className="chk-25">{r.label}</span>
                                            <span className="chk-26" style={{ color: r.color || '#e2e8f0' }}>{r.valor}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="chk-27">
                                    <span className="chk-28">{t('checkout.totalToday')}</span>
                                    <span className="chk-29">
                                        $ {formatPrecio(plan.precioMensual)} <span className="chk-30">ARS</span>
                                    </span>
                                </div>
                            </div>

                            {error && (
                                <div className="chk-31">
                                    <i className="fas fa-exclamation-triangle" />
                                    {error}
                                </div>
                            )}

                            <button className="chk-32"
                                onClick={handlePagar}
                                disabled={procesando}
                                style={{ cursor: procesando ? 'not-allowed' : 'pointer', background: procesando ? 'rgba(255,255,255,0.1)' : metodoActivo?.btnGradient, boxShadow: procesando ? 'none' : metodoActivo?.btnShadow }}
                            >
                                {procesando
                                    ? <><div style={S.spinner} /> {t('checkout.connecting')}</>
                                    : <><i className="fas fa-lock chk-33" /> {t('checkout.payNow')}</>
                                }
                            </button>

                            <p className="chk-34">
                                <i className="fas fa-shield-alt chk-35" />
                                {t('checkout.secure')}
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