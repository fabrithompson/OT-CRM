const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode,
    delay,
    Browsers,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const { writeFile } = require('fs/promises');

const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8080;
if (!process.env.JAVA_BACKEND_URL) {
    console.error('ERROR: JAVA_BACKEND_URL no esta configurada. Define la variable de entorno antes de iniciar.');
    process.exit(1);
}
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL;
if (!process.env.BOT_SECRET_KEY) {
    console.error('ERROR: BOT_SECRET_KEY no esta configurada. Define la variable de entorno antes de iniciar.');
    process.exit(1);
}
const SECRET_KEY = process.env.BOT_SECRET_KEY;

const PUBLIC_URL = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}`
    : `http://localhost:${PORT}`;

const SESSION_FOLDER_NAME = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'auth_info_v2')
    : path.join(__dirname, 'auth_info_v2');

const UPLOADS_FOLDER = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'public', 'uploads')
    : path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_FOLDER)) fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
if (!fs.existsSync(SESSION_FOLDER_NAME)) fs.mkdirSync(SESSION_FOLDER_NAME, { recursive: true });

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
});

const msgRetryCounterCache = new NodeCache();
const processedMsgIds = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const messageQueues = new Map();

function enqueueMessage(remoteJid, handler) {
    const prev = messageQueues.get(remoteJid) || Promise.resolve();
    const next = prev
        .then(handler)
        .catch(err => {
            logger.error({ remoteJid, error: err.message }, '❌ Error en cola de mensaje');
        })
        .finally(() => {
            if (messageQueues.get(remoteJid) === next) {
                messageQueues.delete(remoteJid);
            }
        });
    messageQueues.set(remoteJid, next);
    return next;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use((req, res, next) => {
    if (req.url.startsWith('/api/webhook/whatsapp')) {
        req.url = req.url.replace('/api/webhook/whatsapp', '');
        if (req.url === '') req.url = '/';
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use('/uploads', express.static(UPLOADS_FOLDER));

let connectedUsers = [];
io.on('connection', (socket) => {
    socket.on('join_presence', (userData) => {
        connectedUsers = connectedUsers.filter(u => u.username !== userData.username);
        connectedUsers.push({
            id: socket.id,
            username: userData.username || 'Usuario',
            avatar: userData.avatar || '',
            status: 'online',
            connectedAt: Date.now()
        });
        io.emit('update_users', connectedUsers);
    });
    socket.on('disconnect', () => {
        connectedUsers = connectedUsers.filter(u => u.id !== socket.id);
        io.emit('update_users', connectedUsers);
    });
});

const sessions = new Map();
const qrStore = new Map();

// ── Reconexión automática con backoff exponencial ──────────────────────────
// Cada sesión trackea sus reintentos independientemente.
// Después de MAX_RETRIES fallos consecutivos, se marca como "requiere intervención manual".
const MAX_RETRIES = 5;
const BACKOFF_DELAYS = [5000, 10000, 20000, 40000, 60000]; // ms por intento
const reconnectState = new Map(); // sessionId → { retries, timer, healthTimer }

const getReconnectState = (sessionId) => {
    if (!reconnectState.has(sessionId)) {
        reconnectState.set(sessionId, { retries: 0, timer: null, healthTimer: null });
    }
    return reconnectState.get(sessionId);
};

const resetReconnectState = (sessionId) => {
    const state = reconnectState.get(sessionId);
    if (state) {
        if (state.timer) clearTimeout(state.timer);
        state.retries = 0;
        state.timer = null;
    }
};

// Health check activo: ping cada 2 minutos a cada sesión conectada
const startHealthCheck = (sessionId) => {
    const state = getReconnectState(sessionId);
    // Limpiar health check anterior si existe
    if (state.healthTimer) clearInterval(state.healthTimer);

    state.healthTimer = setInterval(async () => {
        const sock = sessions.get(sessionId);
        if (!sock || !sock.user) {
            logger.warn({ sessionId }, '💔 Health check: sesión no conectada, iniciando reconexión');
            clearInterval(state.healthTimer);
            state.healthTimer = null;
            scheduleReconnect(sessionId);
            return;
        }
        try {
            // Verificar que el socket sigue respondiendo
            await sock.sendPresenceUpdate('available');
            logger.debug({ sessionId }, '💚 Health check OK');
        } catch (err) {
            logger.warn({ sessionId, error: err.message }, '💔 Health check falló, sesión no responde');
            clearInterval(state.healthTimer);
            state.healthTimer = null;
            scheduleReconnect(sessionId);
        }
    }, 120000); // Cada 2 minutos
};

const stopHealthCheck = (sessionId) => {
    const state = reconnectState.get(sessionId);
    if (state?.healthTimer) {
        clearInterval(state.healthTimer);
        state.healthTimer = null;
    }
};

const scheduleReconnect = (sessionId) => {
    const state = getReconnectState(sessionId);

    if (state.retries >= MAX_RETRIES) {
        logger.error({ sessionId, retries: state.retries },
            '🚨 INTERVENCIÓN MANUAL REQUERIDA: se agotaron los reintentos de reconexión');
        updateJavaStatus(sessionId, 'ERROR');
        io.emit('bot_status', { sessionId, status: 'ERROR', message: 'Requiere intervención manual' });
        return;
    }

    const delayMs = BACKOFF_DELAYS[state.retries] || BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
    state.retries++;

    logger.info({ sessionId, attempt: state.retries, maxRetries: MAX_RETRIES, delayMs },
        `🔄 Reconexión programada: intento ${state.retries}/${MAX_RETRIES} en ${delayMs}ms`);

    state.timer = setTimeout(() => {
        logger.info({ sessionId, attempt: state.retries }, '🔄 Ejecutando reconexión...');
        sessions.delete(sessionId);
        startSession(sessionId);
    }, delayMs);
};

const axiosWithRetry = async (config, retries = 3, baseDelay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await axios(config);
        } catch (err) {
            const isLastAttempt = attempt === retries;
            const isTimeout = err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
            const isServerError = err.response?.status >= 500;

            if (isLastAttempt || (!isTimeout && !isServerError)) {
                logger.error({
                    url: config.url,
                    attempt,
                    error: err.message,
                    status: err.response?.status
                }, '❌ Fallo definitivo en llamada a Java');
                throw err;
            }

            const delayMs = baseDelay * Math.pow(2, attempt - 1);
            logger.warn({ url: config.url, attempt, retryIn: delayMs }, `⚠️ Reintento ${attempt}/${retries} en ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
};

const formatToJid = (number) => {
    if (!number) return null;
    let clean = number.toString().replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
};

const getRealNumber = (jid) => {
    if (!jid) return '';
    const decoded = jidDecode(jid);
    const user = decoded ? decoded.user : jid.split('@')[0];
    const baseNumber = user.split(':')[0];

    // Normalizar números argentinos al formato canónico 549XXXXXXXXXX
    // para evitar duplicados por variantes (540011..., 5411..., etc.)
    const digits = baseNumber.replace(/\D/g, '');
    if (digits.startsWith('54')) {
        let resto = digits.substring(2);
        // Quitar ceros espurios: 540011... → 11...
        while (resto.startsWith('0')) resto = resto.substring(1);
        // Quitar 9 si ya está (lo ponemos nosotros): 5491155... → 1155...
        if (resto.startsWith('9') && resto.length === 11) resto = resto.substring(1);
        if (resto.length === 10) return '549' + resto;
    }

    return digits || baseNumber;
};

// FIX 1: Extensiones correctas para todos los tipos de audio/video/doc
const getExtension = (mimetype) => {
    if (!mimetype) return 'bin';
    const mt = mimetype.toLowerCase();
    if (mt.includes('image/jpeg')) return 'jpg';
    if (mt.includes('image/png')) return 'png';
    if (mt.includes('image/webp')) return 'webp';
    if (mt.includes('image/gif')) return 'gif';
    if (mt.includes('video/mp4')) return 'mp4';
    if (mt.includes('video/webm')) return 'webm';
    if (mt.includes('video/3gpp')) return '3gp';
    // Audio: ogg primero porque las notas de voz de WA son ogg/opus
    if (mt.includes('audio/ogg')) return 'ogg';
    if (mt.includes('audio/webm')) return 'webm';
    if (mt.includes('audio/mpeg') || mt.includes('audio/mp3')) return 'mp3';
    if (mt.includes('audio/mp4') || mt.includes('audio/m4a')) return 'm4a';
    if (mt.includes('audio')) return 'ogg'; // fallback seguro para WA
    if (mt.includes('pdf')) return 'pdf';
    if (mt.includes('word') || mt.includes('docx')) return 'docx';
    if (mt.includes('excel') || mt.includes('xlsx') || mt.includes('spreadsheet')) return 'xlsx';
    if (mt.includes('zip')) return 'zip';
    return 'bin';
};

// Extrae el nombre de archivo real de una URL o Content-Disposition header
const getMimeFromFilename = (filename) => {
    if (!filename) return null;
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        'pdf':  'application/pdf',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls':  'application/vnd.ms-excel',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc':  'application/msword',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'ppt':  'application/vnd.ms-powerpoint',
        'txt':  'text/plain',
        'csv':  'text/csv',
        'zip':  'application/zip',
        'mp3':  'audio/mpeg',
        'mp4':  'video/mp4',
        'jpg':  'image/jpeg',
        'jpeg': 'image/jpeg',
        'png':  'image/png',
        'gif':  'image/gif',
        'webp': 'image/webp',
    };
    return map[ext] || null;
};

const getFileNameFromUrl = (url, mimetype) => {
    try {
        const urlPath = new URL(url).pathname;
        const decoded = decodeURIComponent(path.basename(urlPath));
        if (decoded && decoded.includes('.')) return decoded;
    } catch (_) {}
    const ext = getExtension(mimetype);
    return `archivo.${ext}`;
};

const updateJavaStatus = async (sessionId, status, phoneUser = null) => {
    try {
        const cleanPhone = phoneUser ? phoneUser.split(':')[0] : null;
        const payload = { sessionId, status, phone: cleanPhone, qr: null };

        let baseUrl = JAVA_BACKEND_URL.replace(/\/$/, '');
        if (!baseUrl.includes('/api/webhook/whatsapp')) baseUrl += '/api/webhook/whatsapp';

        await axiosWithRetry({
            method: 'post',
            url: `${baseUrl}/status`,
            data: payload,
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        });
        logger.info({ sessionId, status, cleanPhone }, '📡 Estado enviado a Java CRM');
    } catch (e) {
        logger.error({ sessionId, error: e.message }, '❌ Error contactando Java Backend (status)');
    }
};

const sendStatusUpdateToJava = async (sessionId, statusData) => {
    try {
        let baseUrl = JAVA_BACKEND_URL.replace(/\/$/, '');
        if (!baseUrl.includes('/api/webhook/whatsapp')) baseUrl += '/api/webhook/whatsapp';

        await axiosWithRetry({
            method: 'post',
            url: `${baseUrl}/message-status`,
            data: { sessionId, ...statusData },
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        }, 2, 500);
    } catch (e) {
        if (e.code !== 'ECONNABORTED') {
            logger.warn({ error: e.message }, '⚠️ Error enviando status tick a Java');
        }
    }
};

const processIncomingMessage = async (msg, sessionId, sock) => {
    try {
        const remoteJid = msg.key.remoteJid;

        // Filtrar JIDs que nunca son chats 1:1
        if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@newsletter') || remoteJid === 'status@broadcast') {
            return;
        }

        // Resolver teléfono real:
        // - Si es @lid (Linked Identity), el número real viene en senderPn
        // - Si es @s.whatsapp.net, se usa directo
        // - senderPn tiene prioridad siempre (es el teléfono verificado por WhatsApp)
        let numeroRaw;
        if (remoteJid.includes('@lid')) {
            // LID = ID interno de dispositivo vinculado, NO es un teléfono
            // senderPn contiene el teléfono real asociado al LID
            numeroRaw = msg.key.senderPn;
            if (!numeroRaw) {
                logger.warn({ sessionId, lid: remoteJid }, '⚠️ Mensaje LID sin senderPn — no se puede resolver el teléfono real, ignorando');
                return;
            }
            logger.info({ sessionId, lid: remoteJid, senderPn: numeroRaw }, '🔄 LID resuelto a teléfono real vía senderPn');
        } else {
            numeroRaw = msg.key.senderPn || msg.key.participant || msg.key.remoteJid;
        }

        const numeroReal = getRealNumber(numeroRaw);

        logger.info(`📥 RAW WEBHOOK - From: ${remoteJid} | Numero Real: ${numeroReal}`);

        if (!numeroReal) return;

        // FIX 2: Incluir viewOnceMessage y manejar texto anidado en viewOnce
        const messageType = Object.keys(msg.message)[0];

        let texto = msg.message?.conversation
                    || msg.message?.extendedTextMessage?.text
                    || msg.message?.imageMessage?.caption
                    || msg.message?.videoMessage?.caption
                    || msg.message?.documentMessage?.caption
                    || msg.message?.viewOnceMessage?.message?.imageMessage?.caption
                    || msg.message?.viewOnceMessage?.message?.videoMessage?.caption
                    || "";

        const isMedia = [
            'imageMessage', 'videoMessage', 'audioMessage',
            'documentMessage', 'stickerMessage', 'viewOnceMessage'
        ].includes(messageType);

        if (!texto && !isMedia) return;

        let mediaUrl = null;
        let mimeType = null;

        if (isMedia) {
            try {
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger, reuploadRequest: sock.updateMediaMessage }
                );

                if (buffer) {
                    // Para viewOnce, el media está anidado
                    const mediaObject = messageType === 'viewOnceMessage'
                        ? (msg.message.viewOnceMessage?.message?.imageMessage
                           || msg.message.viewOnceMessage?.message?.videoMessage)
                        : msg.message[messageType];

                    mimeType = mediaObject?.mimetype || 'application/octet-stream';
                    const ext = getExtension(mimeType);
                    const fileName = `${sessionId}_${Date.now()}.${ext}`;
                    const filePath = path.join(UPLOADS_FOLDER, fileName);

                    await writeFile(filePath, buffer);
                    mediaUrl = `${PUBLIC_URL}/uploads/${fileName}`;

                    if (!texto) texto = `[${messageType.replace('Message', '')}]`;
                }
            } catch (err) {
                logger.error({ err: err.message }, "Error descargando media");
            }
        }

        let profilePicUrl = "";
        try {
            profilePicUrl = await sock.profilePictureUrl(remoteJid, 'image');
        } catch (e) {}

        const payload = {
            sessionId,
            from: numeroReal,
            body: texto,
            name: msg.pushName || "Usuario",
            origen: "WHATSAPP",
            profilePicUrl: profilePicUrl,
            mediaUrl: mediaUrl,
            mimeType: mimeType
        };

        let baseUrl = JAVA_BACKEND_URL.replace(/\/$/, '');
        if (!baseUrl.includes('/api/webhook/whatsapp')) {
            baseUrl += '/api/webhook/whatsapp';
        }

        logger.info({ from: numeroReal, body: texto }, "📨 Enviando a Java CRM");

        await axiosWithRetry({
            method: 'post',
            url: `${baseUrl}/robot`,
            data: payload,
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        });

    } catch (e) {
        logger.error({ error: e.message }, '❌ Error procesando mensaje entrante');
    }
};

const safeRemoveSession = (sessionId) => {
    const authPath = path.join(SESSION_FOLDER_NAME, sessionId);
    try {
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            logger.info({ sessionId }, '🗑️ Sesión eliminada del disco');
        }
    } catch (err) { logger.error({ err }, 'Error limpiando archivos'); }
};

const startSession = async (sessionId, phoneNumber = null) => {
    try {
        if (phoneNumber && sessions.has(sessionId)) {
            const oldSock = sessions.get(sessionId);
            oldSock.end(undefined);
            sessions.delete(sessionId);
            qrStore.delete(sessionId);
            await delay(1000);
        }

        const authPath = path.join(SESSION_FOLDER_NAME, sessionId);
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'error' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 20000,
            retryRequestDelayMs: 500,
            msgRetryCounterCache,
            mobile: false
        });

        sessions.set(sessionId, sock);
        qrStore.set(sessionId, "WAITING");

        if (phoneNumber && !sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    logger.info({ sessionId, phoneNumber }, '🔢 Pidiendo Pairing Code...');
                    const code = await sock.requestPairingCode(phoneNumber);
                    qrStore.set(sessionId, code);
                } catch (e) {
                    qrStore.set(sessionId, "ERROR");
                }
            }, 6000);
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    const url = await qrcode.toDataURL(qr);
                    qrStore.set(sessionId, url);
                } catch (e) {}
            }

            if (connection === 'open') {
                logger.info({ sessionId }, '🚀 CONEXIÓN EXITOSA');
                qrStore.delete(sessionId);
                // Conexión exitosa: resetear contador de reintentos e iniciar health check
                resetReconnectState(sessionId);
                startHealthCheck(sessionId);
                const userPhone = sock.user ? sock.user.id.split(':')[0] : undefined;
                await updateJavaStatus(sessionId, 'CONNECTED', userPhone);
                io.emit('bot_status', { sessionId, status: 'CONNECTED' });
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                // Detener health check al desconectarse
                stopHealthCheck(sessionId);

                if (!shouldReconnect) {
                    // Logout intencional: limpiar todo, no reintentar
                    logger.info({ sessionId, statusCode }, '👋 Logout intencional, sin reconexión');
                    sessions.delete(sessionId);
                    qrStore.delete(sessionId);
                    safeRemoveSession(sessionId);
                    reconnectState.delete(sessionId);
                    await updateJavaStatus(sessionId, 'DISCONNECTED');
                    io.emit('bot_status', { sessionId, status: 'DISCONNECTED' });
                } else {
                    // Caída inesperada: reconectar con backoff exponencial
                    logger.warn({ sessionId, statusCode }, '⚠️ Desconexión inesperada, programando reconexión...');
                    sessions.delete(sessionId);
                    await updateJavaStatus(sessionId, 'RECONNECTING');
                    io.emit('bot_status', { sessionId, status: 'RECONNECTING' });
                    scheduleReconnect(sessionId);
                }
            }
        });

        sock.ev.on('messages.upsert', (m) => {
            for (const msg of m.messages) {
                if (msg.key.fromMe || !msg.message) continue;

                const msgId = msg.key.id;
                if (processedMsgIds.get(msgId)) {
                    logger.debug({ msgId }, '⏭️ Mensaje duplicado ignorado');
                    continue;
                }
                processedMsgIds.set(msgId, true);

                const remoteJid = msg.key.remoteJid;
                enqueueMessage(remoteJid, () => processIncomingMessage(msg, sessionId, sock));
            }
        });

        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                // Solo procesar actualizaciones de mensajes enviados por nosotros
                if (!update.key.fromMe) continue;

                if (update.update.status) {
                    // status=2: SERVER_ACK (tick simple, el servidor lo recibió — no notificar)
                    // status=3: DELIVERY_ACK (doble tick gris, llegó al dispositivo del destinatario)
                    // status=4/5: READ/PLAYED (doble tick azul)
                    const statusMap = { 3: 'DELIVERED', 4: 'READ', 5: 'READ' };
                    const newStatus = statusMap[update.update.status];

                    if (newStatus) {
                        await sendStatusUpdateToJava(sessionId, {
                            whatsappId: update.key.id,
                            remoteJid: update.key.remoteJid,
                            status: newStatus
                        });
                    }
                }
            }
        });

    } catch (err) {
        logger.error({ err }, "🔥 Error fatal iniciando sesión");
        qrStore.set(sessionId, "ERROR");
    }
};

// FIX 3: Restaurar sesiones existentes al arrancar el servidor
const restoreExistingSessions = () => {
    try {
        if (!fs.existsSync(SESSION_FOLDER_NAME)) return;

        const entries = fs.readdirSync(SESSION_FOLDER_NAME, { withFileTypes: true });
        const sessionIds = entries
            .filter(e => e.isDirectory())
            .map(e => e.name);

        if (sessionIds.length === 0) {
            logger.info('📂 No hay sesiones guardadas para restaurar');
            return;
        }

        logger.info({ count: sessionIds.length, sessions: sessionIds }, '♻️ Restaurando sesiones guardadas...');

        // Escalonado para no hacer flood al arrancar
        sessionIds.forEach((sessionId, index) => {
            setTimeout(() => {
                logger.info({ sessionId }, `♻️ Restaurando sesión [${index + 1}/${sessionIds.length}]`);
                startSession(sessionId);
            }, index * 2000);
        });
    } catch (err) {
        logger.error({ err }, '❌ Error restaurando sesiones');
    }
};

// ─── ENDPOINTS ────────────────────────────────────────────────

app.get('/health', (req, res) => {
    const sessionList = Array.from(sessions.entries()).map(([id, sock]) => ({
        sessionId: id,
        connected: !!sock?.user,
        reconnectRetries: reconnectState.get(id)?.retries || 0
    }));
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        sessions: sessionList.length,
        details: sessionList
    });
});

app.get('/sessions', (req, res) => {
    const list = Array.from(sessions.entries()).map(([id, sock]) => ({
        sessionId: id,
        connected: !!sock?.user,
        phone: sock?.user?.id?.split(':')[0] || null
    }));
    res.json({ sessions: list, count: list.length });
});

app.post('/session/reset', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).send("Falta sessionId");

    const sock = sessions.get(sessionId);
    if (sock) {
        try {
            await sock.logout();
            logger.info({ sessionId }, "👋 Logout remoto enviado a WhatsApp");
        } catch (e) {
            logger.warn({ sessionId }, "No se pudo cerrar sesión remota (¿ya desconectado?)");
        }
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(sessionId);
    }

    safeRemoveSession(sessionId);
    qrStore.delete(sessionId);

    updateJavaStatus(sessionId, 'DISCONNECTED');

    res.json({ status: "RESET_COMPLETE" });
});

app.get('/session/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sock = sessions.get(sessionId);
    if (sock?.user) return res.json({ status: 'CONNECTED', phone: sock.user.id.split(':')[0] });

    if (qrStore.has(sessionId)) {
        const data = qrStore.get(sessionId);
        if (data === 'WAITING') return res.json({ status: 'WAITING' });
        if (data === 'ERROR') return res.json({ status: 'DISCONNECTED' });
        const isQr = data.startsWith && data.startsWith('data:');
        return res.json({ status: isQr ? 'SCAN_QR' : 'PAIRING_CODE' });
    }
    res.json({ status: 'DISCONNECTED' });
});

app.post('/session/start', (req, res) => {
    const { sessionId } = req.body;
    // Resetear estado de reconexión al iniciar manualmente
    reconnectState.delete(sessionId);
    startSession(sessionId);
    res.json({ status: 'STARTING' });
});

app.get('/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const qr = qrStore.get(sessionId);
    if (sessions.get(sessionId)?.user) return res.json({ status: 'CONNECTED' });
    if (qr && qr.startsWith && qr.startsWith('data:')) return res.json({ status: 'SCAN_QR', qr });
    res.json({ status: 'WAITING' });
});

app.post('/session/pair-code', async (req, res) => {
    const { sessionId, phoneNumber } = req.body;
    if (!sessionId || !phoneNumber) return res.status(400).json({ error: 'Faltan datos' });
    const cleanNumber = phoneNumber.toString().replace(/\D/g, '');
    await startSession(sessionId, cleanNumber);
    let attempts = 0;
    const checkCode = setInterval(() => {
        const code = qrStore.get(sessionId);
        attempts++;
        if (code && typeof code === 'string' && !code.startsWith('data:') && code !== 'WAITING' && code !== 'ERROR') {
            clearInterval(checkCode);
            return res.json({ status: 'PAIRING', code: code });
        }
        if (attempts >= 40) {
            clearInterval(checkCode);
            return res.status(504).json({ error: 'Timeout' });
        }
    }, 500);
});

app.post('/chat/read', async (req, res) => {
    const { sessionId, number, messageIds } = req.body;
    const sock = sessions.get(sessionId);

    if (!sock) return res.status(404).json({ error: 'Sesión no activa' });

    try {
        const jid = formatToJid(number);

        if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
            const keys = messageIds.map(id => ({
                remoteJid: jid,
                id: id,
                fromMe: false
            }));
            await sock.readMessages(keys);
        }

        res.json({ status: 'READ_EMITTED' });
    } catch (e) {
        logger.error({ error: e.message }, "Error marcando leído");
        res.status(500).json({ error: e.message });
    }
});

const sendTimestamps = new Map();

const waitForRateLimit = async (numero) => {
    const lastSend = sendTimestamps.get(numero) || 0;
    const elapsed = Date.now() - lastSend;
    const MIN_INTERVAL = 1000;

    if (elapsed < MIN_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL - elapsed));
    }
    sendTimestamps.set(numero, Date.now());
};

const verifiedJids = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

app.post('/send-message', async (req, res) => {
    const { sessionId, number, message } = req.body;
    const sock = sessions.get(sessionId);
    if (!sock) return res.status(404).json({ error: 'Sesión no activa' });

    try {
        const jid = formatToJid(number);
        let finalJid;

        const cachedJid = verifiedJids.get(number);

        if (cachedJid) {
            finalJid = cachedJid;
            logger.info({ number }, '📦 JID desde caché, sin lookup');
        } else {
            const [result] = await sock.onWhatsApp(jid);
            if (!result?.exists) {
                return res.status(400).json({ error: 'Número no encontrado', jid });
            }
            finalJid = result.jid;
            verifiedJids.set(number, finalJid);
            logger.info({ number, finalJid }, '✅ Nuevo JID verificado y cacheado');
        }

        await waitForRateLimit(number);
        const sent = await sock.sendMessage(finalJid, { text: message });
        res.json({ status: 'SENT', jid: finalJid, id: sent.key.id });
    } catch (e) {
        logger.error({ sessionId, number, error: e.message }, "❌ Error enviando mensaje");
        res.status(500).json({ error: e.message });
    }
});

// FIX 4: send-media corregido — audio, video, documento con mimetype real
app.post('/send-media', async (req, res) => {
    const { sessionId, number, message, url, type, filename, base64, mimetype } = req.body;
    console.log('📎 send-media recibido:', JSON.stringify({ type, filename, hasBase64: !!base64, url: url?.substring(0, 80) }));
    const sock = sessions.get(sessionId);
    if (!sock) return res.status(404).json({ error: 'Sesión no activa' });

    try {
        // Usar el mismo JID verificado que send-message para evitar entregas al número incorrecto
        let jid;
        const cachedJid = verifiedJids.get(number);
        if (cachedJid) {
            jid = cachedJid;
        } else {
            const rawJid = formatToJid(number);
            const [result] = await sock.onWhatsApp(rawJid);
            if (!result?.exists) {
                return res.status(400).json({ error: 'Número no encontrado en WhatsApp', jid: rawJid });
            }
            jid = result.jid;
            verifiedJids.set(number, jid);
        }

        let buffer, contentType;
        if (base64) {
            // Archivo enviado como base64 directo (evita descarga de Cloudinary)
            buffer = Buffer.from(base64, 'base64');
            contentType = mimetype || 'application/octet-stream';
        } else {
            // Fallback: descargar desde URL
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data, 'binary');
            contentType = response.headers['content-type'] || '';
        }

        let mediaPayload = {};

        if (type === 'IMAGEN') {
            // Detectar tipo de imagen real
            const imgMime = contentType.split(';')[0].trim() || 'image/jpeg';
            mediaPayload = {
                image: buffer,
                mimetype: imgMime,
                caption: message || ''
            };
        } else if (type === 'VIDEO') {
            const vidMime = contentType.split(';')[0].trim() || 'video/mp4';
            mediaPayload = {
                video: buffer,
                mimetype: vidMime,
                caption: message || ''
            };
        } else if (type === 'AUDIO') {
            // FIX: PTT de WhatsApp debe ser audio/ogg; codecs=opus
            // Si el archivo ya es ogg lo mandamos como PTT, sino como audio normal
            const isOgg = contentType.includes('ogg') || url.endsWith('.ogg');
            if (isOgg) {
                mediaPayload = {
                    audio: buffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                };
            } else {
                // Archivos de audio normales (mp3, m4a, etc.) — no PTT
                const audMime = contentType.split(';')[0].trim() || 'audio/mpeg';
                mediaPayload = {
                    audio: buffer,
                    mimetype: audMime,
                    ptt: false
                };
            }
        } else {
            // DOCUMENTO: derivar mimetype desde filename si Cloudinary devuelve octet-stream
            const rawMime = contentType.split(';')[0].trim();
            const fileName = filename || getFileNameFromUrl(url, rawMime);
            const docMime = (rawMime === 'application/octet-stream' || !rawMime)
                ? (getMimeFromFilename(fileName) || rawMime || 'application/octet-stream')
                : rawMime;
            mediaPayload = {
                document: buffer,
                mimetype: docMime,
                fileName: fileName,
                caption: message || ''
            };
        }

        await waitForRateLimit(number);
        const sent = await sock.sendMessage(jid, mediaPayload);
        res.json({ status: 'SENT', id: sent.key.id });
    } catch (e) {
        logger.error({ error: e.message }, "Error enviando media");
        res.status(500).json({ error: e.message });
    }
});

const KEEPALIVE_URL = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}/health`
    : `http://localhost:${PORT}/health`;
setInterval(() => { axios.get(KEEPALIVE_URL).catch(() => {}); }, 600000);

server.listen(PORT, '0.0.0.0', () => {
    logger.info(`✅ BOT SERVER (LINUX MODE) LISTO EN PUERTO ${PORT}`);
    // FIX 3: Restaurar sesiones guardadas al arrancar
    restoreExistingSessions();
});