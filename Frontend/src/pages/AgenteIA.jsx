import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';
import '../assets/css/dashboard.css';

const chatKey = (id) => `crm_agente_chat_${id}`;

export default function AgenteIA() {
    const { t } = useLanguage();
    const { usuario, agenciaId, loading: userLoading } = useUser();
    const navigate = useNavigate();

    const isEnterprise = usuario?.plan?.nombre === 'ENTERPRISE';

    const [instructions, setInstructions] = useState('');
    const [businessContext, setBusinessContext] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [saveStatus, setSaveStatus] = useState('idle');

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const chatReady = useRef(false);

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

    useEffect(() => {
        if (!agenciaId || !chatReady.current || messages.length === 0) return;
        localStorage.setItem(chatKey(agenciaId), JSON.stringify(messages));
    }, [messages, agenciaId]);

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

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || chatLoading) return;
        const next = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setChatLoading(true);
        try {
            const res = await api.post('/agent-config/chat', { messages: next });
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

    if (userLoading) {
        return (
            <div className="db-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.loading')}</span>
            </div>
        );
    }

    return (
        <div
            className="db-root"
            style={{ '--db-accent': '#22d3ee', height: '100%', overflow: 'hidden' }}
        >
            {/* Gate modal */}
            {!isEnterprise && (
                <div className="db-modal-overlay">
                    <div className="db-modal" style={{ textAlign: 'center', maxWidth: 440 }}>
                        <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🤖</div>
                        <h3 style={{ color: '#fff', marginBottom: 10 }}>{t('agente.gateTitle')}</h3>
                        <p>{t('agente.gateMsg')}</p>
                        <div className="db-modal-actions" style={{ justifyContent: 'center' }}>
                            <button className="btn-secondary" onClick={() => navigate(-1)}>
                                {t('agente.gateClose')}
                            </button>
                            <button className="btn-primary" onClick={() => navigate('/planes')}>
                                <i className="fa-solid fa-crown" style={{ marginRight: 6 }} />
                                {t('agente.gateUpgrade')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Topbar */}
            <div className="db-topbar" style={{ flexShrink: 0 }}>
                <div>
                    <div className="db-greeting" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.45rem)' }}>
                        <i className="fa-solid fa-robot" style={{ marginRight: 10, color: '#22d3ee' }} />
                        {t('agente.title')}
                    </div>
                    <div className="db-subtitle">{t('agente.subtitle')}</div>
                </div>
                {enabled && (
                    <div className="db-online-badge" style={{
                        background: 'rgba(34,211,238,0.10)',
                        borderColor: 'rgba(34,211,238,0.20)',
                        color: '#22d3ee',
                    }}>
                        <span className="db-online-dot" style={{ background: '#22d3ee' }} />
                        {t('agente.active')}
                    </div>
                )}
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* LEFT: Chat panel */}
                <div className="db-card" style={{
                    flex: '0 0 57%', padding: 0, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', gap: 0,
                }}>
                    <div style={{
                        padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <div className="db-card-title" style={{ margin: 0 }}>
                            <i className="fa-solid fa-comments" style={{ color: '#22d3ee' }} />
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

                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '16px 18px',
                        display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '80%', padding: '10px 14px',
                                    borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                    background: msg.role === 'user' ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
                                    border: msg.role === 'user' ? '1px solid rgba(34,211,238,0.22)' : '1px solid rgba(255,255,255,0.07)',
                                    fontSize: '0.88rem', lineHeight: 1.6,
                                    color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                    padding: '10px 16px', borderRadius: '14px 14px 14px 2px',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                                    fontSize: '0.88rem', color: 'rgba(255,255,255,0.4)',
                                }}>
                                    <i className="fa-solid fa-ellipsis fa-fade" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div style={{
                        padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', gap: 10, flexShrink: 0,
                    }}>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('agente.inputPlaceholder')}
                            rows={2}
                            style={{
                                flex: 1, resize: 'none', fontSize: '0.88rem',
                                padding: '10px 14px', borderRadius: 10,
                                background: 'rgba(0,0,0,0.28)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                color: '#fff', outline: 'none',
                                fontFamily: 'Montserrat, sans-serif', lineHeight: 1.5,
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || chatLoading}
                            style={{
                                padding: '0 18px', borderRadius: 10, border: 'none',
                                background: input.trim() && !chatLoading ? '#22d3ee' : 'rgba(255,255,255,0.08)',
                                color: input.trim() && !chatLoading ? '#000' : 'rgba(255,255,255,0.25)',
                                cursor: input.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                                fontWeight: 700, fontSize: '1rem', transition: '0.2s',
                                alignSelf: 'flex-end', height: 44, flexShrink: 0,
                            }}
                        >
                            <i className="fa-solid fa-paper-plane" />
                        </button>
                    </div>
                </div>

                {/* RIGHT: Config column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', minHeight: 0 }}>

                    {/* Toggle card — db-metric-card with top accent line */}
                    <div className="db-metric-card" style={{
                        flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 0,
                    }}>
                        <div className="db-metric-icon">
                            <i className="fa-solid fa-robot" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className="db-metric-label">{t('agente.enabledLabel')}</div>
                            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>
                                {t('agente.enabledSub')}
                            </div>
                        </div>
                        <label style={{
                            position: 'relative', display: 'inline-block',
                            width: 46, height: 26, cursor: 'pointer', flexShrink: 0,
                        }}>
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={e => setEnabled(e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                            />
                            <span style={{
                                position: 'absolute', inset: 0, borderRadius: 13,
                                background: enabled ? '#22d3ee' : 'rgba(255,255,255,0.15)',
                                transition: '0.2s',
                            }}>
                                <span style={{
                                    position: 'absolute', top: 3, left: enabled ? 23 : 3,
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: '#fff', transition: '0.2s',
                                }} />
                            </span>
                        </label>
                    </div>

                    {/* Instructions + Context + Save */}
                    <div className="db-card" style={{ flex: 1, gap: 14 }}>
                        <div className="db-card-title" style={{ margin: 0 }}>
                            <i className="fa-solid fa-sliders" style={{ color: '#22d3ee' }} />
                            {t('agente.configTitle')}
                        </div>

                        <div>
                            <div className="db-metric-label" style={{ marginBottom: 8 }}>
                                {t('agente.instructionsLabel')}
                            </div>
                            <textarea
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                placeholder={t('agente.instructionsPlaceholder')}
                                rows={5}
                                style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <div className="db-metric-label" style={{ marginBottom: 8 }}>
                                {t('agente.contextLabel')}
                            </div>
                            <textarea
                                value={businessContext}
                                onChange={e => setBusinessContext(e.target.value)}
                                placeholder={t('agente.contextPlaceholder')}
                                rows={4}
                                style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', boxSizing: 'border-box' }}
                            />
                        </div>

                        <button
                            onClick={saveConfig}
                            disabled={saveStatus === 'saving'}
                            className="btn-primary"
                            style={{ width: '100%', marginTop: 'auto' }}
                        >
                            <i className={`fa-solid ${saveStatus === 'saving' ? 'fa-spinner fa-spin' : saveStatus === 'saved' ? 'fa-check' : 'fa-floppy-disk'}`} style={{ marginRight: 6 }} />
                            {saveStatus === 'saving' ? t('agente.saving') : saveStatus === 'saved' ? t('agente.saved') : t('agente.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
