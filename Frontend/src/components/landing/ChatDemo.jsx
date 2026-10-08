import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LangContext';

/*
 * Demo de la landing: una conversación de WhatsApp que se reproduce sola al entrar
 * en pantalla y muestra cómo el lead avanza por el embudo (inspirado en el chat de
 * la sección "Strategy" de blink.capital). Es un ejemplo ilustrativo, sin cifras.
 *
 * - Cada paso aparece tras su demora; los pasos "typing" son transitorios.
 * - Con prefers-reduced-motion se muestra la conversación completa, sin animar.
 * - El log no anuncia nada (aria-live="off"): es una demo, no contenido en vivo.
 */
const SCRIPT = [
    { kind: 'in', key: 'm1', delay: 500 },
    { kind: 'event', key: 'e1', delay: 900, stage: 0 },
    { kind: 'typing', delay: 900 },
    { kind: 'out', key: 'm2', cmd: '/envios', delay: 1300 },
    { kind: 'in', key: 'm3', delay: 1500 },
    { kind: 'typing', delay: 900 },
    { kind: 'out', key: 'm4', delay: 1100 },
    { kind: 'event', key: 'e2', delay: 900, stage: 1 },
    { kind: 'in', key: 'm5', delay: 1500 },
    { kind: 'event', key: 'e3', delay: 1000, stage: 2, done: true },
];
const LAST = SCRIPT.length - 1;
const STEPS = [{ key: 's1', at: 1 }, { key: 's2', at: 3 }, { key: 's3', at: LAST }];

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function ChatDemo() {
    const { t } = useLanguage();
    const [frame, setFrame] = useState(-1);
    const rootRef = useRef(null);
    const timers = useRef([]);

    const play = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (reduceMotion()) { setFrame(LAST); return; }
        setFrame(-1);
        let at = 0;
        SCRIPT.forEach((step, i) => {
            at += step.delay;
            timers.current.push(setTimeout(() => setFrame(i), at));
        });
    }, []);

    // Arranca una sola vez, cuando el teléfono entra en pantalla (en móvil queda debajo del texto)
    useEffect(() => {
        const node = rootRef.current;
        if (!node) return undefined;
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { play(); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(node);
        const pending = timers.current;
        return () => { io.disconnect(); pending.forEach(clearTimeout); };
    }, [play]);

    const visible = SCRIPT.map((s, i) => ({ ...s, i }))
        .filter(s => s.i <= frame && (s.kind !== 'typing' || s.i === frame));
    const stageIdx = SCRIPT.slice(0, frame + 1).reduce((acc, s) => (s.stage !== undefined ? s.stage : acc), -1);
    const activeStep = STEPS.reduce((acc, s, i) => (frame >= s.at ? i : acc), -1);
    const stages = [t('landing.x.demo.stage1'), t('landing.x.demo.stage2'), t('landing.x.demo.stage3')];

    return (
        <div className="lx-demo">
            <div className="lx-demo__text">
                <span className="lx-tag">{t('landing.x.demo.tag')}</span>
                <h2 id="lx-demo-title" className="lx-h2">
                    {t('landing.x.demo.titleA')} <span className="lx-accent">{t('landing.x.demo.titleB')}</span>
                </h2>
                <p className="lx-section__sub">{t('landing.x.demo.sub')}</p>
                <ol className="lx-demo__steps">
                    {STEPS.map((s, i) => (
                        <li key={s.key} className={i === activeStep ? 'is-active' : i < activeStep ? 'is-done' : undefined}>
                            <span className="lx-num">0{i + 1}</span>
                            <span>
                                <strong>{t(`landing.x.demo.${s.key}Title`)}</strong>
                                <span>{t(`landing.x.demo.${s.key}Desc`)}</span>
                            </span>
                        </li>
                    ))}
                </ol>
                <button type="button" className="lx-btn lx-btn--ghost lx-btn--sm" onClick={play} disabled={frame >= 0 && frame < LAST}>
                    {t('landing.x.demo.replay')}
                </button>
            </div>

            <div className="lx-phone" ref={rootRef} aria-labelledby="lx-demo-title">
                <div className="lx-phone__head">
                    <span className="lx-phone__avatar" aria-hidden="true">C</span>
                    <span className="lx-phone__who">
                        <strong>{t('landing.x.demo.customer')}</strong>
                        <span><i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp</span>
                    </span>
                    <span className={`lx-phone__stage${stageIdx === 2 ? ' is-done' : ''}`}>
                        {stageIdx >= 0 ? stages[stageIdx] : t('landing.x.demo.noStage')}
                    </span>
                </div>
                <ol className="lx-phone__log" role="log" aria-live="off" aria-label={t('landing.x.demo.logLabel')}>
                    {visible.map(s => {
                        if (s.kind === 'typing') {
                            return (
                                <li key={`typing-${s.i}`} className="lx-msg lx-msg--out lx-msg--typing" aria-hidden="true">
                                    <span /><span /><span />
                                </li>
                            );
                        }
                        if (s.kind === 'event') {
                            return (
                                <li key={s.key} className={`lx-event${s.done ? ' is-done' : ''}`}>
                                    <i className={`fa-solid ${s.done ? 'fa-circle-check' : 'fa-arrow-right'}`} aria-hidden="true" />
                                    {t(`landing.x.demo.${s.key}`)}
                                </li>
                            );
                        }
                        return (
                            <li key={s.key} className={`lx-msg lx-msg--${s.kind}`}>
                                {s.cmd && <span className="lx-msg__cmd">{t('landing.x.demo.quickReply')} {s.cmd}</span>}
                                {t(`landing.x.demo.${s.key}`)}
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}
