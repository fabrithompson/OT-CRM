import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LangContext';

export default function AgenteIA() {
    const { t } = useLanguage();
    const { usuario, loading: userLoading } = useUser();
    const navigate = useNavigate();

    const isEnterprise = usuario?.plan?.nombre === 'ENTERPRISE';

    // Config state
    const [instructions, setInstructions] = useState('');
    const [businessContext, setBusinessContext] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved

    // Chat state
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!isEnterprise || userLoading) return;
        setMessages([{ role: 'assistant', content: t('agente.welcomeMsg') }]);
        api.get('/agent-config').then(res => {
            setInstructions(res.data.instructions || '');
            setBusinessContext(res.data.businessContext || '');
            setEnabled(res.data.enabled || false);
        }).catch(() => {});
    }, [isEnterprise, userLoading, t]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || chatLoading) return;
        const newMessages = [...messages, { role: 'user', content: text }];
        setMessages(newMessages);
        setInput('');
        setChatLoading(true);
        try {
            const res = await api.post('/agent-config/chat', { messages: newMessages });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: t('agente.errorMsg') }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
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
        return <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.loading')}</span>
        </div>;
    }

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* Gate modal for non-enterprise users */}
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

            {/* Page header */}
            <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                    <i className="fa-solid fa-robot" style={{ marginRight: 10, color: '#22d3ee' }} />
                    {t('agente.title')}
                </h1>
                <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                    {t('agente.subtitle')}
                </p>
            </div>

            {/* Two-column layout */}
            <div style={{
                display: 'flex', gap: 20, flex: 1,
                padding: '20px 28px 24px', overflow: 'hidden',
                minHeight: 0,
            }}>

                {/* Left: Setup chat */}
                <div style={{
                    flex: '0 0 55%', display: 'flex', flexDirection: 'column',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 16, overflow: 'hidden', minHeight: 0,
                }}>
                    <div style={{
                        padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        flexShrink: 0,
                    }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            <i className="fa-solid fa-comments" style={{ marginRight: 8, color: '#22d3ee' }} />
                            {t('agente.chatTitle')}
                        </span>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '80%',
                                    padding: '10px 14px',
                                    borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                    background: msg.role === 'user'
                                        ? 'rgba(34,211,238,0.15)'
                                        : 'rgba(255,255,255,0.06)',
                                    border: msg.role === 'user'
                                        ? '1px solid rgba(34,211,238,0.25)'
                                        : '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.55,
                                    color: 'rgba(255,255,255,0.9)',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                    padding: '10px 16px',
                                    borderRadius: '14px 14px 14px 2px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)',
                                }}>
                                    <i className="fa-solid fa-ellipsis fa-fade" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
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
                                flex: 1, resize: 'none', fontSize: '0.9rem',
                                padding: '10px 14px', borderRadius: 10,
                            }}
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

                {/* Right: Config panel */}
                <div style={{
                    flex: '0 0 calc(45% - 20px)', display: 'flex', flexDirection: 'column', gap: 16,
                    overflowY: 'auto', minHeight: 0,
                }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 16, padding: '20px',
                    }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600 }}>
                            <i className="fa-solid fa-sliders" style={{ marginRight: 8, color: '#22d3ee' }} />
                            {t('agente.configTitle')}
                        </h3>

                        {/* Enabled toggle */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 16px', borderRadius: 12,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            marginBottom: 16,
                        }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('agente.enabledLabel')}</div>
                                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem', marginTop: 2 }}>{t('agente.enabledSub')}</div>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: 46, height: 26, cursor: 'pointer' }}>
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
                                        position: 'absolute',
                                        top: 3, left: enabled ? 23 : 3,
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: '#fff', transition: '0.2s',
                                    }} />
                                </span>
                            </label>
                        </div>

                        {/* Instructions */}
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

                        {/* Business context */}
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
                            {saveStatus === 'saving' && <i className="fa-solid fa-spinner fa-spin" />}
                            {saveStatus === 'saved' && <i className="fa-solid fa-check" />}
                            {saveStatus === 'idle' && <i className="fa-solid fa-floppy-disk" />}
                            {saveStatus === 'saving' ? t('agente.saving')
                                : saveStatus === 'saved' ? t('agente.saved')
                                : t('agente.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
