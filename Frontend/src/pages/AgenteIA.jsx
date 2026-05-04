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

    // Init messages from localStorage once agenciaId is known
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

    // Persist chat on every change
    useEffect(() => {
        if (!agenciaId || !chatReady.current || messages.length === 0) return;
        localStorage.setItem(chatKey(agenciaId), JSON.stringify(messages));
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
            style={{ '--db-accent': '#22d3ee', height: '100%', overflow: 'hidden', gap: 0 }}
        >
            {/* Gate modal */}
            {!isEnterprise && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        background: 'var(--card-bg, #161b22)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 20, padding: '40px 36px', maxWidth: 420, width: '90%',
                        textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🤖</div>
                        <h2 style={{ margin: '0 0 12px', fontSize: '1.3rem', fontWeight: 700 }}>
                            {t('agente.gateTitle')}
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem', margin: '0 0 28px', lineHeight: 1.5 }}>
                            {t('agente.gateMsg')}
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
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
                    <div className="db-online-badge">
                        <span className="db-online-dot" />
                        {t('agente.active')}
                    </div>
                )}
            </div>

            {/* Two-column layout */}
            <div style={{
                display: 'flex', gap: 20, flex: 1,
                padding: '0 28px 24px', overflow: 'hidden', minHeight: 0,
            }}>
                {/* Chat panel */}
                <div className="db-card" style={{
                    flex: '0 0 55%', display: 'flex', flexDirection: 'column',
                    padding: 0, overflow: 'hidden', minHeight: 0,
                }}>
                    <div style={{
                        padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <span className="db-card-title" style={{ fontSize: '0.8rem' }}>
                            <i className="fa-solid fa-comments" style={{ marginRight: 8, color: '#22d3ee', opacity: 1 }} />
                            {t('agente.chatTitle')}
                        </span>
                        <button
                            type="button"
                            onClick={clearChat}
                            title={t('agente.clearChat')}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'rgba(255,255,255,0.35)', padding: '4px 6px',
                                borderRadius: 6, fontSize: '0.8rem', transition: '0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
                        >
                            <i className="fas fa-trash-alt" />
                        </button>
                    </div>

                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '16px 18px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '80%', padding: '10px 14px',
                                    borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                    background: msg.role === 'user' ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.06)',
                                    border: msg.role === 'user' ? '1px solid rgba(34,211,238,0.25)' : '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '0.9rem', lineHeight: 1.55,
                                    color: 'rgba(255,255,255,0.9)', whiteSpace: 'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                    padding: '10px 16px', borderRadius: '14px 14px 14px 2px',
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)',
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
                            style={{ flex: 1, resize: 'none', fontSize: '0.9rem', padding: '10px 14px', borderRadius: 10 }}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || chatLoading}
                            style={{
                                padding: '0 18px', borderRadius: 10, border: 'none',
                                background: input.trim() && !chatLoading ? '#22d3ee' : 'rgba(255,255,255,0.1)',
                                color: input.trim() && !chatLoading ? '#000' : 'rgba(255,255,255,0.3)',
                                cursor: input.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                                fontWeight: 700, fontSize: '0.95rem', transition: '0.2s',
                                alignSelf: 'flex-end', height: 44,
                            }}
                        >
                            <i className="fa-solid fa-paper-plane" />
                        </button>
                    </div>
                </div>

                {/* Config panel */}
                <div style={{
                    flex: '0 0 calc(45% - 20px)', display: 'flex', flexDirection: 'column',
                    gap: 16, overflowY: 'auto', minHeight: 0,
                }}>
                    <div className="db-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <i className="fa-solid fa-sliders" style={{ color: '#22d3ee' }} />
                            <span className="db-card-title">{t('agente.configTitle')}</span>
                        </div>

                        <div className="db-metric-card" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 16,
                        }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('agente.enabledLabel')}</div>
                                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem', marginTop: 2 }}>
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

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                                {t('agente.instructionsLabel')}
                            </label>
                            <textarea
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                placeholder={t('agente.instructionsPlaceholder')}
                                rows={5}
                                style={{ resize: 'vertical', fontSize: '0.875rem' }}
                            />
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                                {t('agente.contextLabel')}
                            </label>
                            <textarea
                                value={businessContext}
                                onChange={e => setBusinessContext(e.target.value)}
                                placeholder={t('agente.contextPlaceholder')}
                                rows={4}
                                style={{ resize: 'vertical', fontSize: '0.875rem' }}
                            />
                        </div>

                        <button
                            onClick={saveConfig}
                            disabled={saveStatus === 'saving'}
                            className="btn-primary"
                            style={{ width: '100%' }}
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
