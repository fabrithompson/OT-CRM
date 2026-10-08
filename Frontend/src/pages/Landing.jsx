import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/css/landing-x.css';
import LogoOrb from '../components/LogoOrb';
import PlanetHorizon from '../components/landing/PlanetHorizon';
// Fotos de Pexels (licencia Pexels: uso comercial libre). Procesadas a WebP y viradas a violeta.
import cielo1280 from '../assets/landing/cielo-1280.webp';
import cielo2400 from '../assets/landing/cielo-2400.webp';
import nebulosaNucleo from '../assets/landing/nebulosa-nucleo.webp';
import nebulosaPlaneta from '../assets/landing/nebulosa-planeta.webp';
import nebulosaNube from '../assets/landing/nebulosa-nube.webp';
import nebulosaBurbujas from '../assets/landing/nebulosa-burbujas.webp';
import LineIcon from '../components/landing/LineIcon';
import ChatDemo from '../components/landing/ChatDemo';
import { useLanguage } from '../context/LangContext';

const COMPANY_EMAIL = 'otempresa@otempresa.com';
const NAV_SECTIONS = ['inicio', 'nosotros', 'precios', 'soporte'];
const TEAM = [
  { name: 'Fabricio Thompson', linkedin: 'https://www.linkedin.com/in/fabriciothompson/', github: 'https://github.com/fabrithompson' },
  { name: "Ivan O'Connor", linkedin: 'https://www.linkedin.com/in/ivan-o-connor-b63010400/', github: 'https://github.com/IvanOCNN' },
];

const SKY_SRCSET = `${cielo1280} 1280w, ${cielo2400} 2400w`;

