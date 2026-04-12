import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/css/landing.css';
import LogoOrb from '../components/LogoOrb';

const COMPANY_EMAIL = 'contacto@otcrm.com';

/* ── CRM Screenshot Showcase ── */
const SCREENS = [
  { key: 'dashboard',  label: 'Dashboard',          icon: 'fa-chart-bar',    src: '/screenshots/dashboard.png'        },
  { key: 'embudo',     label: 'Embudo de Ventas',   icon: 'fa-filter',       src: '/screenshots/embudo.png'           },
  { key: 'contactos',  label: 'Contactos',          icon: 'fa-address-book', src: '/screenshots/contactos.png'        },
  { key: 'respuestas', label: 'Respuestas Rápidas', icon: 'fa-bolt',         src: '/screenshots/respuestasrapidas.png'},
  { key: 'perfil',     label: 'Mi Perfil',          icon: 'fa-user',         src: '/screenshots/perfil.png'           },
];

function CRMShowcase() {
  const [active, setActive]   = useState(0);
  const [paused, setPaused]   = useState(false);
  const [progKey, setProgKey] = useState(0);   // remounts progress bar to restart anim
  const INTERVAL = 4000;

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setActive(a => (a + 1) % SCREENS.length);
      setProgKey(k => k + 1);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [paused]);

  const go = (i) => {
    setActive(i);
    setProgKey(k => k + 1);
  };

  return (
    <div
      className="crm-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Browser-style frame */}
      <div className="crm-frame">
        <div className="crm-frame-bar">
          <div className="crm-frame-dots">
            <span /><span /><span />
          </div>
          <div className="crm-frame-url">
            <i className="fas fa-lock" />
            otcrm.com &nbsp;·&nbsp; {SCREENS[active].label}
          </div>
          <div className="crm-frame-live">
            <span className="crm-live-dot" />
            Live
          </div>
        </div>

        {/* Progress bar */}
        <div className="crm-progress">
          {!paused && (
            <div key={progKey} className="crm-progress-fill" style={{ animationDuration: `${INTERVAL}ms` }} />
          )}
        </div>

        {/* Screens */}
        <div className="crm-screens">
          {SCREENS.map((s, i) => (
            <img
              key={s.key}
              src={s.src}
              alt={s.label}
              className={`crm-screen-img ${i === active ? 'active' : ''}`}
              draggable={false}
            />
          ))}
        </div>
      </div>

      {/* Tab selectors */}
      <div className="crm-tabs">
        {SCREENS.map((s, i) => (
          <button
            key={s.key}
            className={`crm-tab ${i === active ? 'active' : ''}`}
            onClick={() => go(i)}
          >
            <i className={`fas ${s.icon}`} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Animated wave canvas background ── */
function WaveCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let t = 0;
    let lastTime = 0;
    const TARGET_MS = 1000 / 30; // ~30 fps cap for performance

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Build line configs once — random seed baked in at mount
    const LINE_COUNT = 38;
    const lines = Array.from({ length: LINE_COUNT }, (_, i) => {
      const rand = () => Math.random();
      const lighter = rand() > 0.65;
      return {
        baseY:   i / (LINE_COUNT - 1),          // 0..1 vertical spread
        phase:   (i / LINE_COUNT) * Math.PI * 5 + rand() * Math.PI,
        freq1:   0.55 + rand() * 0.9,
        freq2:   1.1  + rand() * 1.1,
        amp1:    0.045 + rand() * 0.11,          // relative to canvas height
        amp2:    0.018 + rand() * 0.055,
        speed:   0.00035 + rand() * 0.00055,
        opacity: 0.035 + rand() * 0.20,
        // Two-tone green palette: emerald vs lighter mint
        r: lighter ? 52  : 16,
        g: lighter ? 211 : 185,
        b: lighter ? 153 : 129,
      };
    });

    const draw = (timestamp) => {
      animId = requestAnimationFrame(draw);
      if (timestamp - lastTime < TARGET_MS) return;
      lastTime = timestamp;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      lines.forEach(line => {
        ctx.beginPath();
        const STEPS = 110;
        for (let j = 0; j <= STEPS; j++) {
          const nx = j / STEPS;
          const y =
            H * line.baseY +
            H * line.amp1 * Math.sin(nx * Math.PI * 2 * line.freq1 + t * line.speed * 100 + line.phase) +
            H * line.amp2 * Math.sin(nx * Math.PI * 3 * line.freq2 + t * line.speed * 65  + line.phase * 1.5);
          if (j === 0) ctx.moveTo(0, y);
          else ctx.lineTo(nx * W, y);
        }

        // Horizontal gradient: fade in → bright center → fade out
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        const { r, g, b, opacity: op } = line;
        grad.addColorStop(0,    `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.12, `rgba(${r},${g},${b},${op})`);
        grad.addColorStop(0.50, `rgba(${r},${g},${b},${(op * 1.15).toFixed(3)})`);
        grad.addColorStop(0.88, `rgba(${r},${g},${b},${(op * 0.65).toFixed(3)})`);
        grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      });

      t++;
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-wave-canvas" aria-hidden="true" />;
}

export default function Landing() {
  const navigate = useNavigate();
  const scrollRootRef = useRef(null);
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', asunto: '', mensaje: '' });

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const handler = () => setNavScrolled(root.scrollTop > 60);
    root.addEventListener('scroll', handler, { passive: true });
    return () => root.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id) => {
    const root = scrollRootRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    root.scrollTo({ top: el.offsetTop - 72, behavior: 'smooth' });
    setMobileOpen(false);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(form.asunto || 'Consulta desde OT CRM');
    const body = encodeURIComponent(
      `Nombre: ${form.nombre}\nEmail: ${form.email}\n\nMensaje:\n${form.mensaje}`
    );
    window.location.href = `mailto:${COMPANY_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div id="landing-scroll-root" className="landing-root" ref={scrollRootRef}>

      {/* ── Animated Wave Background ── */}
      <WaveCanvas />
      <div className="landing-noise" aria-hidden="true" />

      {/* ── Navbar ── */}
      <nav className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <LogoOrb size={40} onClick={() => scrollTo('inicio')} />

          <div className={`landing-nav-links ${mobileOpen ? 'open' : ''}`}>
            <button onClick={() => scrollTo('inicio')}>Inicio</button>
            <button onClick={() => scrollTo('precios')}>Precios</button>
            <button onClick={() => scrollTo('nosotros')}>Nosotros</button>
            <button onClick={() => scrollTo('soporte')}>Soporte</button>
          </div>

          <div className="landing-nav-actions">
            <button className="landing-btn-primary" onClick={() => navigate('/login')}>
              Ingresar
            </button>
            <button
              className="landing-hamburger"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Menú"
            >
              <i className={`fas fa-${mobileOpen ? 'times' : 'bars'}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section id="inicio" className="landing-hero">
        <div className="landing-container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            CRM para WhatsApp, Telegram y más
          </div>

          <h1 className="hero-title">
            Centralizá y convertí
            <span className="hero-title-green"> tus leads en ventas</span>
          </h1>

          <p className="hero-subtitle">
            Gestioná todos tus contactos, conversaciones y tu equipo desde un solo lugar.
            Conectá WhatsApp y Telegram, y cerrá más negocios en tiempo real.
          </p>

          <div className="hero-actions">
            <button className="landing-btn-primary large" onClick={() => navigate('/login')}>
              <i className="fas fa-rocket" />
              Empezar gratis
            </button>
            <button className="landing-btn-ghost large" onClick={() => scrollTo('como-funciona')}>
              Ver cómo funciona
              <i className="fas fa-arrow-down" />
            </button>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-num">100%</span>
              <span className="hero-stat-label">Tiempo real</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-num">Multi</span>
              <span className="hero-stat-label">Agente</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-num">WhatsApp</span>
              <span className="hero-stat-label">+ Telegram</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-num">Gratis</span>
              <span className="hero-stat-label">Para empezar</span>
            </div>
          </div>

          {/* CRM Showcase */}
          <div className="hero-preview">
            <CRMShowcase />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="como-funciona" className="landing-section">
        <div className="landing-container">
          <div className="section-header reveal">
            <span className="section-tag">Cómo funciona</span>
            <h2 className="section-title">Tres pasos para empezar</h2>
            <p className="section-sub">
              En minutos tenés tu CRM listo para operar con todo tu equipo.
            </p>
          </div>

          <div className="steps-grid">
            {[
              {
                num: '01', icon: 'fa-plug',
                title: 'Conectá tus canales',
                desc: 'Vinculá tu WhatsApp y Telegram con un simple escaneo de QR. Sin complicaciones técnicas, en menos de un minuto.',
                delay: 'reveal-delay-1',
              },
              {
                num: '02', icon: 'fa-filter',
                title: 'Organizá tu embudo',
                desc: 'Arrastrá y soltá tus leads en el Kanban. Asigná agentes, personalizá etapas y seguí cada oportunidad.',
                delay: 'reveal-delay-2',
              },
              {
                num: '03', icon: 'fa-chart-line',
                title: 'Cerrá más ventas',
                desc: 'Respondé en tiempo real desde el chat unificado, usá plantillas rápidas y nunca pierdas un lead.',
                delay: 'reveal-delay-3',
              },
            ].map(step => (
              <div key={step.num} className={`step-card reveal reveal-scale ${step.delay}`}>
                <div className="step-num">{step.num}</div>
                <div className="step-icon-wrap">
                  <i className={`fas ${step.icon}`} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-section features-section">
        <div className="landing-container">
          <div className="section-header reveal">
            <span className="section-tag">Funcionalidades</span>
            <h2 className="section-title">Todo lo que necesitás en un lugar</h2>
            <p className="section-sub">
              Herramientas diseñadas para equipos de ventas modernos y ágiles.
            </p>
          </div>

          <div className="features-grid">
            {[
              { icon: 'fa-columns',      title: 'Embudo de Ventas',       delay: 'reveal-delay-1', desc: 'Kanban drag-and-drop para visualizar y mover leads entre etapas. Personalizá cada columna según tu proceso.' },
              { icon: 'fa-comments',     title: 'Chat Unificado',         delay: 'reveal-delay-2', desc: 'Respondé mensajes de WhatsApp y Telegram desde un único panel, sin cambiar de app ni perder contexto.' },
              { icon: 'fa-address-book', title: 'Gestión de Contactos',   delay: 'reveal-delay-3', desc: 'Base de datos centralizada con historial completo de cada cliente. Buscá, filtrá y segmentá en segundos.' },
              { icon: 'fa-chart-bar',    title: 'Dashboard de Métricas',  delay: 'reveal-delay-4', desc: 'Visualizá en tiempo real el estado de tu equipo, leads nuevos, conversiones y conexiones activas.' },
              { icon: 'fa-bolt',         title: 'Respuestas Rápidas',     delay: 'reveal-delay-5', desc: 'Plantillas de mensajes predefinidas para responder más rápido, con consistencia en todo tu equipo.' },
              { icon: 'fa-users',        title: 'Multi-Agente',           delay: 'reveal-delay-6', desc: 'Tu equipo completo trabajando en simultáneo. Cada agente ve sus conversaciones asignadas en tiempo real.' },
            ].map(feat => (
              <div key={feat.title} className={`feature-card reveal ${feat.delay}`}>
                <div className="feature-icon">
                  <i className={`fas ${feat.icon}`} />
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="precios" className="landing-section pricing-section">
        <div className="landing-container">
          <div className="section-header reveal">
            <span className="section-tag">Precios</span>
            <h2 className="section-title">Planes para cada negocio</h2>
            <p className="section-sub">
              Empezá gratis y escalá según el crecimiento de tu equipo.
            </p>
          </div>

          <div className="pricing-grid">
            {[
              {
                key: 'FREE',
                icon: 'fa-seedling',
                name: 'Free',
                tagline: 'Empezá sin costo, ideal para probar.',
                precio: null,
                dispositivos: '1 línea conectada',
                badge: null,
                beneficios: [
                  'Hasta 20 contactos nuevos',
                  'Contactos guardados sin límite',
                  'CRM básico con Kanban',
                  'Dashboard con métricas',
                ],
                cta: 'Usar plan gratis',
                ctaClass: 'btn-outline',
              },
              {
                key: 'PRO',
                icon: 'fa-bolt',
                name: 'Pro',
                tagline: 'Para equipos de ventas en crecimiento.',
                precio: '15.000',
                dispositivos: '5 líneas conectadas',
                badge: 'popular',
                beneficios: [
                  'Hasta 75 contactos nuevos',
                  'Tu equipo hereda tus beneficios',
                  'Múltiples operadores simultáneos',
                  'Todo lo del plan Free',
                ],
                cta: 'Suscribirse al Plan Pro',
                ctaClass: 'btn-blue',
              },
              {
                key: 'BUSINESS',
                icon: 'fa-building',
                name: 'Business',
                tagline: 'Volumen alto y agencias consolidadas.',
                precio: '30.000',
                dispositivos: '10 líneas conectadas',
                badge: 'business',
                beneficios: [
                  'Hasta 250 contactos nuevos',
                  'Espacio de trabajo ampliado',
                  'Reportes avanzados',
                  'Todo lo del plan Pro',
                ],
                cta: 'Suscribirse al Plan Business',
                ctaClass: 'btn-violet',
              },
              {
                key: 'ENTERPRISE',
                icon: 'fa-gem',
                name: 'Enterprise',
                tagline: 'Libertad absoluta, sin ningún límite.',
                precio: '60.000',
                dispositivos: 'Conexiones ilimitadas',
                badge: 'vip',
                beneficios: [
                  'Contactos ilimitados',
                  'Sin tope de ingreso al embudo',
                  'Soporte dedicado 24/7',
                  'Todo lo del plan Business',
                ],
                cta: 'Contactar',
                ctaClass: 'btn-gold',
              },
            ].map(plan => (
              <div
                key={plan.key}
                className={`pricing-card reveal reveal-scale reveal-delay-${['FREE','PRO','BUSINESS','ENTERPRISE'].indexOf(plan.key) + 1} ${plan.badge === 'popular' ? 'popular' : ''} ${plan.badge === 'business' ? 'business' : ''} ${plan.badge === 'vip' ? 'vip' : ''}`}
              >
                {plan.badge && (
                  <div className={`plan-badge ${plan.badge}`}>
                    {plan.badge === 'popular' ? '⭐ Más Popular' : plan.badge === 'business' ? '🚀 Recomendado' : '💎 VIP'}
                  </div>
                )}
                <div className="plan-icon">
                  <i className={`fas ${plan.icon}`} />
                </div>
                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-tagline">{plan.tagline}</p>
                {plan.precio ? (
                  <div className="plan-price">
                    <span className="plan-price-currency">$</span>
                    <span className="plan-price-amount">{plan.precio}</span>
                    <span className="plan-price-period">/mes</span>
                  </div>
                ) : (
                  <div className="plan-price">
                    <span className="plan-price-free">Gratis</span>
                  </div>
                )}
                <div className="plan-device">
                  <i className="fas fa-mobile-alt" />
                  {plan.dispositivos}
                </div>
                <ul className="plan-benefits">
                  {plan.beneficios.map(b => (
                    <li key={b}>
                      <i className="fas fa-check" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`plan-cta ${plan.ctaClass}`}
                  onClick={() => plan.key === 'ENTERPRISE' ? scrollTo('soporte') : navigate('/login')}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Nosotros ── */}
      <section id="nosotros" className="landing-section about-section">
        <div className="landing-container">
          <div className="about-grid">
            <div className="about-content reveal reveal-left">
              <span className="section-tag">Nosotros</span>
              <h2 className="section-title left">
                Construido por vendedores,<br />para vendedores
              </h2>
              <p className="about-text">
                OT CRM nació de la necesidad real de gestionar cientos de conversaciones
                sin perder el control. Entendemos los desafíos de los equipos de ventas
                porque los vivimos en primera persona.
              </p>
              <p className="about-text">
                Nuestra misión es darte una herramienta que realmente funcione: rápida,
                confiable y construida para el mercado hispanohablante. Sin complicaciones,
                sin fricciones.
              </p>
              <div className="about-values">
                {[
                  { icon: 'fa-rocket', title: 'Velocidad', desc: 'Respuestas y actualizaciones en tiempo real' },
                  { icon: 'fa-shield-alt', title: 'Confianza', desc: 'Tu data es tuya, siempre segura' },
                  { icon: 'fa-headset', title: 'Soporte', desc: 'Te acompañamos en cada paso del camino' },
                ].map(v => (
                  <div key={v.title} className="about-value">
                    <i className={`fas ${v.icon}`} />
                    <div>
                      <strong>{v.title}</strong>
                      <span>{v.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="about-visual reveal reveal-right">
              <div className="about-card-stack">
                <div className="acard acard-1">
                  <i className="fas fa-users" />
                  <div>
                    <strong>Equipo conectado</strong>
                    <span>Todos tus agentes en un panel unificado</span>
                  </div>
                </div>
                <div className="acard acard-2">
                  <i className="fas fa-chart-line" />
                  <div>
                    <strong>Métricas en vivo</strong>
                    <span>Decisiones basadas en datos reales</span>
                  </div>
                </div>
                <div className="acard acard-3">
                  <i className="fas fa-lock" />
                  <div>
                    <strong>Datos seguros</strong>
                    <span>Tu información siempre protegida</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Soporte ── */}
      <section id="soporte" className="landing-section support-section">
        <div className="landing-container">
          <div className="section-header reveal">
            <span className="section-tag">Soporte</span>
            <h2 className="section-title">¿Necesitás ayuda?</h2>
            <p className="section-sub">
              Estamos para ayudarte. Escribinos y te respondemos a la brevedad.
            </p>
          </div>

          <div className="support-grid">
            <form className="support-form reveal" onSubmit={handleSubmit}>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Tu nombre</label>
                  <input
                    type="text"
                    name="nombre"
                    placeholder="Juan García"
                    value={form.nombre}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="sf-field">
                  <label>Tu email</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="juan@empresa.com"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="sf-field">
                <label>Asunto</label>
                <input
                  type="text"
                  name="asunto"
                  placeholder="¿En qué te podemos ayudar?"
                  value={form.asunto}
                  onChange={handleChange}
                />
              </div>
              <div className="sf-field">
                <label>Mensaje</label>
                <textarea
                  name="mensaje"
                  placeholder="Describí tu consulta o problema con el mayor detalle posible..."
                  value={form.mensaje}
                  onChange={e => { handleChange(e); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                  required
                />
              </div>
              <button type="submit" className="sf-submit">
                <i className="fas fa-paper-plane" />
                Enviar consulta
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <LogoOrb size={40} onClick={() => scrollTo('inicio')} />
              <p>
                Tu CRM para WhatsApp y Telegram. Gestión de leads
                simple, efectiva y en tiempo real.
              </p>
            </div>
            <div className="footer-links">
              <strong>Navegación</strong>
              <button onClick={() => scrollTo('inicio')}>Inicio</button>
              <button onClick={() => scrollTo('como-funciona')}>Cómo funciona</button>
              <button onClick={() => scrollTo('precios')}>Precios</button>
              <button onClick={() => scrollTo('nosotros')}>Nosotros</button>
              <button onClick={() => scrollTo('soporte')}>Soporte</button>
            </div>
            <div className="footer-links">
              <strong>Cuenta</strong>
              <button onClick={() => navigate('/login')}>Iniciar sesión</button>
              <button onClick={() => navigate('/login')}>Registrarse</button>
            </div>
          </div>
          <div className="footer-team">
            <div className="footer-team-members">
              {[
                {
                  name: 'Fabricio Thompson',
                  linkedin: 'https://www.linkedin.com/in/fabriciothompson/',
                  github: 'https://github.com/fabrithompson',
                },
                {
                  name: "Ivan O'Connor",
                  linkedin: 'https://www.linkedin.com/in/ivan-o-connor-b63010400/',
                  github: 'https://github.com/IvanOCNN',
                },
              ].map(m => (
                <div key={m.name} className="footer-member">
                  <span className="footer-member-name">{m.name}</span>
                  <div className="footer-member-links">
                    <a href={m.linkedin} target="_blank" rel="noopener noreferrer">
                      <i className="fab fa-linkedin" /> LinkedIn
                    </a>
                    <span className="footer-dot">·</span>
                    <a href={m.github} target="_blank" rel="noopener noreferrer">
                      <i className="fab fa-github" /> GitHub
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <a href={`mailto:${COMPANY_EMAIL}`} className="footer-email-badge">
              <i className="fas fa-envelope" />
              {COMPANY_EMAIL}
            </a>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} OT CRM. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
