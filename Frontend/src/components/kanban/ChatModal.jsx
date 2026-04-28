import React, { useState, useEffect, useRef, useCallback } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import api, { formatTime, formatDate, getAuthHeaders } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LangContext';
import useSlashCommands, { SlashMenu } from './SlashCommandMenu';

const FORMAT_BYTES = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};

const COLORS_TAG = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#ffffff', '#a855f7'];

export default function ChatModal({ clienteId, etapas, stompClient, usuario, onClose, onMoveCard, onUpdateCard }) {
    const { t, lang } = useLanguage();
    const toast = useToast();
    const [cliente, setCliente]           = useState(null);
    const [messages, setMessages]         = useState([]);
    const [loading, setLoading]           = useState(false);
    const [msgInput, setMsgInput]         = useState('');
    const { suggestions, activeIdx, apply, handleKeyDown: slashKeyDown } = useSlashCommands(msgInput, setMsgInput);
    const [newTagName, setNewTagName]     = useState('');
    const [tagColor, setTagColor]         = useState('#10b981');
    const [isRecording, setIsRecording]   = useState(false);
    const [showEmoji, setShowEmoji]       = useState(false);
    const [showAttach, setShowAttach]     = useState(false);
    const [showStageDD, setShowStageDD]   = useState(false);
    const [msgCursor, setMsgCursor]       = useState(null);
    const [msgExhausted, setMsgExhausted] = useState(false);
    const [media, setMedia]               = useState([]);
    const [montoInput, setMontoInput]     = useState('');
    const [isDragging, setIsDragging]       = useState(false);
    const [pendingFiles, setPendingFiles]   = useState([]);
    const [activeFileIdx, setActiveFileIdx] = useState(0);
    const [captionInput, setCaptionInput]   = useState('');

    const messagesEndRef    = useRef(null);
    const dragCounterRef    = useRef(0);
    const addFileInputRef   = useRef(null);
    const emojiRef          = useRef(null);
    const messagesAreaRef   = useRef(null);
    const mediaRecorderRef  = useRef(null);
    const audioChunksRef    = useRef([]);
    const subscriptionsRef  = useRef([]);

    useEffect(() => {
        if (!clienteId) return;
        loadChat(clienteId);
        return () => {
            subscriptionsRef.current.forEach(s => s.unsubscribe());
            subscriptionsRef.current = [];
        };
    }, [clienteId]);

    const handleInboundMessage = (ev) => {
        const m = { ...ev, esSalida: !ev.inbound, fechaHora: ev.fecha };
        setMessages(prev => {
            if (m.whatsappId && prev.some(x => x.whatsappId === m.whatsappId)) return prev;
            if (m.esSalida) {
                const tempIdx = prev.findIndex(x => typeof x.id === 'string' && x.id.startsWith('temp-'));
                if (tempIdx !== -1) return prev.map((x, i) => i === tempIdx ? m : x);
            }
            return [...prev, m];
        });
        if (!m.esSalida) scrollToBottom();
    };

    const handleStatusUpdate = (ev) => {
        setMessages(prev => prev.map(m => m.whatsappId === ev.whatsappId ? { ...m, estado: ev.nuevoEstado } : m));
    };

    const subscribeWS = (id, attempt = 0) => {
        if (!stompClient?.connected) {
            if (attempt < 10) setTimeout(() => subscribeWS(id, attempt + 1), 500 + attempt * 300);
            return;
        }
        subscriptionsRef.current.forEach(s => { try { s.unsubscribe(); } catch {} });
        const s1 = stompClient.subscribe(`/topic/chat/${id}`, (msg) => { try { handleInboundMessage(JSON.parse(msg.body)); } catch {} });
        const s2 = stompClient.subscribe(`/topic/chat/${id}/status`, (msg) => { try { handleStatusUpdate(JSON.parse(msg.body)); } catch {} });
        subscriptionsRef.current = [s1, s2];
    };

    const loadChat = async (id, attempt = 0) => {
        setLoading(true);
        if (attempt === 0) { setMessages([]); setMedia([]); }
        try {
            const [resC, resM] = await Promise.allSettled([
                api.get(`/clientes/${id}`),
                api.get(`/chat/${id}/historial?size=50`)
            ]);
            if (resC.status === 'rejected' || resM.status === 'rejected') {
                throw new Error(resC.reason?.message || resM.reason?.message || 'Error cargando chat');
            }
            setCliente(resC.value.data);
            const msgs = resM.value.data;
            setMessages(msgs);
            if (msgs.length > 0) {
                setMsgCursor(msgs[0].id);
                setMsgExhausted(msgs.length < 50);
            } else {
                setMsgExhausted(true);
            }
            setMedia(msgs.filter(m => (m.tipo === 'IMAGEN' || m.tipo === 'VIDEO') && m.urlArchivo));
            markRead(id);
            subscribeWS(id);
        } catch (e) {
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                return loadChat(id, attempt + 1);
            }
            toast('Error', 'No se pudo abrir el chat', '#ef4444');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const markRead = async (id) => {
        try {
            await api.put(`/clientes/${id}/leido`);
            onUpdateCard?.(id, { mensajesSinLeer: 0 });
        } catch { }
    };

    const loadOlder = async () => {
        if (msgExhausted || !msgCursor || !clienteId) return;
        try {
            const res = await api.get(`/chat/${clienteId}/historial?beforeId=${msgCursor}&size=50`);
            const older = res.data;
            if (older.length > 0) setMsgCursor(older[0].id);
            if (older.length < 50) setMsgExhausted(true);
            setMessages(prev => [...older, ...prev]);
        } catch { }
    };

    const scrollToBottom = () => { setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); };
    useEffect(() => { if (!loading) scrollToBottom(); }, [messages.length, loading]);

    const sendMessage = async () => {
        const text = msgInput.trim();
        if (!text || !clienteId) return;
        setMsgInput('');
        const tempId = `temp-${Date.now()}`;
        const optimistic = { id: tempId, contenido: text, esSalida: true, autor: usuario || 'Agente', fechaHora: new Date().toISOString(), tipo: 'TEXTO', estado: 'SENDING' };
        setMessages(prev => [...prev, optimistic]);
        scrollToBottom();
        try {
            await api.post(`/chat/${clienteId}/send?text=${encodeURIComponent(text)}&autor=${encodeURIComponent(usuario || 'Agente')}`);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, estado: 'SENT' } : m));
        } catch {
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, estado: 'FAILED' } : m));
            toast('Error', 'No se pudo enviar', '#ef4444');
        }
    };

    const uploadFile = async (file) => {
        if (!file || !clienteId) return;
        const form = new FormData();
        // Crear el File con nombre original preservado
        const namedFile = new File([file], file.name, { type: file.type });
        form.append('file', namedFile, file.name);
        form.append('filename', file.name);
        toast('Subiendo...', 'Espera un momento', '#3b82f6');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/v1/chat/${clienteId}/send-file`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            if (!res.ok) {
                const err = await res.text().catch(() => res.status);
                toast('Error', `No se pudo enviar: ${err}`, '#ef4444');
                return;
            }
            toast('Éxito', 'Archivo enviado', '#10b981');
        } catch (e) {
            console.error('Error enviando archivo:', e);
            toast('Error', 'No se pudo enviar el archivo', '#ef4444');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            audioChunksRef.current = [];
            recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
            recorder.onstop = () => {
                const file = new File([new Blob(audioChunksRef.current, { type: 'audio/webm' })], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                uploadFile(file);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch { alert('No se pudo acceder al micrófono'); }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state !== 'inactive') { mediaRecorderRef.current.stop(); }
        setIsRecording(false);
    };

    const saveInfo = async () => {
        if (!cliente || !clienteId) return;
        try {
            await api.put(`/clientes/${clienteId}`, { nombre: cliente.nombre, notas: cliente.notas });
            onUpdateCard?.(clienteId, { nombre: cliente.nombre });
        } catch { }
    };

    const changeStage = async (etapaId) => {
        setShowStageDD(false);
        setCliente(prev => ({ ...prev, etapa: etapas.find(e => e.id === etapaId) }));
        onMoveCard?.(clienteId, etapaId);
        try {
            await api.patch(`/clientes/${clienteId}/etapa?nuevaEtapaId=${etapaId}`);
        }
        catch { toast('Error', 'No se guardó el movimiento', '#ef4444'); }
    };

    const addTag = async () => {
        if (!newTagName.trim() || !clienteId) return;
        try {
            const res = await api.post(`/clientes/${clienteId}/etiquetas`, { nombre: newTagName.trim(), color: tagColor });
            setCliente(prev => ({ ...prev, etiquetas: res.data }));
            onUpdateCard?.(clienteId, { etiquetas: res.data });
            setNewTagName('');
        } catch { toast('Error', 'No se pudo guardar la etiqueta', '#ef4444'); }
    };

    const removeTag = async (tagId) => {
        try {
            const res = await api.delete(`/clientes/${clienteId}/etiquetas/${tagId}`);
            setCliente(prev => ({ ...prev, etiquetas: res.data }));
            onUpdateCard?.(clienteId, { etiquetas: res.data });
        } catch { toast('Error', 'No se pudo borrar', '#ef4444'); }
    };

    const updateMoney = async (tipo) => {
        const monto = Number.parseFloat(montoInput);
        if (Number.isNaN(monto) || monto <= 0) { toast('Aviso', 'Monto inválido', '#f59e0b'); return; }
        try {
            // Guardar transacción en el historial
            await api.post('/transacciones/guardar', {
                clienteId,
                monto,
                tipo: tipo === 'sumar' ? 'CARGA' : 'RETIRO',
            });
            setMontoInput('');
            toast('Éxito', tipo === 'sumar' ? 'Carga registrada' : 'Retiro registrado', '#10b981');
            loadChat(clienteId);
        } catch { toast('Error', 'No se pudo registrar la transacción', '#ef4444'); }
    };

    // ── Close emoji picker on outside click ──
    useEffect(() => {
        if (!showEmoji) return;
        const handler = (e) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target)) {
                setShowEmoji(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showEmoji]);

    // ── Drag & drop handlers ──
    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        if (dragCounterRef.current === 1) setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const addFilesToQueue = useCallback((fileInput) => {
        const fileList = Array.from(fileInput);
        const newEntries = fileList.map(file => ({ file, preview: null }));
        setPendingFiles(prev => {
            if (prev.length === 0) setActiveFileIdx(0);
            return [...prev, ...newEntries];
        });
        setCaptionInput('');
        fileList.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => setPendingFiles(prev => prev.map(e => e.file === file ? { ...e, preview: ev.target.result } : e));
                reader.readAsDataURL(file);
            }
        });
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files?.length > 0) addFilesToQueue(files);
    }, [addFilesToQueue]);

    const confirmSendFile = async () => {
        if (pendingFiles.length === 0) return;
        const files = pendingFiles.map(e => e.file);
        setPendingFiles([]);
        setActiveFileIdx(0);
        setCaptionInput('');
        for (const file of files) {
            await uploadFile(file);
        }
    };

    const cancelSendFile = () => {
        setPendingFiles([]);
        setActiveFileIdx(0);
        setCaptionInput('');
    };

    const removeFileFromQueue = useCallback((idx) => {
        setPendingFiles(prev => {
            const next = prev.filter((_, i) => i !== idx);
            setActiveFileIdx(curr => Math.min(curr, Math.max(0, next.length - 1)));
            return next;
        });
    }, []);

    if (!clienteId) return null;

    const etapaActual = etapas?.find(e => e.id === cliente?.etapa?.id);
    const isWhatsApp  = (cliente?.origen || '').toUpperCase() !== 'TELEGRAM';

    const groupedMessages = [];
    let lastDate = null;
    messages.forEach(m => {
        const d = formatDate(m.fechaHora, t('chat.today'), lang);
        if (d && d !== lastDate) { groupedMessages.push({ type: 'separator', date: d }); lastDate = d; }
        groupedMessages.push({ type: 'msg', data: m });
    });

    const handleImageFile = (e) => {
        if (e.target.files?.length > 0) addFilesToQueue(e.target.files);
        setShowAttach(false);
    };

    const handleDocFile = (e) => {
        if (e.target.files?.length > 0) addFilesToQueue(e.target.files);
        setShowAttach(false);
    };

    return (
        <div id="chatModal" className="modal-overlay show" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="pro-modal">
                <div className="chat-main-panel" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} style={{ position: 'relative' }}>
                {isDragging && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 9999, background: 'rgba(16,185,129,0.15)', border: '3px dashed #10b981', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#10b981' }}>
                            <i className="fas fa-cloud-upload-alt" style={{ fontSize: '3rem' }}></i>
                            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{t('chat.dropFile')}</span>
                        </div>
                    </div>
                )}
                    <div className="chat-header-pro">
                        <div className="header-info-group">
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                                {cliente?.fotoUrl ? <img src={cliente.fotoUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" /> : (cliente?.nombre || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <input className="header-name-input" value={cliente?.nombre || ''} onChange={e => setCliente(prev => ({ ...prev, nombre: e.target.value }))} onBlur={saveInfo} onKeyDown={e => e.key === 'Enter' && saveInfo()} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, fontSize: '0.82rem' }}>
                                    <i className={isWhatsApp ? 'fab fa-whatsapp' : 'fab fa-telegram-plane'} style={{ color: isWhatsApp ? '#25D366' : '#0088cc' }}></i>
                                    <span style={{ color: isWhatsApp ? '#25D366' : '#0088cc', fontWeight: 600 }}>{(cliente?.origen || '').toUpperCase()}{cliente?.nombreInstancia ? ` (${cliente.nombreInstancia})` : ''}</span>
                                </div>
                            </div>
                            <div className="stage-selector-wrapper">
                                <div className="stage-dd" style={{ position: 'relative' }}>
                                    <button className="stage-dd-btn" onClick={e => { e.stopPropagation(); setShowStageDD(p => !p); }}>
                                        {etapaActual?.nombre || t('chat.stage')} <i className="fas fa-chevron-down"></i>
                                    </button>
                                    {showStageDD && (
                                        <div className="stage-dd-menu show">
                                            {etapas?.map(e => (
                                                <button key={e.id} className={`stage-dd-item ${e.id === cliente?.etapa?.id ? 'active' : ''}`} onClick={() => changeStage(e.id)}>
                                                    <span>{e.nombre}</span>{e.id === cliente?.etapa?.id && <i className="fas fa-check"></i>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button className="btn-icon btn-close-chat" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-times" style={{ fontSize: '1rem' }}></i>
                        </button>
                    </div>

                    <div ref={messagesAreaRef} className="chat-messages-area" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', position: 'relative' }}>

                        {!msgExhausted && (
                            <button className="load-older-btn" style={{ textAlign: 'center', padding: '8px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: '0.8rem', color: '#94a3b8' }} onClick={loadOlder}>
                                <i className="fas fa-history"></i> {t('chat.loadOlder')}
                            </button>
                        )}
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}><div className="spinner"></div></div>
                        ) : (
                            groupedMessages.map((item, i) => item.type === 'separator' ? <div key={`sep-${item.date}`} className="date-separator">{item.date}</div> : <MessageBubble key={item.data.id || `msg-${i}`} msg={item.data} />)
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── File preview modal ── */}
                    {pendingFiles.length > 0 && (
                        <div className="file-preview-overlay" onClick={cancelSendFile}>
                            <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
                                <div className="file-preview-header">
                                    <button className="btn-icon" onClick={cancelSendFile}><i className="fas fa-times"></i></button>
                                    <span className="file-preview-title">
                                        {pendingFiles[activeFileIdx]?.file.type.startsWith('image/') ? t('chat.sendImage') : t('chat.sendFile')}
                                        {pendingFiles.length > 1 && <span style={{ opacity: 0.55, fontWeight: 400, fontSize: '0.85rem', marginLeft: 6 }}>{pendingFiles.length} archivos</span>}
                                    </span>
                                    <div style={{ width: 32 }} />
                                </div>
                                <div className="file-preview-body">
                                    {pendingFiles[activeFileIdx]?.preview ? (
                                        <img src={pendingFiles[activeFileIdx].preview} alt="Vista previa" className="file-preview-image" />
                                    ) : (
                                        <div className="file-preview-doc">
                                            <div className="file-preview-doc-icon">
                                                <i className="fas fa-file-alt"></i>
                                            </div>
                                            <div className="file-preview-doc-info">
                                                <span className="file-preview-doc-name">{pendingFiles[activeFileIdx]?.file.name}</span>
                                                <span className="file-preview-doc-size">{FORMAT_BYTES(pendingFiles[activeFileIdx]?.file.size ?? 0)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="file-strip">
                                    {pendingFiles.map((entry, idx) => (
                                        <div key={idx} className={`file-strip-thumb${idx === activeFileIdx ? ' active' : ''}`} onClick={() => setActiveFileIdx(idx)}>
                                            {entry.preview
                                                ? <img src={entry.preview} alt="" />
                                                : <i className="fas fa-file-alt"></i>
                                            }
                                            <button className="file-strip-remove" onClick={e => { e.stopPropagation(); removeFileFromQueue(idx); }}>
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    ))}
                                    <button className="file-strip-add" onClick={() => addFileInputRef.current?.click()}>
                                        <i className="fas fa-plus"></i>
                                    </button>
                                    <input ref={addFileInputRef} type="file" hidden multiple onChange={e => { if (e.target.files?.length > 0) addFilesToQueue(e.target.files); e.target.value = ''; }} />
                                </div>
                                <div className="file-preview-footer">
                                    <input
                                        className="file-preview-caption"
                                        placeholder={t('chat.captionPlaceholder')}
                                        value={captionInput}
                                        onChange={e => setCaptionInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') confirmSendFile(); }}
                                        onPaste={e => { const files = Array.from(e.clipboardData?.items ?? []).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean); if (files.length > 0) { e.preventDefault(); addFilesToQueue(files); } }}
                                        autoFocus
                                    />
                                    <button className="btn-send-round" onClick={confirmSendFile}><i className="fas fa-paper-plane"></i></button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="chat-footer-pro" style={{ position: 'relative' }}>
                        {showEmoji && (
                            <div ref={emojiRef} style={{ position: 'absolute', bottom: 65, left: 10, zIndex: 2000 }}>
                                <EmojiPicker
                                    theme={Theme.DARK}
                                    searchPlaceholder={t('chat.emojiSearch')}
                                    width={350}
                                    height={400}
                                    onEmojiClick={(emojiData) => setMsgInput(prev => prev + emojiData.emoji)}
                                    previewConfig={{ showPreview: false }}
                                    skinTonesDisabled
                                    lazyLoadEmojis
                                />
                            </div>
                        )}
                        {showAttach && (
                            <div className="attach-menu show">
                                <label htmlFor="attach-image" className="attach-item" style={{ cursor: 'pointer' }}><i className="fas fa-image" style={{ color: '#10b981' }}></i><span>{' '}{t('chat.image')}</span><input id="attach-image" type="file" accept="image/*" multiple hidden onChange={handleImageFile} /></label>
                                <label htmlFor="attach-doc" className="attach-item" style={{ cursor: 'pointer' }}><i className="fas fa-file" style={{ color: '#3b82f6' }}></i><span>{' '}{t('chat.document')}</span><input id="attach-doc" type="file" multiple hidden onChange={handleDocFile} /></label>
                            </div>
                        )}
                        <button className="btn-icon" onClick={() => { setShowAttach(p => !p); setShowEmoji(false); }}><i className="fas fa-paperclip"></i></button>
                        <button className="btn-icon" onClick={() => { setShowEmoji(p => !p); setShowAttach(false); }}><i className="fas fa-smile"></i></button>

                        <div className="input-wrapper relative-context">
                            <SlashMenu suggestions={suggestions} activeIdx={activeIdx} onSelect={apply} />
                            <input placeholder={t('chat.msgPlaceholder')} value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => { slashKeyDown(e); if (!e.defaultPrevented && e.key === 'Enter' && !e.shiftKey) sendMessage(); }} onPaste={e => { const files = Array.from(e.clipboardData?.items ?? []).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean); if (files.length > 0) { e.preventDefault(); addFilesToQueue(files); } }} />
                        </div>

                        <button className={`btn-icon ${isRecording ? 'mic-active' : ''}`} onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}><i className="fas fa-microphone"></i></button>
                        <button className="btn-send-round" onClick={sendMessage}><i className="fas fa-paper-plane"></i></button>
                    </div>
                </div>

                <div className="info-sidebar-pro">
                    <div className="attr-row">
                        <span className="attr-label">{t('chat.phone')}</span>
                        <div className="input-group-dark"><i className={isWhatsApp ? 'fab fa-whatsapp' : 'fab fa-telegram-plane'} style={{ color: isWhatsApp ? '#25D366' : '#0088cc', fontSize: '1.1rem' }}></i><input value={cliente?.telefono || ''} readOnly style={{ background: 'transparent', border: 'none', color: '#d1d7db', width: '100%' }} /></div>
                    </div>
                    <div className="attr-row">
                        <span className="attr-label">{t('chat.notes')}</span>
                        <textarea className="no-resize" style={{ background: '#202c33', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#d1d7db', padding: '10px', resize: 'none', minHeight: 80, width: '100%' }} value={cliente?.notas || ''} onChange={e => setCliente(prev => ({ ...prev, notas: e.target.value }))} onBlur={saveInfo} placeholder={t('chat.notesPlaceholder')} />
                    </div>
                    <div className="attr-row">
                        <span className="attr-label">{t('chat.balance')}</span>
                        <div className="saldo-card"><span className="saldo-title">{t('chat.balanceTotal')}</span><span className="saldo-value" style={{ color: '#10b981', fontWeight: 700, fontSize: '1.1rem' }}>${(cliente?.saldo ?? cliente?.presupuesto ?? 0).toFixed(2)}</span></div>
                        <div className="money-control-wrapper" style={{ marginTop: 8 }}>
                            <button className="btn-math danger" onClick={() => updateMoney('restar')}>−</button>
                            <div className="money-input-container"><span className="currency-symbol">$</span><input className="money-input" type="number" min="0" value={montoInput} onChange={e => setMontoInput(e.target.value)} placeholder="0.00" /></div>
                            <button className="btn-math success" onClick={() => updateMoney('sumar')}>+</button>
                        </div>
                    </div>
                    <div className="attr-row">
                        <span className="attr-label">{t('chat.tags')}</span>
                        <div className="tags-list">
                            {(cliente?.etiquetas?.length ?? 0) === 0 ? <span style={{ color: '#555', fontSize: '0.75rem', fontStyle: 'italic' }}>{t('chat.noTags')}</span> : cliente.etiquetas.map(tag => (
                                <div key={tag.id} className="tag-pill" style={{ backgroundColor: (tag.color || '#10b981') + '26', color: tag.color || '#10b981', borderColor: (tag.color || '#10b981') + '4D' }}>
                                    <span>{tag.nombre}</span><button className="tag-remove-btn" onClick={() => removeTag(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px', borderRadius: '50%', color: 'inherit', opacity: 0.7, lineHeight: 1, fontSize: '0.75rem' }} onMouseEnter={e => e.currentTarget.style.opacity=1} onMouseLeave={e => e.currentTarget.style.opacity=0.7}><i className="fas fa-times"></i></button>
                                </div>
                            ))}
                        </div>
                        <div className="input-group-dark tag-input-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input style={{ background: 'transparent', border: 'none', outline: 'none', color: '#d1d7db', fontSize: '0.85rem', flex: 1 }} placeholder={t('chat.newTagPlaceholder')} value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
                            <div style={{ display: 'flex', gap: 4 }}>
                                {COLORS_TAG.map(c => <button key={c} className={`color-dot ${tagColor === c ? 'selected' : ''}`} style={{ background: c, width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', border: tagColor === c ? '2px solid #fff' : '2px solid transparent', padding: 0, flexShrink: 0, outline: 'none' }} onClick={() => setTagColor(c)} />)}
                            </div>
                            <button className="btn-icon-small" onClick={addTag}><i className="fas fa-plus"></i></button>
                        </div>
                    </div>
                    <div className="attr-row">
                        <span className="attr-label">{t('chat.multimedia')}</span>
                        <div id="media-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {media.length === 0 ? <div style={{ padding: 10, opacity: 0.5, color: '#94a3b8', fontSize: '0.8rem', gridColumn: '1/-1' }}>{t('chat.noMultimedia')}</div> : [...media].reverse().map((m) => (
                                <button key={m.id || m.urlArchivo} className="media-item" style={{ aspectRatio: '1', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#111', border: 'none', padding: 0 }} onClick={() => window.open(m.urlArchivo)}>
                                    {m.tipo === 'VIDEO' ? (
                                        // FIX SONARLINT S4084: Etiqueta track para accesibilidad
                                        <video src={m.urlArchivo} style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
                                            <track kind="captions" />
                                        </video>
                                    ) : (
                                        <img src={m.urlArchivo} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MessageBubble({ msg }) {
    const { t } = useLanguage();
    const origin    = msg.origen === 'TELEGRAM' ? 'telegram-msg' : 'whatsapp-msg';
    const className = `msg ${msg.esSalida ? 'sent' : 'received'} ${origin}`;
    const renderTicks = () => {
        if (!msg.esSalida) return null;
        let cls = 'fas fa-check'; let color = '#a6b3bd';
        if (msg.estado === 'DELIVERED') { cls = 'fas fa-check-double'; }
        else if (msg.estado === 'READ') { cls = 'fas fa-check-double'; color = '#53bdeb'; }
        return <span className="msg-ticks"><i className={cls} style={{ marginLeft: 5, fontSize: 10, color }}></i></span>;
    };
    const renderContent = () => {
        if ((msg.tipo === 'IMAGEN' || msg.tipo === 'STICKER') && msg.urlArchivo) return <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => window.open(msg.urlArchivo)}><img src={msg.urlArchivo} loading="lazy" className={msg.tipo === 'STICKER' ? 'msg-sticker' : 'msg-img'} style={msg.tipo === 'STICKER' ? { width: 120, height: 120, objectFit: 'contain' } : {}} alt="" /></button>;
        
        // FIX SONARLINT S4084
        if (msg.tipo === 'VIDEO' && msg.urlArchivo) return (
            <video controls preload="none" src={msg.urlArchivo} className="msg-video">
                <track kind="captions" />
            </video>
        );

        if (msg.tipo === 'DOCUMENTO' && msg.urlArchivo) return <a href={msg.urlArchivo} target="_blank" rel="noreferrer" className="msg-file"><i className="fas fa-file"></i> {t('chat.downloadFile')}</a>;
        if (msg.tipo === 'AUDIO' && msg.urlArchivo) return <AudioPlayer src={msg.urlArchivo} sent={msg.esSalida} />;
        return null;
    };
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const text = msg.contenido ? escapeHtml(msg.contenido).replace(/\n/g, '<br>') : '';
    return (
        <div className={className} data-wa-id={msg.whatsappId || ''}>
            {msg.esSalida && <span className="msg-author" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{msg.autor || 'Agente'}</span>}
            <div className="msg-content-wrapper">
                {text && <div className="msg-text-part" style={{ marginBottom: 5, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: text }} />}
                {renderContent()}
            </div>
            <div className="msg-meta">{formatTime(msg.fecha || msg.fechaHora)} {renderTicks()}</div>
        </div>
    );
}

function AudioPlayer({ src, sent }) {
    const audioRef  = useRef(null);
    const [playing, setPlaying]   = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState('0:00');
    
    // FIX SONARLINT S2681: Expandido con llaves
    const toggle = () => { 
        if (!audioRef.current) return; 
        if (playing) { 
            audioRef.current.pause(); 
            setPlaying(false); 
        } else { 
            audioRef.current.play(); 
            setPlaying(true); 
        } 
    };

    // FIX SONARLINT S2681: Expandido con llaves
    const onTimeUpdate = () => { 
        if (!audioRef.current) return; 
        setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100 || 0); 
        const s = Math.floor(audioRef.current.currentTime); 
        setDuration(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); 
    };
    
    const onEnded  = () => { setPlaying(false); setProgress(0); };
    const onSeek   = (e) => { if (audioRef.current) { audioRef.current.currentTime = (audioRef.current.duration / 100) * e.target.value; } };
    
    return (
        <div className={`custom-audio-player ${sent ? 'sent' : 'received'}`}>
            <div className="audio-mic-icon"><i className="fas fa-microphone"></i></div>
            <button className="audio-btn-play" onClick={toggle}><i className={`fas fa-${playing ? 'pause' : 'play'}`}></i></button>
            <div className="audio-progress-container">
                <input type="range" className="audio-slider" value={progress} max={100} onChange={onSeek} />
                <span className="audio-timer">{duration}</span>
            </div>
            {/* FIX SONARLINT S4084 */}
            <audio ref={audioRef} src={src} onTimeUpdate={onTimeUpdate} onEnded={onEnded}>
                <track kind="captions" />
            </audio>
        </div>
    );
}