/* Cielo real + horizonte del planeta. Decorativo (el texto va encima). */
function SkyBackdrop({ className, priority = false }) {
  return (
    <div className={className} aria-hidden="true">
      <img
        className="lx-sky__photo"
        src={cielo2400}
        srcSet={SKY_SRCSET}
        sizes="100vw"
        alt=""
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
      <PlanetHorizon className="lx-sky__horizon" />
    </div>
  );
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * Landing pública — estilo "dark cinematic" espacial.
 * Todo vive dentro de .lx, que es además el contenedor con scroll (el body de
 * la app tiene overflow: hidden). Única acción principal: "Empezar gratis".
 */
export default function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();
  const rootRef = useRef(null);
  const [active, setActive] = useState('inicio');
  const [form, setForm] = useState({ nombre: '', email: '', asunto: '', mensaje: '' });

  const goRegister = () => navigate('/login?modo=registro');

  const scrollTo = useCallback((id) => {
    const root = rootRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    root.scrollTo({ top: id === 'inicio' ? 0 : el.offsetTop - 24, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const anchor = (id) => ({
    href: `#${id}`,
    onClick: (e) => { e.preventDefault(); scrollTo(id); },
  });

  // Aparición escalonada de los elementos al entrar en pantalla
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { root, threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    root.querySelectorAll('.lx-reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Enlace activo de la navegación según la sección visible
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { root, rootMargin: '-45% 0px -50% 0px' });
    NAV_SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(form.asunto || 'Consulta desde OT CRM');
    const body = encodeURIComponent(`Nombre: ${form.nombre}\nEmail: ${form.email}\n\nMensaje:\n${form.mensaje}`);
    window.location.href = `mailto:${COMPANY_EMAIL}?subject=${subject}&body=${body}`;
  };

  const steps = [1, 2, 3].map((n) => ({ num: `0${n}`, title: t(`landing.how.step${n}Title`), desc: t(`landing.how.step${n}Desc`) }));

  const features = [
    { icon: 'kanban', n: 1 }, { icon: 'chat', n: 2 }, { icon: 'contacts', n: 3 },
    { icon: 'chart', n: 4 }, { icon: 'bolt', n: 5 }, { icon: 'team', n: 6 },
  ].map((f) => ({ ...f, title: t(`landing.features.f${f.n}Title`), desc: t(`landing.features.f${f.n}Desc`) }));

  const plans = [
    { key: 'FREE', name: 'Free', precio: null, badge: null, k: 'free' },
    { key: 'PRO', name: 'Pro', precio: '35.000', badge: t('landing.x.badgePopular'), k: 'pro', featured: true },
    { key: 'BUSINESS', name: 'Business', precio: '80.000', badge: t('landing.x.badgeBusiness'), k: 'business' },
    { key: 'ENTERPRISE', name: 'Enterprise', precio: '160.000', badge: t('landing.x.badgeVip'), k: 'enterprise' },
  ].map((p) => ({
    ...p,
    tagline: t(`landing.pricing.${p.k}.tagline`),
    dispositivos: t(`landing.pricing.${p.k}.dispositivos`),
    beneficios: [1, 2, 3, 4].map((i) => t(`landing.pricing.${p.k}.b${i}`)),
    cta: t(`landing.pricing.${p.k}.cta`),
    // Free es el único beneficio "negativo" (b4: sin campañas masivas)
    mutedLast: p.k === 'free',
  }));

  const work = [
    { n: 1, img: nebulosaNucleo, wide: true },
    { n: 2, img: nebulosaNube },
    { n: 3, img: nebulosaBurbujas },
  ].map((w) => ({ ...w, label: t(`landing.x.work${w.n}Label`), name: t(`landing.x.work${w.n}Name`), alt: t(`landing.x.work${w.n}Alt`) }));

  return (
    <div className="lx" ref={rootRef}>

      {/* ════════ 1 · HÉROE ════════ */}
      <header id="inicio" className="lx-hero">
        <div className="lx-hero__media">
          <SkyBackdrop className="lx-sky lx-hero__scene" priority />
        </div>
        <div className="lx-hero__veil" aria-hidden="true" />
        <div className="lx-hero__fade" aria-hidden="true" />

        <div className="lx-container lx-hero__inner">
          <nav className="lx-nav" aria-label={t('landing.x.navLabel')}>
            <a className="lx-logo" {...anchor('inicio')} aria-label="OT CRM">
              <LogoOrb width={60} height={50} showText={false} />
            </a>

            <ul className="lx-nav__links">
              {NAV_SECTIONS.map((id) => (
                <li key={id}>
                  <a {...anchor(id)} className={active === id ? 'is-active' : undefined} aria-current={active === id ? 'true' : undefined}>
                    {t(`landing.nav.${id}`)}
                  </a>
                </li>
              ))}
            </ul>

            <div className="lx-nav__actions">
              <button type="button" className="lx-btn lx-btn--ghost lx-btn--sm" onClick={toggleLang} aria-label={t('landing.x.langLabel')}>
                <LineIcon name="globe" size={18} />
                {lang === 'es' ? 'EN' : 'ES'}
              </button>
              <button type="button" className="lx-link" onClick={() => navigate('/login')}>{t('landing.nav.ingresar')}</button>
              <button type="button" className="lx-btn lx-btn--primary lx-btn--sm" onClick={goRegister}>{t('landing.x.navStart')}</button>
            </div>
          </nav>

          <div className="lx-notif" aria-hidden="true">
            <div className="lx-notif__head">
              <span><i className="fab fa-whatsapp" /> {t('landing.x.notif.from')}</span>
              <span>{t('landing.x.notif.now')}</span>
            </div>
            <p className="lx-notif__msg">{t('landing.x.notif.msg')}</p>
            <p className="lx-notif__event"><i className="fa-solid fa-arrow-right" /> {t('landing.x.notif.event')}</p>
          </div>

          <div className="lx-hero__content">
            <span className="lx-pill lx-reveal" style={{ '--i': 0 }}>
              <span className="lx-pill__dot" aria-hidden="true" />
              {t('landing.hero.badge')}
            </span>
            <h1 className="lx-h1 lx-reveal" style={{ '--i': 1 }}>
              {t('landing.hero.titleA')} <span className="lx-accent">{t('landing.hero.titleB')}</span> {t('landing.hero.titleC')}
            </h1>
            <p className="lx-lead lx-reveal" style={{ '--i': 2 }}>{t('landing.hero.subtitle')}</p>
            <div className="lx-actions lx-reveal" style={{ '--i': 3 }}>
              <button type="button" className="lx-btn lx-btn--primary lx-btn--lg" onClick={goRegister}>
                {t('landing.hero.cta1')}
                <LineIcon name="arrowRight" size={20} />
              </button>
              <a className="lx-btn lx-btn--ghost lx-btn--lg" {...anchor('como-funciona')}>{t('landing.hero.cta2')}</a>
            </div>
          </div>

          <div className="lx-hero__bottom">
            <div className="lx-hero__social">
              <span>{t('landing.x.heroChannels')}</span>
              <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>
            </div>
            <a className="lx-scroll" {...anchor('nosotros')}>
              {t('landing.x.scroll')}
              <span className="lx-scroll__arrow"><LineIcon name="arrowDown" size={18} /></span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ════════ 2 · NOSOTROS ════════ */}
        <section id="nosotros" className="lx-section lx-container lx-about" aria-labelledby="lx-about-title">
          <h2 id="lx-about-title" className="lx-about__title lx-reveal" style={{ '--i': 0 }}>
            <span>{t('landing.x.aboutTitleA')}</span>
            <span>{t('landing.x.aboutTitleB')}</span>
          </h2>
          <p className="lx-about__lead lx-reveal" style={{ '--i': 1 }}>{t('landing.x.aboutLead')}</p>
          <div className="lx-about__cta lx-reveal" style={{ '--i': 2 }}>
            <p>{t('landing.x.aboutInvite')}</p>
            <a className="lx-btn lx-btn--ghost lx-btn--sm" {...anchor('soporte')}>{t('landing.x.aboutInviteBtn')}</a>
          </div>
        </section>

        {/* ════════ 3 · MANIFIESTO (cómo funciona) ════════ */}
        <section id="como-funciona" className="lx-section lx-container" aria-labelledby="lx-manifesto-title">
          <div className="lx-panel lx-manifesto lx-reveal">
            <div className="lx-manifesto__text">
              <h2 id="lx-manifesto-title" className="lx-manifesto__title">
                <span className="lx-w300">{t('landing.x.manifestoA')}</span>
                <span className="lx-w600">{t('landing.x.manifestoB')}</span>
              </h2>
              <span className="lx-rule" aria-hidden="true" />
              <p className="lx-manifesto__p">{t('landing.how.subtitle')}</p>
              <ol className="lx-steps">
                {steps.map((s) => (
                  <li key={s.num}>
                    <span className="lx-num">{s.num}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <span className="lx-tag lx-manifesto__label">01 — {t('landing.x.manifestoLabel')}</span>
            </div>
            <div className="lx-manifesto__media">
              <img src={nebulosaPlaneta} alt={t('landing.x.manifestoAlt')} loading="lazy" decoding="async" />
            </div>
          </div>
        </section>

        {/* ════════ 3b · DEMO: del primer mensaje a la venta ════════ */}
        <section id="demo" className="lx-section lx-container" aria-labelledby="lx-demo-title">
          <ChatDemo />
        </section>

        {/* ════════ 4 · FUNCIONALIDADES (servicios) ════════ */}
        <section id="funcionalidades" className="lx-section lx-container" aria-labelledby="lx-services-title">
          <header className="lx-section__head lx-reveal">
            <span className="lx-tag">{t('landing.features.tag')}</span>
            <h2 id="lx-services-title" className="lx-h2">
              {t('landing.features.titleA')} <span className="lx-accent">{t('landing.features.titleB')}</span>{t('landing.features.titleC')}
            </h2>
          </header>
          <div className="lx-grid lx-grid--cards">
            {features.map((f, i) => (
              <article key={f.n} className="lx-card lx-service lx-reveal" style={{ '--i': i % 3 }}>
                <div className="lx-service__top">
                  <LineIcon name={f.icon} size={40} className="lx-service__icon" />
                  <span className="lx-num">0{f.n}</span>
                </div>
                <div>
                  <h3 className="lx-service__title">{f.title}</h3>
                  <p className="lx-service__desc">{f.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ════════ 5 · CANALES (trabajo) ════════ */}
        <section id="canales" className="lx-section lx-container" aria-labelledby="lx-work-title">
          <header className="lx-section__head lx-section__head--row lx-reveal">
            <div>
              <span className="lx-tag">{t('landing.x.workTag')}</span>
              <h2 id="lx-work-title" className="lx-h2">{t('landing.x.workTitle')}</h2>
            </div>
            <a className="lx-btn lx-btn--ghost" {...anchor('precios')}>{t('landing.x.workBtn')}</a>
          </header>
          <div className="lx-work">
            {work.map((w, i) => (
              <a key={w.n} href="/login?modo=registro"
                onClick={(e) => { e.preventDefault(); goRegister(); }}
                className={`lx-work__card lx-reveal${w.wide ? ' lx-work__card--wide' : ''}`} style={{ '--i': i }}>
                <img src={w.img} alt={w.alt} className="lx-work__scene" loading="lazy" decoding="async" />
                <span className="lx-work__shade" aria-hidden="true" />
                <span className="lx-work__meta">
                  <span className="lx-work__label">{w.label}</span>
                  <span className="lx-work__name">{w.name}</span>
                </span>
                {w.wide && (
                  <span className="lx-work__go" aria-hidden="true"><LineIcon name="arrowUpRight" size={22} /></span>
                )}
              </a>
            ))}
          </div>
        </section>

        {/* ════════ 6 · PRECIOS ════════ */}
        <section id="precios" className="lx-section lx-container" aria-labelledby="lx-pricing-title">
          <header className="lx-section__head lx-section__head--row lx-reveal">
            <div>
              <span className="lx-tag">{t('landing.pricing.tag')}</span>
              <h2 id="lx-pricing-title" className="lx-h2">
                {t('landing.pricing.titleA')} <span className="lx-accent">{t('landing.pricing.titleB')}</span>
              </h2>
              <p className="lx-section__sub">{t('landing.pricing.subtitle')}</p>
            </div>
            <a className="lx-btn lx-btn--ghost" {...anchor('soporte')}>{t('landing.x.pricingBtn')}</a>
          </header>
          <div className="lx-grid lx-grid--plans">
            {plans.map((p, i) => (
              <article key={p.key} className={`lx-card lx-plan lx-reveal${p.featured ? ' lx-plan--featured' : ''}`} style={{ '--i': i }}>
                <div className="lx-plan__top">
                  <span className="lx-num">0{i + 1}</span>
                  {p.badge && <span className="lx-plan__badge">{p.badge}</span>}
                </div>
                <h3 className="lx-plan__name">{p.name}</h3>
                <p className="lx-plan__tagline">{p.tagline}</p>
                <p className="lx-plan__price">
                  {p.precio
                    ? <><span className="lx-plan__amount">${p.precio}</span><span className="lx-plan__period">{t('landing.pricing.perMonth')}</span></>
                    : <span className="lx-plan__amount">{t('landing.pricing.freeLabel')}</span>}
                </p>
                <p className="lx-plan__devices">{p.dispositivos}</p>
                <ul className="lx-plan__list">
                  {p.beneficios.map((b, j) => (
                    <li key={j} className={p.mutedLast && j === 3 ? 'is-muted' : undefined}>
                      <LineIcon name={p.mutedLast && j === 3 ? 'minus' : 'check'} size={18} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`lx-btn ${p.featured ? 'lx-btn--primary' : 'lx-btn--ghost'} lx-plan__cta`}
                  onClick={() => (p.key === 'ENTERPRISE' ? scrollTo('soporte') : goRegister())}
                >
                  {p.cta}
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* ════════ 7 · SOPORTE ════════ */}
        <section id="soporte" className="lx-section lx-container" aria-labelledby="lx-support-title">
          <div className="lx-panel lx-support lx-reveal">
            <div className="lx-support__info">
              <span className="lx-tag">{t('landing.support.tag')}</span>
              <h2 id="lx-support-title" className="lx-h2">
                {t('landing.support.titleA')} <span className="lx-accent">{t('landing.support.titleB')}</span>{t('landing.support.titleC')}
              </h2>
              <p className="lx-section__sub">{t('landing.support.subtitle')}</p>
              <ul className="lx-support__list">
                <li><LineIcon name="mail" size={22} /><div><strong>{t('landing.support.emailLabel')}</strong><a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a></div></li>
                <li><LineIcon name="clock" size={22} /><div><strong>{t('landing.support.responseTime')}</strong><span>{t('landing.support.responseTimeVal')}</span></div></li>
                <li><LineIcon name="headset" size={22} /><div><strong>{t('landing.support.included')}</strong><span>{t('landing.support.includedVal')}</span></div></li>
                <li><LineIcon name="shield" size={22} /><div><strong>{t('landing.support.privacy')}</strong><span>{t('landing.support.privacyVal')}</span></div></li>
              </ul>
            </div>

            <form className="lx-form" onSubmit={handleSubmit}>
              <div className="lx-form__row">
                <label className="lx-field">
                  <span>{t('landing.support.formName')}</span>
                  <input type="text" name="nombre" autoComplete="name" placeholder={t('landing.support.formNamePh')} value={form.nombre} onChange={handleChange} required />
                </label>
                <label className="lx-field">
                  <span>{t('landing.support.formEmail')}</span>
                  <input type="email" name="email" autoComplete="email" placeholder={t('landing.support.formEmailPh')} value={form.email} onChange={handleChange} required />
                </label>
              </div>
              <label className="lx-field">
                <span>{t('landing.support.formSubject')}</span>
                <input type="text" name="asunto" placeholder={t('landing.support.formSubjectPh')} value={form.asunto} onChange={handleChange} />
              </label>
              <label className="lx-field">
                <span>{t('landing.support.formMessage')}</span>
                <textarea name="mensaje" rows={5} placeholder={t('landing.support.formMessagePh')} value={form.mensaje} onChange={handleChange} required />
              </label>
              <button type="submit" className="lx-btn lx-btn--ghost lx-btn--lg lx-form__submit">
                {t('landing.support.formSubmit')}
                <LineIcon name="arrowRight" size={20} />
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* ════════ 8 · CIERRE Y PIE ════════ */}
      <footer className="lx-closing">
        <SkyBackdrop className="lx-sky lx-closing__media" />
        <div className="lx-container lx-closing__inner">
          <div className="lx-closing__content">
            <h2 className="lx-closing__title lx-reveal">
              {t('landing.x.closingTitle')}<span className="lx-accent">.</span>
            </h2>
            <p className="lx-lead lx-reveal" style={{ '--i': 1 }}>{t('landing.x.closingText')}</p>
            <div className="lx-reveal" style={{ '--i': 2 }}>
              <button type="button" className="lx-btn lx-btn--primary lx-btn--lg" onClick={goRegister}>
                {t('landing.x.navStart')}
                <LineIcon name="arrowRight" size={20} />
              </button>
            </div>
          </div>

          <div className="lx-footer">
            <div className="lx-footer__left">
              <span>© {new Date().getFullYear()} OT CRM. {t('landing.footer.rights')}</span>
              <span>
                {t('landing.x.photoCredit')}{' '}
                <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Pexels</a>
              </span>
              <span className="lx-footer__team">
                {t('landing.x.madeBy')}{' '}
                {TEAM.map((m, i) => (
                  <React.Fragment key={m.name}>
                    {i > 0 && ' · '}
                    <a href={m.linkedin} target="_blank" rel="noopener noreferrer">{m.name}</a>
                    {' '}(<a href={m.github} target="_blank" rel="noopener noreferrer" aria-label={`GitHub · ${m.name}`}>GitHub</a>)
                  </React.Fragment>
                ))}
              </span>
            </div>
            <nav className="lx-footer__links" aria-label={t('landing.footer.nav')}>
              <a {...anchor('inicio')}>{t('landing.footer.navHome')}</a>
              <a {...anchor('como-funciona')}>{t('landing.footer.navHow')}</a>
              <a {...anchor('precios')}>{t('landing.footer.navPricing')}</a>
              <a {...anchor('soporte')}>{t('landing.footer.navSupport')}</a>
              <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>{t('landing.footer.login')}</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
