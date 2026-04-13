import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/css/landing.css';
import LogoOrb from '../components/LogoOrb';
import WaveCanvas from '../components/WaveCanvas';

const COMPANY_EMAIL = 'otempresa@otempresa.com';


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

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

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
          <LogoOrb width={84} height={85} showText={false} onClick={() => scrollTo('inicio')} />

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
        {/* Radial glow behind the headline */}
        <div className="hero-glow" aria-hidden="true" />

        <div className="landing-container">
          <div className="hero-inner">

            {/* ── Left: text content ── */}
            <div className="hero-content">
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                CRM para WhatsApp y Telegram.
              </div>

              <h1 className="hero-title">
                Centralizá y convertí
                <em className="ht-serif">tus leads</em>
                en ventas
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
            </div>

            {/* ── Right: hero image ── */}
            <div className="hero-visual">
              <div className="hero-img-glow" aria-hidden="true" />
              <img
                src="/chicaconpc.PNG"
                alt="Profesional usando OT CRM"
                className="hero-img"
                draggable={false}
              />
              <div className="hfb hfb--1" aria-hidden="true">
                <span className="hfb-dot hfb-dot--green" />
                +500 leads activos
              </div>
              <div className="hfb hfb--2" aria-hidden="true">
                <i className="fa-solid fa-bolt" /> Tiempo real
              </div>
              <div className="hfb hfb--3" aria-hidden="true">
                <i className="fa-brands fa-whatsapp" /> WhatsApp &amp; Telegram
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="como-funciona" className="landing-section">
        <div className="landing-container">
          <div className="section-header reveal">
            <span className="section-tag">Cómo funciona</span>
            <h2 className="section-title">Tres pasos para <span className="title-serif">empezar</span></h2>
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
            <h2 className="section-title">Todo lo que <span className="title-serif">necesitás</span> en un lugar</h2>
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
            <h2 className="section-title">Planes para cada <span className="title-serif">negocio</span></h2>
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
                Construido por <span className="title-serif">vendedores</span>,<br />para vendedores
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
                  { icon: 'fa-rocket',     title: 'Velocidad',  desc: 'Respuestas y actualizaciones en tiempo real' },
                  { icon: 'fa-shield-alt', title: 'Confianza',  desc: 'Tu data es tuya, siempre segura' },
                  { icon: 'fa-headset',    title: 'Soporte',    desc: 'Te acompañamos en cada paso del camino' },
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
            <h2 className="section-title">¿Necesitás <span className="title-serif">ayuda</span>?</h2>
            <p className="section-sub">
              Estamos para ayudarte. Escribinos y te respondemos a la brevedad.
            </p>
          </div>

          <div className="support-grid">
            {/* Info column */}
            <div className="support-info reveal reveal-left">
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-envelope" /></div>
                <div className="si-text">
                  <strong>Email directo</strong>
                  <span>{COMPANY_EMAIL}</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-clock" /></div>
                <div className="si-text">
                  <strong>Tiempo de respuesta</strong>
                  <span>Menos de 24 horas</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-headset" /></div>
                <div className="si-text">
                  <strong>Soporte incluido</strong>
                  <span>Para todos los planes activos</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-shield-alt" /></div>
                <div className="si-text">
                  <strong>Privacidad garantizada</strong>
                  <span>Tus datos nunca se comparten</span>
                </div>
              </div>
            </div>

            {/* Form */}
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
        <div className="footer-glow-sep" aria-hidden="true" />
        <div className="landing-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <LogoOrb width={84} height={85} showText={false} onClick={() => scrollTo('inicio')} />
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
