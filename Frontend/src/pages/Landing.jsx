import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/css/landing.css';
import LogoOrb from '../components/LogoOrb';
import WaveCanvas from '../components/WaveCanvas';
import { useLanguage } from '../context/LangContext';

const COMPANY_EMAIL = 'otempresa@otempresa.com';


export default function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();
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

  const steps = [
    { num: '01', icon: 'fa-plug',       title: t('landing.how.step1Title'), desc: t('landing.how.step1Desc'), delay: 'reveal-delay-1' },
    { num: '02', icon: 'fa-filter',     title: t('landing.how.step2Title'), desc: t('landing.how.step2Desc'), delay: 'reveal-delay-2' },
    { num: '03', icon: 'fa-chart-line', title: t('landing.how.step3Title'), desc: t('landing.how.step3Desc'), delay: 'reveal-delay-3' },
  ];

  const features = [
    { icon: 'fa-columns',      title: t('landing.features.f1Title'), delay: 'reveal-delay-1', desc: t('landing.features.f1Desc') },
    { icon: 'fa-comments',     title: t('landing.features.f2Title'), delay: 'reveal-delay-2', desc: t('landing.features.f2Desc') },
    { icon: 'fa-address-book', title: t('landing.features.f3Title'), delay: 'reveal-delay-3', desc: t('landing.features.f3Desc') },
    { icon: 'fa-chart-bar',    title: t('landing.features.f4Title'), delay: 'reveal-delay-4', desc: t('landing.features.f4Desc') },
    { icon: 'fa-bolt',         title: t('landing.features.f5Title'), delay: 'reveal-delay-5', desc: t('landing.features.f5Desc') },
    { icon: 'fa-users',        title: t('landing.features.f6Title'), delay: 'reveal-delay-6', desc: t('landing.features.f6Desc') },
  ];

  const plans = [
    {
      key: 'FREE', icon: 'fa-seedling', name: 'Free',
      tagline: t('landing.pricing.free.tagline'),
      precio: null,
      dispositivos: t('landing.pricing.free.dispositivos'),
      badge: null,
      beneficios: [t('landing.pricing.free.b1'), t('landing.pricing.free.b2'), t('landing.pricing.free.b3'), t('landing.pricing.free.b4')],
      cta: t('landing.pricing.free.cta'), ctaClass: 'btn-outline',
    },
    {
      key: 'PRO', icon: 'fa-bolt', name: 'Pro',
      tagline: t('landing.pricing.pro.tagline'),
      precio: '15.000',
      dispositivos: t('landing.pricing.pro.dispositivos'),
      badge: 'popular',
      beneficios: [t('landing.pricing.pro.b1'), t('landing.pricing.pro.b2'), t('landing.pricing.pro.b3'), t('landing.pricing.pro.b4')],
      cta: t('landing.pricing.pro.cta'), ctaClass: 'btn-blue',
    },
    {
      key: 'BUSINESS', icon: 'fa-building', name: 'Business',
      tagline: t('landing.pricing.business.tagline'),
      precio: '30.000',
      dispositivos: t('landing.pricing.business.dispositivos'),
      badge: 'business',
      beneficios: [t('landing.pricing.business.b1'), t('landing.pricing.business.b2'), t('landing.pricing.business.b3'), t('landing.pricing.business.b4')],
      cta: t('landing.pricing.business.cta'), ctaClass: 'btn-violet',
    },
    {
      key: 'ENTERPRISE', icon: 'fa-gem', name: 'Enterprise',
      tagline: t('landing.pricing.enterprise.tagline'),
      precio: '60.000',
      dispositivos: t('landing.pricing.enterprise.dispositivos'),
      badge: 'vip',
      beneficios: [t('landing.pricing.enterprise.b1'), t('landing.pricing.enterprise.b2'), t('landing.pricing.enterprise.b3'), t('landing.pricing.enterprise.b4')],
      cta: t('landing.pricing.enterprise.cta'), ctaClass: 'btn-gold',
    },
  ];

  const values = [
    { icon: 'fa-rocket',     title: t('landing.about.v1Title'), desc: t('landing.about.v1Desc') },
    { icon: 'fa-shield-alt', title: t('landing.about.v2Title'), desc: t('landing.about.v2Desc') },
    { icon: 'fa-headset',    title: t('landing.about.v3Title'), desc: t('landing.about.v3Desc') },
  ];

  return (
    <div id="landing-scroll-root" className="landing-root" ref={scrollRootRef}>

      <WaveCanvas />
      <div className="landing-noise" aria-hidden="true" />

      {/* ── Navbar ── */}
      <nav className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <LogoOrb width={84} height={85} showText={false} onClick={() => scrollTo('inicio')} />

          <div className={`landing-nav-links ${mobileOpen ? 'open' : ''}`}>
            <button onClick={() => scrollTo('inicio')}>{t('landing.nav.inicio')}</button>
            <button onClick={() => scrollTo('precios')}>{t('landing.nav.precios')}</button>
            <button onClick={() => scrollTo('nosotros')}>{t('landing.nav.nosotros')}</button>
            <button onClick={() => scrollTo('soporte')}>{t('landing.nav.soporte')}</button>
          </div>

          <div className="landing-nav-actions">
            <button className="landing-btn-primary" onClick={() => navigate('/login')}>
              {t('landing.nav.ingresar')}
            </button>
            <button
              className="landing-lang-toggle"
              onClick={toggleLang}
              title={lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              aria-label="Toggle language"
            >
              <i className="fas fa-globe" />
              <span>{lang === 'es' ? 'EN' : 'ES'}</span>
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
        <div className="hero-glow" aria-hidden="true" />

        <div className="landing-container">
          <div className="hero-inner">

            <div className="hero-content">
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                {t('landing.hero.badge')}
              </div>

              <h1 className="hero-title">
                {t('landing.hero.titleA')}
                <em className="ht-serif">{t('landing.hero.titleB')}</em>
                {t('landing.hero.titleC')}
              </h1>

              <p className="hero-subtitle">
                {t('landing.hero.subtitle')}
              </p>

              <div className="hero-actions">
                <button className="landing-btn-primary large" onClick={() => navigate('/login')}>
                  <i className="fas fa-rocket" />
                  {t('landing.hero.cta1')}
                </button>
                <button className="landing-btn-ghost large" onClick={() => scrollTo('como-funciona')}>
                  {t('landing.hero.cta2')}
                  <i className="fas fa-arrow-down" />
                </button>
              </div>

              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hero-stat-num">{t('landing.hero.stat1Num')}</span>
                  <span className="hero-stat-label">{t('landing.hero.stat1Label')}</span>
                </div>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                  <span className="hero-stat-num">{t('landing.hero.stat2Num')}</span>
                  <span className="hero-stat-label">{t('landing.hero.stat2Label')}</span>
                </div>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                  <span className="hero-stat-num">{t('landing.hero.stat3Num')}</span>
                  <span className="hero-stat-label">{t('landing.hero.stat3Label')}</span>
                </div>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                  <span className="hero-stat-num">{t('landing.hero.stat4Num')}</span>
                  <span className="hero-stat-label">{t('landing.hero.stat4Label')}</span>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-img-glow" aria-hidden="true" />
              <img
                src="/chicaconpc.PNG"
                alt={t('landing.hero.imgAlt')}
                className="hero-img"
                draggable={false}
              />
              <div className="hfb hfb--1" aria-hidden="true">
                <span className="hfb-dot hfb-dot--green" />
                {t('landing.hero.float1')}
              </div>
              <div className="hfb hfb--2" aria-hidden="true">
                <i className="fa-solid fa-bolt" /> {t('landing.hero.float2')}
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
            <span className="section-tag">{t('landing.how.tag')}</span>
            <h2 className="section-title">{t('landing.how.titleA')} <span className="title-serif">{t('landing.how.titleB')}</span></h2>
            <p className="section-sub">{t('landing.how.subtitle')}</p>
          </div>

          <div className="steps-grid">
            {steps.map(step => (
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
            <span className="section-tag">{t('landing.features.tag')}</span>
            <h2 className="section-title">{t('landing.features.titleA')} <span className="title-serif">{t('landing.features.titleB')}</span>{t('landing.features.titleC')}</h2>
            <p className="section-sub">{t('landing.features.subtitle')}</p>
          </div>

          <div className="features-grid">
            {features.map(feat => (
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
            <span className="section-tag">{t('landing.pricing.tag')}</span>
            <h2 className="section-title">{t('landing.pricing.titleA')} <span className="title-serif">{t('landing.pricing.titleB')}</span></h2>
            <p className="section-sub">{t('landing.pricing.subtitle')}</p>
          </div>

          <div className="pricing-grid">
            {plans.map((plan, idx) => (
              <div
                key={plan.key}
                className={`pricing-card reveal reveal-scale reveal-delay-${idx + 1} ${plan.badge === 'popular' ? 'popular' : ''} ${plan.badge === 'business' ? 'business' : ''} ${plan.badge === 'vip' ? 'vip' : ''}`}
              >
                {plan.badge && (
                  <div className={`plan-badge ${plan.badge}`}>
                    {plan.badge === 'popular' ? t('landing.pricing.badgePopular') : plan.badge === 'business' ? t('landing.pricing.badgeBusiness') : t('landing.pricing.badgeVip')}
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
                    <span className="plan-price-period">{t('landing.pricing.perMonth')}</span>
                  </div>
                ) : (
                  <div className="plan-price">
                    <span className="plan-price-free">{t('landing.pricing.freeLabel')}</span>
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
              <span className="section-tag">{t('landing.about.tag')}</span>
              <h2 className="section-title left">
                {t('landing.about.titleA')} <span className="title-serif">{t('landing.about.titleB')}</span>{t('landing.about.titleC')}
              </h2>
              <p className="about-text">{t('landing.about.p1')}</p>
              <p className="about-text">{t('landing.about.p2')}</p>
              <div className="about-values">
                {values.map(v => (
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
                    <strong>{t('landing.about.card1Strong')}</strong>
                    <span>{t('landing.about.card1Span')}</span>
                  </div>
                </div>
                <div className="acard acard-2">
                  <i className="fas fa-chart-line" />
                  <div>
                    <strong>{t('landing.about.card2Strong')}</strong>
                    <span>{t('landing.about.card2Span')}</span>
                  </div>
                </div>
                <div className="acard acard-3">
                  <i className="fas fa-lock" />
                  <div>
                    <strong>{t('landing.about.card3Strong')}</strong>
                    <span>{t('landing.about.card3Span')}</span>
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
            <span className="section-tag">{t('landing.support.tag')}</span>
            <h2 className="section-title">{t('landing.support.titleA')} <span className="title-serif">{t('landing.support.titleB')}</span>{t('landing.support.titleC')}</h2>
            <p className="section-sub">{t('landing.support.subtitle')}</p>
          </div>

          <div className="support-grid">
            <div className="support-info reveal reveal-left">
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-envelope" /></div>
                <div className="si-text">
                  <strong>{t('landing.support.emailLabel')}</strong>
                  <span>{COMPANY_EMAIL}</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-clock" /></div>
                <div className="si-text">
                  <strong>{t('landing.support.responseTime')}</strong>
                  <span>{t('landing.support.responseTimeVal')}</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-headset" /></div>
                <div className="si-text">
                  <strong>{t('landing.support.included')}</strong>
                  <span>{t('landing.support.includedVal')}</span>
                </div>
              </div>
              <div className="si-item">
                <div className="si-icon"><i className="fas fa-shield-alt" /></div>
                <div className="si-text">
                  <strong>{t('landing.support.privacy')}</strong>
                  <span>{t('landing.support.privacyVal')}</span>
                </div>
              </div>
            </div>

            <form className="support-form reveal" onSubmit={handleSubmit}>
              <div className="sf-row">
                <div className="sf-field">
                  <label>{t('landing.support.formName')}</label>
                  <input
                    type="text"
                    name="nombre"
                    placeholder={t('landing.support.formNamePh')}
                    value={form.nombre}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="sf-field">
                  <label>{t('landing.support.formEmail')}</label>
                  <input
                    type="email"
                    name="email"
                    placeholder={t('landing.support.formEmailPh')}
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="sf-field">
                <label>{t('landing.support.formSubject')}</label>
                <input
                  type="text"
                  name="asunto"
                  placeholder={t('landing.support.formSubjectPh')}
                  value={form.asunto}
                  onChange={handleChange}
                />
              </div>
              <div className="sf-field">
                <label>{t('landing.support.formMessage')}</label>
                <textarea
                  name="mensaje"
                  placeholder={t('landing.support.formMessagePh')}
                  value={form.mensaje}
                  onChange={e => { handleChange(e); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                  required
                />
              </div>
              <button type="submit" className="sf-submit">
                <i className="fas fa-paper-plane" />
                {t('landing.support.formSubmit')}
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
              <p>{t('landing.footer.desc')}</p>
            </div>
            <div className="footer-links">
              <strong>{t('landing.footer.nav')}</strong>
              <button onClick={() => scrollTo('inicio')}>{t('landing.footer.navHome')}</button>
              <button onClick={() => scrollTo('como-funciona')}>{t('landing.footer.navHow')}</button>
              <button onClick={() => scrollTo('precios')}>{t('landing.footer.navPricing')}</button>
              <button onClick={() => scrollTo('nosotros')}>{t('landing.footer.navAbout')}</button>
              <button onClick={() => scrollTo('soporte')}>{t('landing.footer.navSupport')}</button>
            </div>
            <div className="footer-links">
              <strong>{t('landing.footer.cuenta')}</strong>
              <button onClick={() => navigate('/login')}>{t('landing.footer.login')}</button>
              <button onClick={() => navigate('/login')}>{t('landing.footer.register')}</button>
            </div>
          </div>
          <div className="footer-team">
            <div className="footer-team-members">
              {[
                { name: 'Fabricio Thompson', linkedin: 'https://www.linkedin.com/in/fabriciothompson/', github: 'https://github.com/fabrithompson' },
                { name: "Ivan O'Connor",      linkedin: 'https://www.linkedin.com/in/ivan-o-connor-b63010400/', github: 'https://github.com/IvanOCNN' },
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
            <span>© {new Date().getFullYear()} OT CRM. {t('landing.footer.rights')}</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
