import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../utils/api';
import { clickable } from '../utils/a11y';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';
import '../assets/css/dashboard.css';
import '../assets/css/pages/AgenteIA.css';

const chatKey = (id) => `crm_agente_chat_${id}`;
const MAX_IMAGES = 4;

export default function AgenteIA() {
    const { t } = useLanguage();
    const { usuario, agenciaId, loading: userLoading } = useUser();

    // Fallback al chequeo por nombre si el backend (versión vieja) no envía el flag.
    const isEnterprise = usuario?.plan?.agenteIaHabilitado === true
        || usuario?.plan?.nombre === 'ENTERPRISE';

    const [instructions, setInstructions] = useState('');
    const [businessContext, setBusinessContext] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [saveStatus, setSaveStatus] = useState('idle');

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [pendingImages, setPendingImages] = useState([]);

    const messagesEndRef = useRef(null);
    const chatReady = useRef(false);
    const fileInputRef = useRef(null);

    // Init messages from localStorage (bootstrap on mount).
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isEnterprise || userLoading || !agenciaId || chatReady.current) return;
        chatReady.current = true;
        try {
            const saved = JSON.parse(localStorage.getItem(chatKey(agenciaId)) || '[]');
            setMessages(saved.length > 0 ? saved : [{ role: 'assistant', content: t('agente.welcomeMsg') }]);
        } catch {
            setMessages([{ role: 'assistant', content: t('agente.welcomeMsg') }]);
        }
    }, [isEnterprise, userLoading, agenciaId, t]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Persist chat — strip images to keep localStorage lean
    useEffect(() => {
        if (!agenciaId || !chatReady.current || messages.length === 0) return;
        const toSave = messages.map(({ role, content }) => ({ role, content }));
        localStorage.setItem(chatKey(agenciaId), JSON.stringify(toSave));
    }, [messages, agenciaId]);

    // Load agent config
    useEffect(() => {
        if (!isEnterprise || userLoading) return;
        api.get('/agent-config').then(res => {
            setInstructions(res.data.instructions || '');
            setBusinessContext(res.data.businessContext || '');
            setEnabled(res.data.enabled || false);
        }).catch(() => {});
    }, [isEnterprise, userLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const clearChat = useCallback(() => {
        const welcome = [{ role: 'assistant', content: t('agente.welcomeMsg') }];
        setMessages(welcome);
        if (agenciaId) localStorage.setItem(chatKey(agenciaId), JSON.stringify(welcome));
    }, [t, agenciaId]);

    const handleImageSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const remaining = MAX_IMAGES - pendingImages.length;
        files.slice(0, remaining).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                setPendingImages(prev => prev.length < MAX_IMAGES
                    ? [...prev, { previewUrl: dataUrl, base64: dataUrl, mimeType: file.type || 'image/jpeg' }]
                    : prev
                );
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeImage = (idx) => {
        setPendingImages(prev => prev.filter((_, i) => i !== idx));
    };

    const sendMessage = async () => {
        const text = input.trim();
        const hasImages = pendingImages.length > 0;
        if (!text && !hasImages) return;
        if (chatLoading) return;

        // Display message with preview URLs (in-memory only)
        const displayMsg = {
            role: 'user',
            content: text,
            ...(hasImages ? { mediaUrls: pendingImages.map(i => i.previewUrl) } : {}),
        };
        const nextMessages = [...messages, displayMsg];
        setMessages(nextMessages);
        setInput('');

        // Build API payload: full history as text + images only on current message
        const apiPayload = nextMessages.map((m, idx) => ({
            role: m.role,
            content: m.content,
            ...(idx === nextMessages.length - 1 && hasImages
                ? { images: pendingImages.map(i => ({ base64: i.base64, mimeType: i.mimeType })) }
                : {}),
        }));

        setPendingImages([]);
        setChatLoading(true);
        try {
            const res = await api.post('/agent-config/chat', { messages: apiPayload });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: t('agente.errorMsg') }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const saveConfig = async () => {
        setSaveStatus('saving');
        try {
            await api.put('/agent-config', { instructions, businessContext, enabled });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
            setSaveStatus('idle');
        }
    };

    // Wait until user AND plan are confirmed loaded before making access decision
    if (userLoading || !usuario || !usuario.plan) {
        return (
            <div className="db-root agt-1">
                <span className="agt-2">{t('common.loading')}</span>
            </div>
        );
    }

    if (!isEnterprise) {
        return <Navigate to="/planes" replace />;
    }

    return (
        <div
            className="db-root agente-scope agt-3"
            style={{ '--db-accent': '#22d3ee' }}
        >
            <style>{`
                /* Cards con fondo morado oscuro translúcido (scoped a esta página) */
                .agente-scope .db-card,
                .agente-scope .db-metric-card {
                    background: rgba(24,18,38,0.72);
                    border-color: rgba(167,139,250,0.12);
                }
                .agente-scope .db-card:hover,
                .agente-scope .db-metric-card:hover {
                    border-color: rgba(167,139,250,0.26);
                }
            `}</style>
            {/* Topbar */}
            <div className="db-topbar agt-4">
                <div>
                    <div className="db-greeting agt-5">
                        <i className="fa-solid fa-robot agt-6" />
                        {t('agente.title')}
                    </div>
                    <div className="db-subtitle">{t('agente.subtitle')}</div>
                </div>
                {enabled && (
                    <div className="db-online-badge agt-7">
                        <span className="db-online-dot agt-8" />
                        {t('agente.active')}
                    </div>
                )}
            </div>

            {/* Two-column layout */}
            <div className="agt-9">

                {/* LEFT: Chat panel */}
                <div className="db-card agt-10">
                    {/* Chat header */}
                    <div className="agt-11">
                        <div className="db-card-title agt-12">
                            <i className="fa-solid fa-comments agt-13" />
                            {t('agente.chatTitle')}
                        </div>
                        <button
                            type="button"
                            onClick={clearChat}
                            title={t('agente.clearChat')}
                            className="db-copy-btn"
                        >
                            <i className="fas fa-trash-alt" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="agt-14">
                        {messages.map((msg, i) => (
                            <div className="agt-15" key={i} style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div className="agt-16" style={{ borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px', background: msg.role === 'user' ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)', border: msg.role === 'user' ? '1px solid rgba(34,211,238,0.22)' : '1px solid rgba(255,255,255,0.07)' }}>
                                    {/* Image thumbnails */}
                                    {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                                        <div className="agt-17" style={{ marginBottom: msg.content ? 8 : 0 }}>
                                            {msg.mediaUrls.map((url, j) => (
                                                <img className="agt-18"
                                                    key={j}
                                                    src={url}
                                                    alt=""
                                                    {...clickable(() => window.open(url, '_blank'), { label: `${t('agente.openImage')} ${j + 1}` })}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {msg.content && (
                                        <span className="agt-19">{msg.content}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="agt-20">
                                <div className="agt-21">
                                    <i className="fa-solid fa-ellipsis fa-fade" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Pending images strip */}
                    {pendingImages.length > 0 && (
                        <div className="agt-22">
                            {pendingImages.map((img, i) => (
                                <div className="agt-23" key={i}>
                                    <img className="agt-24"
                                        src={img.previewUrl}
                                        alt=""
                                    />
                                    <button className="agt-25"
                                        type="button"
                                        onClick={() => removeImage(i)}
                                    >×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Input area */}
                    <div className="agt-26">
                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleImageSelect}
                        />

                        {/* Image attach button */}
                        <button className="agt-27"
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            title={t('agente.attachImage')}
                            disabled={pendingImages.length >= MAX_IMAGES}
                            style={{ background: pendingImages.length > 0
                                    ? 'rgba(34,211,238,0.12)'
                                    : 'rgba(255,255,255,0.05)', color: pendingImages.length > 0
                                    ? '#22d3ee'
                                    : 'rgba(255,255,255,0.40)', cursor: pendingImages.length >= MAX_IMAGES ? 'not-allowed' : 'pointer' }}
                        >
                            <i className="fas fa-image" />
                        </button>

                        <textarea className="agt-28" aria-label={t('agente.inputPlaceholder')}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('agente.inputPlaceholder')}
                            rows={2}
                        />

                        <button className="agt-29"
                            onClick={sendMessage}
                            disabled={(!input.trim() && !pendingImages.length) || chatLoading}
                            style={{ background: (input.trim() || pendingImages.length) && !chatLoading
                                    ? '#22d3ee' : 'rgba(255,255,255,0.08)', color: (input.trim() || pendingImages.length) && !chatLoading
                                    ? '#000' : 'rgba(255,255,255,0.25)', cursor: (input.trim() || pendingImages.length) && !chatLoading
                                    ? 'pointer' : 'not-allowed' }}
                        >
                            <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                            <span className="ui-sr-only">{t('agente.send')}</span>
                        </button>
                    </div>

                    {/* Image hint */}
                    <div className="agt-30">
                        <i className="fas fa-lightbulb agt-31" />
                        {t('agente.imageHint')}
                    </div>
                </div>

                {/* RIGHT: Config column */}
                <div className="agt-32">

                    {/* Toggle card — db-metric-card with top accent line */}
                    <div className="db-metric-card agt-33">
                        <div className="db-metric-icon">
                            <i className="fa-solid fa-robot" />
                        </div>
                        <div className="agt-34">
                            <div className="db-metric-label">{t('agente.enabledLabel')}</div>
                            <div className="agt-35">
                                {t('agente.enabledSub')}
                            </div>
                        </div>
                        <label className="agt-36">
                            <input className="agt-37"
                                type="checkbox"
                                role="switch"
                                aria-label={t('agente.enabledLabel')}
                                checked={enabled}
                                onChange={e => setEnabled(e.target.checked)}
                            />
                            <span className="agt-38" style={{ background: enabled ? '#22d3ee' : 'rgba(255,255,255,0.15)' }}>
                                <span className="agt-39" style={{ left: enabled ? 23 : 3 }} />
                            </span>
                        </label>
                    </div>

                    {/* Instructions + Context + Save */}
                    <div className="db-card agt-40">
                        <div className="db-card-title agt-12">
                            <i className="fa-solid fa-sliders agt-13" />
                            {t('agente.configTitle')}
                        </div>

                        <div>
                            <div className="db-metric-label agt-41">
                                {t('agente.instructionsLabel')}
                            </div>
                            <textarea className="agt-42" aria-label={t('agente.instructionsLabel')}
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                placeholder={t('agente.instructionsPlaceholder')}
                            />
                        </div>

                        <div>
                            <div className="db-metric-label agt-41">
                                {t('agente.contextLabel')}
                            </div>
                            <textarea className="agt-43" aria-label={t('agente.contextLabel')}
                                value={businessContext}
                                onChange={e => setBusinessContext(e.target.value)}
                                placeholder={t('agente.contextPlaceholder')}
                            />
                        </div>

                        <button
                            onClick={saveConfig}
                            disabled={saveStatus === 'saving'}
                            className="btn-primary agt-44"
                        >
                            <i className={`fa-solid ${saveStatus === 'saving' ? 'fa-spinner fa-spin' : saveStatus === 'saved' ? 'fa-check' : 'fa-floppy-disk'} agt-45`} />
                            {saveStatus === 'saving' ? t('agente.saving') : saveStatus === 'saved' ? t('agente.saved') : t('agente.save')}
                        </button>
                    </div>
                    {/* La sección del Auditor de procedimientos se movió a /auditoria
                        (tab "Configuración") para concentrar todo el módulo en un solo
                        lugar. Ver docs/auditor-ia.md (Fase 7). */}

                </div>
            </div>
        </div>
    );
}
