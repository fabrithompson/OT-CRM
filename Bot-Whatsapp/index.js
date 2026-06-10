require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode,
    delay,
    downloadMediaMessage,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const { writeFile, readFile, unlink, readdir } = require('fs/promises');
const { spawn } = require('child_process');

const http = require('http');
const { Server } = require('socket.io');

// Convierte cualquier buffer de audio (webm de MediaRecorder, mp3, m4a, etc)
// a ogg/opus, que es el único formato que WhatsApp acepta como voice note.
// Si WhatsApp recibe el audio en otro contenedor (ej: webm) lo acepta en la
// API pero no se lo entrega al destinatario, así que la conversión es
// obligatoria. Usamos ffmpeg via stdin/stdout para no escribir archivos
// temporales en disco.
const convertToOggOpus = (inputBuffer) => new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0',
        '-vn',                              // descarta cualquier pista de video
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-application', 'voip',             // optimización para voz
        '-f', 'ogg',
        'pipe:1'
    ]);
    const chunks = [];
    let stderr = '';
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', code => {
        if (code !== 0) return reject(new Error(`ffmpeg salida ${code}: ${stderr.slice(0, 200)}`));
        resolve(Buffer.concat(chunks));
    });
    ff.stdin.on('error', reject);
    ff.stdin.end(inputBuffer);
});

const PORT = process.env.PORT || 8080;
if (!process.env.JAVA_BACKEND_URL) {
    console.error('ERROR: JAVA_BACKEND_URL no esta configurada.');
    process.exit(1);
}
if (!process.env.BOT_SECRET_KEY) {
    console.error('ERROR: BOT_SECRET_KEY no esta configurada.');
    process.exit(1);
}
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL;
const SECRET_KEY = process.env.BOT_SECRET_KEY;

const PUBLIC_URL = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}`
    : `http://localhost:${PORT}`;

const SESSION_FOLDER_NAME = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? process.env.RAILWAY_VOLUME_MOUNT_PATH
    : path.join(__dirname, 'auth_info_v2');

const UPLOADS_FOLDER = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
    : path.join(__dirname, 'public', 'uploads');

// Carpeta para mensajes que no se pudieron enviar a Java (persistencia ante caidas)
const FAILED_QUEUE_FOLDER = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'failed_queue')
    : path.join(__dirname, 'failed_queue');

// Archivo donde persistimos el mapeo LID → teléfono para que sobreviva reinicios
const LID_MAP_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'lid_map.json')
    : path.join(__dirname, 'lid_map.json');

// Archivo donde persistimos los mensajes salientes (retry store) para que los
// retry-receipts de WhatsApp funcionen incluso después de un reinicio del bot.
// Sin esto, los destinatarios ven "Esperando el mensaje. Esto puede demorar un poco."
const SENT_MESSAGES_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'sent_messages.json')
    : path.join(__dirname, 'sent_messages.json');

if (!fs.existsSync(UPLOADS_FOLDER)) fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
if (!fs.existsSync(SESSION_FOLDER_NAME)) fs.mkdirSync(SESSION_FOLDER_NAME, { recursive: true });
if (!fs.existsSync(FAILED_QUEUE_FOLDER)) fs.mkdirSync(FAILED_QUEUE_FOLDER, { recursive: true });

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
});

const msgRetryCounterCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const processedMsgIds = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const messageQueues = new Map();

const JID_MAP_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'jid_map.json')
    : path.join(__dirname, 'jid_map.json');

const verifiedJids = (() => {
    // TTL de 24 horas para mantener la sesión fresca
    const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); 
    try {
        if (fs.existsSync(JID_MAP_FILE)) {
            const data = JSON.parse(fs.readFileSync(JID_MAP_FILE, 'utf8'));
            for (const [num, jid] of Object.entries(data)) {
                cache.set(num, jid);
            }
        }
    } catch (err) {}

    // Sobreescribir el método set para que guarde en disco automáticamente
    const originalSet = cache.set.bind(cache);
    cache.set = (key, val) => {
        const result = originalSet(key, val);
        try {
            const obj = {};
            cache.keys().forEach(k => obj[k] = cache.get(k));
            fs.writeFileSync(JID_MAP_FILE, JSON.stringify(obj));
        } catch(e) {}
        return result;
    };
    return cache;

})();



// ── Auto-reparación de sesiones Signal con Bad MAC ─────────────────────────
// Cuando un contacto manda mensajes que no podemos descifrar (Bad MAC) o
// nosotros enviamos y el receptor ve "Esperando este mensaje", es porque la
// sesión Signal con ese contacto quedó desincronizada. Tras detectar N fallos
// consecutivos, borramos la sesión Signal local con ese contacto: la próxima
// interacción fuerza a Baileys a pedir un prekey bundle fresco y renegociar
// desde cero, restaurando la entrega.
//
// TTL 10 min: si el contacto deja de fallar (porque ya quedó sincronizado),
// reseteamos el contador para no reaccionar a fallos esporádicos viejos.
const failedDecryptCounter = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const FAILED_DECRYPT_THRESHOLD = 2;
// Marcamos jids que ya intentamos reparar recientemente para no entrar en
// un bucle si el problema persiste (ej: el otro lado nos bloqueó).
const recentlyRepaired = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const tryRepairSignalSession = async (sock, jid, sessionId) => {
    if (!sock || !jid) return false;
    if (recentlyRepaired.get(jid)) return false; // ya reparado hace poco
    try {
        const signalRepo = sock.signalRepository;
        if (!signalRepo || typeof signalRepo.jidToSignalProtocolAddress !== 'function') {
            return false;
        }
        const addr = signalRepo.jidToSignalProtocolAddress(jid).toString();
        // Borrar la session local fuerza renegociacion en la proxima interaccion.
        await sock.authState.keys.set({ session: { [addr]: null } });
        recentlyRepaired.set(jid, true);
        failedDecryptCounter.del(jid);
        logger.info({ sessionId, jid, signalAddr: addr },
            'Sesion Signal reseteada por Bad MAC repetido — proxima interaccion renegocia');
        return true;
    } catch (err) {
        logger.warn({ sessionId, jid, err: err.message },
            'No se pudo resetear sesion Signal localmente');
        return false;
    }
};

const trackFailedDecrypt = (sock, jid, sessionId) => {
    if (!jid) return;
    const prev = failedDecryptCounter.get(jid) || 0;
    const next = prev + 1;
    failedDecryptCounter.set(jid, next);
    if (next >= FAILED_DECRYPT_THRESHOLD) {
        tryRepairSignalSession(sock, jid, sessionId).catch(() => {});
    }
};

// Mapeo LID → teléfono real. WhatsApp asigna a algunos contactos un JID
// "Linked Identity" (xxx@lid) que NO es el teléfono. Lo aprendemos de
// mensajes entrantes (que traen senderPn / participantPn) y lo reutilizamos
// cuando llega un mensaje saliente fromMe al mismo LID, donde senderPn
// apunta a NUESTRO teléfono y no sirve para identificar al destinatario.
// Sin esto, el bot tomaba el LID como si fuera el teléfono y el backend
// creaba un cliente duplicado.
//
// Se persiste a disco porque la cache en memoria se vaciaba en cada reinicio,
// y un fromMe que llegara antes del primer entrante del contacto quedaba sin
// resolverse y se perdía silenciosamente.
const lidMap = (() => {
    try {
        if (fs.existsSync(LID_MAP_FILE)) {
            const data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
            return new Map(Object.entries(data));
        }
    } catch (err) {
        logger?.warn?.({ err: err.message }, 'No se pudo cargar lid_map.json, empezando vacío');
    }
    return new Map();
})();

let lidMapDirty = false;
const persistLidMap = () => {
    if (!lidMapDirty) return;
    lidMapDirty = false;
    try {
        const obj = Object.fromEntries(lidMap);
        fs.writeFileSync(LID_MAP_FILE, JSON.stringify(obj), 'utf8');
    } catch (err) {
        logger.warn({ err: err.message }, 'No se pudo persistir lid_map.json');
        lidMapDirty = true;
    }
};
// Flush periódico para amortiguar muchas escrituras seguidas
setInterval(persistLidMap, 5000);
// Flush al apagar para no perder lo último aprendido
process.on('SIGTERM', persistLidMap);
process.on('SIGINT', persistLidMap);

const lidToPhone = {
    get: (lidUser) => lidMap.get(lidUser),
    set: (lidUser, phone) => {
        if (!lidUser || !phone) return;
        if (lidMap.get(lidUser) === phone) return;
        lidMap.set(lidUser, phone);
        lidMapDirty = true;
    }
};

// Store de mensajes salientes (LRU simple + persistencia en disco). Cuando
// WhatsApp del destinatario no puede descifrar un mensaje nuestro, manda un
// "retry receipt" y Baileys llama a getMessage(key) para reenviarlo encriptado
// con sesión fresca. Sin este store el mensaje se pierde — es la causa directa
// del "Esperando el mensaje. Esto puede demorar un poco." en el dispositivo
// receptor. Persistimos en disco para que los retry-receipts funcionen incluso
// después de reinicios del bot.
const SENT_STORE_MAX = 1000;
const SENT_STORE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Serialización que preserva Uint8Array/Buffer (campos de mediaKey, etc.)
const msgToJson = (obj) => JSON.stringify(obj, (_k, v) => {
    if (v instanceof Uint8Array || Buffer.isBuffer(v))
        return { __buf: Buffer.from(v).toString('base64') };
    return v;
});
const msgFromJson = (str) => JSON.parse(str, (_k, v) =>
    (v && typeof v === 'object' && v.__buf !== undefined)
        ? Uint8Array.from(Buffer.from(v.__buf, 'base64'))
        : v
);

const sentMessagesTs = new Map(); // id → timestamp de inserción

const sentMessages = (() => {
    const map = new Map();
    try {
        if (fs.existsSync(SENT_MESSAGES_FILE)) {
            const raw = fs.readFileSync(SENT_MESSAGES_FILE, 'utf8');
            const obj = msgFromJson(raw);
            const cutoff = Date.now() - SENT_STORE_TTL_MS;
            for (const [id, entry] of Object.entries(obj)) {
                if (entry && entry.ts >= cutoff) {
                    map.set(id, entry.message);
                    sentMessagesTs.set(id, entry.ts);
                }
            }
        }
    } catch (err) {
        logger?.warn?.({ err: err.message }, 'No se pudo cargar sent_messages.json, empezando vacío');
    }
    return map;
})();

let sentMessagesDirty = false;
const persistSentMessages = () => {
    if (!sentMessagesDirty) return;
    sentMessagesDirty = false;
    try {
        const obj = {};
        for (const [id, message] of sentMessages) {
            obj[id] = { message, ts: sentMessagesTs.get(id) || Date.now() };
        }
        fs.writeFileSync(SENT_MESSAGES_FILE, msgToJson(obj), 'utf8');
    } catch (err) {
        logger.warn({ err: err.message }, 'No se pudo persistir sent_messages.json');
        sentMessagesDirty = true;
    }
};
setInterval(persistSentMessages, 5000);
process.on('SIGTERM', persistSentMessages);
process.on('SIGINT', persistSentMessages);

const recordSentMessage = (key, message) => {
    if (!key?.id || !message) return;
    if (sentMessages.has(key.id)) {
        sentMessages.delete(key.id);
        sentMessagesTs.delete(key.id);
    } else if (sentMessages.size >= SENT_STORE_MAX) {
        const oldest = sentMessages.keys().next().value;
        if (oldest !== undefined) {
            sentMessages.delete(oldest);
            sentMessagesTs.delete(oldest);
        }
    }
    sentMessages.set(key.id, message);
    sentMessagesTs.set(key.id, Date.now());
    sentMessagesDirty = true;
};

// ── Autenticacion de endpoints ────────────────────────────────────────────
const requireAuth = (req, res, next) => {
    const token = req.headers['x-bot-token'];
    if (!token || !SECRET_KEY || token !== SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing Bot Token' });
    }
    next();
};

// ── SSRF protection: bloquear URLs a redes internas ───────────────────────
const isUrlSafe = (urlString) => {
    try {
        const parsed = new URL(urlString);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        const hostname = parsed.hostname;
        // Block private/internal IPs
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
        if (hostname.startsWith('10.')) return false;
        if (hostname.startsWith('192.168.')) return false;
        if (hostname.startsWith('172.') && (() => {
            const second = parseInt(hostname.split('.')[1], 10);
            return second >= 16 && second <= 31;
        })()) return false;
        if (hostname === '169.254.169.254') return false; // Cloud metadata
        if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
        return true;
    } catch {
        return false;
    }
};

// Cola en memoria por contacto: serializa mensajes del mismo remitente
function enqueueMessage(remoteJid, handler) {
    const prev = messageQueues.get(remoteJid) || Promise.resolve();
    const next = prev
        .then(handler)
        .catch(err => {
            logger.error({ remoteJid, error: err.message }, 'Error en cola de mensaje');
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
const sessionHandlers = new Map(); // Track event handlers per session for cleanup
const qrStore = new Map();

// ── Reconexion automatica con backoff exponencial ──────────────────────────
const MAX_RETRIES = 5;
const BACKOFF_DELAYS = [5000, 10000, 20000, 40000, 60000];
const reconnectState = new Map();

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

const startHealthCheck = (sessionId) => {
    const state = getReconnectState(sessionId);
    if (state.healthTimer) clearInterval(state.healthTimer);

    state.healthTimer = setInterval(async () => {
        const sock = sessions.get(sessionId);
        if (!sock || !sock.user) {
            logger.warn({ sessionId }, 'Health check: sesion no conectada, reconectando');
            clearInterval(state.healthTimer);
            state.healthTimer = null;
            scheduleReconnect(sessionId);
            return;
        }
        try {
            await sock.sendPresenceUpdate('available');
            logger.debug({ sessionId }, 'Health check OK');
        } catch (err) {
            logger.warn({ sessionId, error: err.message }, 'Health check fallo');
            clearInterval(state.healthTimer);
            state.healthTimer = null;
            scheduleReconnect(sessionId);
        }
    }, 30000);
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
            'INTERVENCION MANUAL REQUERIDA: se agotaron los reintentos');
        updateJavaStatus(sessionId, 'ERROR');
        io.emit('bot_status', { sessionId, status: 'ERROR', message: 'Requiere intervencion manual' });
        return;
    }

    const delayMs = BACKOFF_DELAYS[state.retries] || BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
    state.retries++;

    logger.info({ sessionId, attempt: state.retries, maxRetries: MAX_RETRIES, delayMs },
        `Reconexion programada: intento ${state.retries}/${MAX_RETRIES} en ${delayMs}ms`);

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        logger.info({ sessionId, attempt: state.retries }, 'Ejecutando reconexion...');
        cleanupSessionHandlers(sessionId);
        sessions.delete(sessionId);
        startSession(sessionId);
    }, delayMs);
};

// ── HTTP con reintentos ────────────────────────────────────────────────────
const axiosWithRetry = async (config, retries = 3, baseDelay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await axios(config);
        } catch (err) {
            const isLastAttempt = attempt === retries;
            const isTimeout = err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
            const isServerError = err.response?.status >= 500;

            if (isLastAttempt || (!isTimeout && !isServerError)) {
                throw err;
            }

            const delayMs = baseDelay * Math.pow(2, attempt - 1);
            logger.warn({ url: config.url, attempt, retryIn: delayMs }, `Reintento ${attempt}/${retries}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
};

// ── Persistencia: guardar mensajes fallidos a disco ────────────────────────
// Si Java no responde despues de todos los reintentos, el mensaje se guarda
// como archivo JSON en disco. Al reconectar, se reintentan automaticamente.
const saveFailedMessage = async (payload) => {
    try {
        const fileName = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
        const filePath = path.join(FAILED_QUEUE_FOLDER, fileName);
        await writeFile(filePath, JSON.stringify(payload), 'utf8');
        logger.warn({ file: fileName }, 'Mensaje guardado en disco (Java no responde)');
    } catch (err) {
        logger.error({ error: err.message }, 'ERROR CRITICO: No se pudo guardar mensaje a disco');
    }
};

const retryFailedMessages = async () => {
    try {
        const files = await readdir(FAILED_QUEUE_FOLDER);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        if (jsonFiles.length === 0) return;

        logger.info({ count: jsonFiles.length }, 'Reintentando mensajes guardados en disco...');

        for (const file of jsonFiles) {
            const filePath = path.join(FAILED_QUEUE_FOLDER, file);
            try {
                const data = await readFile(filePath, 'utf8');
                const { url, payload } = JSON.parse(data);

                await axiosWithRetry({
                    method: 'post',
                    url,
                    data: payload,
                    headers: { 'X-Bot-Token': SECRET_KEY },
                    timeout: 15000
                });

                await unlink(filePath);
                logger.info({ file }, 'Mensaje recuperado y enviado a Java');
            } catch (err) {
                logger.warn({ file, error: err.message }, 'Aun no se puede enviar, queda en disco');
                break; // Si Java sigue caido, no seguir intentando
            }
        }
    } catch (err) {
        logger.error({ error: err.message }, 'Error reintentando mensajes fallidos');
    }
};

// Reintentar mensajes fallidos cada 30 segundos
setInterval(retryFailedMessages, 30000);

// ── Funciones de utilidad ──────────────────────────────────────────────────

const formatToJid = (number) => {
    if (!number) return null;
    let clean = number.toString().replace(/\D/g, '');
    if (clean.length < 7 || clean.length > 15) return null;
    return `${clean}@s.whatsapp.net`;
};

const getRealNumber = (jid) => {
    if (!jid) return '';
    const decoded = jidDecode(jid);
    const user = decoded ? decoded.user : jid.split('@')[0];
    const baseNumber = user.split(':')[0];

    // Normalizar numeros argentinos al formato canonico 549XXXXXXXXXX
    const digits = baseNumber.replace(/\D/g, '');
    if (digits.startsWith('54')) {
        let resto = digits.substring(2);
        while (resto.startsWith('0')) resto = resto.substring(1);
        if (resto.startsWith('9') && resto.length === 11) resto = resto.substring(1);
        if (resto.length === 10) return '549' + resto;
    }

    return digits || baseNumber;
};

// Extrae solo la parte "user" del JID (sin server ni device).
const getJidUser = (jid) => {
    if (!jid) return null;
    const decoded = jidDecode(jid);
    const user = decoded ? decoded.user : jid.split('@')[0];
    return user.split(':')[0];
};

// Resuelve el teléfono real del OTRO extremo de la conversación a partir
// de un mensaje. Maneja tanto entrantes como salientes y los JIDs @lid.
// Devuelve null si no se puede resolver (caller debe descartar el mensaje
// en lugar de crear un contacto con identificador LID).
const resolverTelefonoContacto = (msg) => {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return null;

    // 1:1 con JID normal: el "user" del remoteJid es el teléfono.
    if (!remoteJid.includes('@lid')) {
        return getRealNumber(remoteJid) || null;
    }

    const lidUser = getJidUser(remoteJid);

    // Para mensajes entrantes (no fromMe), senderPn es el teléfono del
    // contacto que escribió. Lo cacheamos para usarlo en futuros salientes.
    if (!msg.key.fromMe && msg.key.senderPn) {
        const pn = getRealNumber(msg.key.senderPn);
        if (pn) {
            if (lidUser) lidToPhone.set(lidUser, pn);
            return pn;
        }
    }

    // participantPn a veces viene populado por WhatsApp con el PN del
    // contraparte. Sirve tanto para entrantes como salientes.
    if (msg.key.participantPn) {
        const pn = getRealNumber(msg.key.participantPn);
        if (pn) {
            if (lidUser) lidToPhone.set(lidUser, pn);
            return pn;
        }
    }

    // Fallback: cache previamente alimentado por mensajes entrantes del
    // mismo contacto. Cubre el caso fromMe (donde senderPn es nuestro
    // propio teléfono y no sirve para identificar al destinatario).
    if (lidUser) {
        const cached = lidToPhone.get(lidUser);
        if (cached) return cached;
    }

    return null;
};

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
    if (mt.includes('audio/ogg')) return 'ogg';
    if (mt.includes('audio/webm')) return 'webm';
    if (mt.includes('audio/mpeg') || mt.includes('audio/mp3')) return 'mp3';
    if (mt.includes('audio/mp4') || mt.includes('audio/m4a')) return 'm4a';
    if (mt.includes('audio')) return 'ogg';
    if (mt.includes('pdf')) return 'pdf';
    if (mt.includes('word') || mt.includes('docx')) return 'docx';
    if (mt.includes('excel') || mt.includes('xlsx') || mt.includes('spreadsheet')) return 'xlsx';
    if (mt.includes('zip')) return 'zip';
    return 'bin';
};

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

// ── Comunicacion con Java Backend ──────────────────────────────────────────

const getBaseUrl = () => {
    let baseUrl = JAVA_BACKEND_URL.replace(/\/$/, '');
    if (!baseUrl.includes('/api/webhook/whatsapp')) baseUrl += '/api/webhook/whatsapp';
    return baseUrl;
};

const updateJavaStatus = async (sessionId, status, phoneUser = null) => {
    try {
        const cleanPhone = phoneUser ? phoneUser.split(':')[0] : null;
        const payload = { sessionId, status, phone: cleanPhone, qr: null };

        await axiosWithRetry({
            method: 'post',
            url: `${getBaseUrl()}/status`,
            data: payload,
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        });
        logger.info({ sessionId, status, cleanPhone }, 'Estado enviado a Java CRM');
    } catch (e) {
        logger.error({ sessionId, error: e.message }, 'Error contactando Java Backend (status)');
    }
};

const sendStatusUpdateToJava = async (sessionId, statusData) => {
    try {
        await axiosWithRetry({
            method: 'post',
            url: `${getBaseUrl()}/message-status`,
            data: { sessionId, ...statusData },
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        }, 2, 500);
    } catch (e) {
        if (e.code !== 'ECONNABORTED') {
            logger.warn({ error: e.message }, 'Error enviando status tick a Java');
        }
    }
};

// Enviar mensaje entrante a Java con fallback a disco
const sendIncomingToJava = async (payload) => {
    const url = `${getBaseUrl()}/robot`;
    try {
        await axiosWithRetry({
            method: 'post',
            url,
            data: payload,
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        });
    } catch (err) {
        logger.error({ from: payload.from, error: err.message }, 'Java no responde, guardando mensaje a disco');
        await saveFailedMessage({ url, payload });
    }
};

// ── Descarga de media con reintentos ───────────────────────────────────────
const downloadMediaWithRetry = async (msg, sock, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger, reuploadRequest: sock.updateMediaMessage }
            );
            return buffer;
        } catch (err) {
            if (attempt === maxRetries) {
                logger.error({ attempt, error: err.message }, 'Fallo descarga de media despues de todos los reintentos');
                return null;
            }
            logger.warn({ attempt, error: err.message }, `Reintento descarga media ${attempt}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return null;
};

// Extrae el contenido relevante de un mensaje WhatsApp y, si trae media,
// la descarga + guarda en UPLOADS_FOLDER. Compartido por entrantes y
// salientes-desde-celular para que ambos flujos manejen los mismos tipos.
// Retorna { texto, mediaUrl, mimeType } o null si el mensaje no tiene contenido.
const extractMessageContent = async (msg, sessionId, sock) => {
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

    if (!texto && !isMedia) return null;

    let mediaUrl = null;
    let mimeType = null;

    if (isMedia) {
        const buffer = await downloadMediaWithRetry(msg, sock);

        if (buffer) {
            // Para viewOnce, el media esta anidado
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
        } else {
            if (!texto) texto = `[${messageType.replace('Message', '')} - no se pudo descargar]`;
            logger.warn({ sessionId, messageType }, 'Media no descargable, enviando solo texto');
        }
    }

    return { texto, mediaUrl, mimeType };
};

// ── Procesamiento de mensajes entrantes ────────────────────────────────────
const processIncomingMessage = async (msg, sessionId, sock) => {
    try {
        const remoteJid = msg.key.remoteJid;

        // Filtrar JIDs que nunca son chats 1:1
        if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@newsletter') || remoteJid === 'status@broadcast') {
            return;
        }

        // Resolver telefono real del contacto. Maneja JIDs @lid (Linked
        // Identity) usando senderPn / participantPn y un cache LID→PN.
        const numeroReal = resolverTelefonoContacto(msg);
        if (!numeroReal) {
            logger.warn({ sessionId, remoteJid }, 'No se pudo resolver telefono real del contacto, ignorando mensaje');
            return;
        }
        if (remoteJid.includes('@lid')) {
            logger.info({ sessionId, lid: remoteJid, phone: numeroReal }, 'LID resuelto a telefono');
        }

        verifiedJids.set(numeroReal, remoteJid);

        logger.info(`Mensaje entrante - From: ${remoteJid} | Numero: ${numeroReal}`);
        
        const content = await extractMessageContent(msg, sessionId, sock);
        if (!content) return;
        const { texto, mediaUrl, mimeType } = content;

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

        logger.info({ from: numeroReal, body: texto?.substring(0, 50) }, "Enviando a Java CRM");
        await sendIncomingToJava(payload);

    } catch (e) {
        logger.error({ error: e.message }, 'Error procesando mensaje entrante');
    }
};

// ── Procesamiento de mensajes salientes desde el celular del vendedor ──────
// El vendedor escribe directo en WhatsApp desde su celular; el linked device
// (bot) recibe el mensaje como fromMe. Capturamos texto y media para que
// aparezcan en el CRM como si se hubieran enviado desde la interfaz web.
const processOutgoingExternalMessage = async (msg, sessionId, sock) => {
    try {
        const remoteJid = msg.key.remoteJid;

        const to = resolverTelefonoContacto(msg);
        if (!to) {
            logger.warn({ sessionId, remoteJid, msgId: msg.key.id },
                'fromMe a LID sin PN conocido, ignorando para no duplicar contacto');
            return;
        }

        verifiedJids.set(to, remoteJid);

        const content = await extractMessageContent(msg, sessionId, sock);
        if (!content) return;
        const { texto, mediaUrl, mimeType } = content;

        logger.info({ sessionId, to, msgId: msg.key.id, hasMedia: !!mediaUrl, preview: texto?.substring(0, 30) },
            'fromMe desde celular del vendedor');

        await axiosWithRetry({
            method: 'post',
            url: `${getBaseUrl()}/outbound-external`,
            data: { sessionId, to, body: texto, whatsappId: msg.key.id, mediaUrl, mimeType },
            headers: { 'X-Bot-Token': SECRET_KEY },
            timeout: 15000
        }, 2, 500).catch(err =>
            logger.warn({ to, error: err.message }, 'Error reenviando mensaje saliente externo a Java')
        );
    } catch (e) {
        logger.error({ error: e.message }, 'Error procesando mensaje saliente externo');
    }
};

// ── Gestion de sesiones ────────────────────────────────────────────────────

const cleanupSessionHandlers = (sessionId) => {
    const handlers = sessionHandlers.get(sessionId);
    if (handlers?.sock?.ev) {
        try {
            if (handlers.credsUpdate) handlers.sock.ev.off('creds.update', handlers.credsUpdate);
            if (handlers.connectionUpdate) handlers.sock.ev.off('connection.update', handlers.connectionUpdate);
            if (handlers.messagesUpsert) handlers.sock.ev.off('messages.upsert', handlers.messagesUpsert);
            if (handlers.messagesUpdate) handlers.sock.ev.off('messages.update', handlers.messagesUpdate);
        } catch (err) { logger.warn({ sessionId, error: err.message }, 'Error limpiando event listeners'); }
    }
    sessionHandlers.delete(sessionId);
};

const safeRemoveSession = (sessionId) => {
    cleanupSessionHandlers(sessionId);
    const authPath = path.join(SESSION_FOLDER_NAME, sessionId);
    try {
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            logger.info({ sessionId }, 'Sesion eliminada del disco');
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
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 20000,
            retryRequestDelayMs: 500,
            msgRetryCounterCache,
            mobile: false,
            // Permite que WhatsApp pida reenvío de un mensaje nuestro cuando
            // el destinatario no pudo descifrarlo. Sin esto, los retry
            // receipts se pierden y el mensaje nunca llega.
            getMessage: async (key) => {
                const stored = sentMessages.get(key.id);
                if (stored) return stored;
                return undefined;
            }
        });

        sessions.set(sessionId, sock);
        qrStore.set(sessionId, "WAITING");

        if (phoneNumber && !sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    logger.info({ sessionId, phoneNumber }, 'Pidiendo Pairing Code...');
                    const code = await sock.requestPairingCode(phoneNumber);
                    qrStore.set(sessionId, code);
                } catch (e) {
                    qrStore.set(sessionId, "ERROR");
                }
            }, 6000);
        }

        // Store handlers for cleanup on session destroy
        const handlers = { sock };
        handlers.credsUpdate = saveCreds;
        sock.ev.on('creds.update', handlers.credsUpdate);

        handlers.connectionUpdate = async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    const url = await qrcode.toDataURL(qr);
                    qrStore.set(sessionId, url);
                } catch (e) {}
            }

            if (connection === 'open') {
                logger.info({ sessionId }, 'CONEXION EXITOSA');
                qrStore.delete(sessionId);
                resetReconnectState(sessionId);
                startHealthCheck(sessionId);
                const userPhone = sock.user ? sock.user.id.split(':')[0] : undefined;
                await updateJavaStatus(sessionId, 'CONNECTED', userPhone);
                io.emit('bot_status', { sessionId, status: 'CONNECTED' });

                // Al reconectar, reintentar mensajes que quedaron en disco
                retryFailedMessages();
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                stopHealthCheck(sessionId);

                if (!shouldReconnect) {
                    logger.info({ sessionId, statusCode }, 'Logout intencional, sin reconexion');
                    sessions.delete(sessionId);
                    qrStore.delete(sessionId);
                    safeRemoveSession(sessionId);
                    reconnectState.delete(sessionId);
                    await updateJavaStatus(sessionId, 'DISCONNECTED');
                    io.emit('bot_status', { sessionId, status: 'DISCONNECTED' });
                } else {
                    logger.warn({ sessionId, statusCode }, 'Desconexion inesperada, programando reconexion...');
                    sessions.delete(sessionId);
                    await updateJavaStatus(sessionId, 'RECONNECTING');
                    io.emit('bot_status', { sessionId, status: 'RECONNECTING' });
                    scheduleReconnect(sessionId);
                }
            }
        };
        sock.ev.on('connection.update', handlers.connectionUpdate);

        handlers.messagesUpsert = (m) => {
            for (const msg of m.messages) {
                // Mensaje sin contenido = Baileys no pudo descifrarlo (Bad MAC).
                // Trackeamos para auto-resetear la sesion Signal con ese
                // contacto si pasa varias veces seguidas. Si no lo haciamos,
                // los Bad MAC se acumulaban indefinidamente y los mensajes
                // del cliente nunca llegaban al CRM.
                if (!msg.message) {
                    const failedJid = msg.key?.remoteJid;
                    if (failedJid && !msg.key?.fromMe
                            && !failedJid.includes('@g.us')
                            && !failedJid.includes('@newsletter')
                            && failedJid !== 'status@broadcast') {
                        trackFailedDecrypt(sock, failedJid, sessionId);
                    }
                    continue;
                }

                const remoteJid = msg.key.remoteJid;
                if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@newsletter') || remoteJid === 'status@broadcast') continue;

                if (msg.key.fromMe) {
                    // Cualquier saliente que vea el linked device (sea de bot,
                    // CRM o celular) se guarda por si el destinatario pide retry.
                    recordSentMessage(msg.key, msg.message);

                    const outKey = 'out_' + msg.key.id;
                    if (processedMsgIds.get(outKey)) continue;
                    processedMsgIds.set(outKey, true);

                    // Encolado por contacto para preservar orden y permitir la
                    // descarga async de media sin bloquear el handler.
                    enqueueMessage('out_' + remoteJid, () => processOutgoingExternalMessage(msg, sessionId, sock));
                    continue;
                }

                const msgId = msg.key.id;
                if (processedMsgIds.get(msgId)) continue;
                processedMsgIds.set(msgId, true);

                enqueueMessage(remoteJid, () => processIncomingMessage(msg, sessionId, sock));
            }
        };
        sock.ev.on('messages.upsert', handlers.messagesUpsert);

        handlers.messagesUpdate = async (updates) => {
            for (const update of updates) {
                if (!update.key.fromMe) continue;

                if (update.update.status) {
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
        };
        sock.ev.on('messages.update', handlers.messagesUpdate);

        sessionHandlers.set(sessionId, handlers);

    } catch (err) {
        logger.error({ err }, "Error fatal iniciando sesion");
        qrStore.set(sessionId, "ERROR");
    }
};

const restoreExistingSessions = () => {
    try {
        if (!fs.existsSync(SESSION_FOLDER_NAME)) return;

        const entries = fs.readdirSync(SESSION_FOLDER_NAME, { withFileTypes: true });
        const sessionIds = entries
            .filter(e => e.isDirectory())
            .map(e => e.name);

        if (sessionIds.length === 0) {
            logger.info('No hay sesiones guardadas para restaurar');
            return;
        }

        logger.info({ count: sessionIds.length, sessions: sessionIds }, 'Restaurando sesiones guardadas...');

        sessionIds.forEach((sessionId, index) => {
            setTimeout(() => {
                logger.info({ sessionId }, `Restaurando sesion [${index + 1}/${sessionIds.length}]`);
                startSession(sessionId);
            }, index * 2000);
        });
    } catch (err) {
        logger.error({ err }, 'Error restaurando sesiones');
    }
};

// ── ENDPOINTS ──────────────────────────────────────────────────────────────

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
        failedQueueSize: fs.readdirSync(FAILED_QUEUE_FOLDER).filter(f => f.endsWith('.json')).length,
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

app.post('/session/reset', requireAuth, async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).send("Falta sessionId");

    const sock = sessions.get(sessionId);
    if (sock) {
        try {
            await sock.logout();
            logger.info({ sessionId }, "Logout remoto enviado a WhatsApp");
        } catch (e) {
            logger.warn({ sessionId }, "No se pudo cerrar sesion remota");
        }
        try { sock.end(undefined); } catch (e) {}
        sessions.delete(sessionId);
    }

    safeRemoveSession(sessionId);
    qrStore.delete(sessionId);
    reconnectState.delete(sessionId);

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

app.post('/session/start', requireAuth, (req, res) => {
    const { sessionId } = req.body;
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

app.post('/session/pair-code', requireAuth, async (req, res) => {
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

app.post('/chat/read', requireAuth, async (req, res) => {
    const { sessionId, number, messageIds } = req.body;
    const sock = sessions.get(sessionId);

    if (!sock) return res.status(404).json({ error: 'Sesion no activa' });

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
        logger.error({ error: e.message }, "Error marcando leido");
        res.status(500).json({ error: e.message });
    }
});

// ── Rate limiting por numero ───────────────────────────────────────────────
const sendTimestamps = new Map();
const RATE_LIMIT_TTL = 60000; // 1 minuto

// Limpieza periodica de sendTimestamps para evitar memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of sendTimestamps) {
        if (now - ts > RATE_LIMIT_TTL) sendTimestamps.delete(key);
    }
}, RATE_LIMIT_TTL);

const waitForRateLimit = async (numero) => {
    const lastSend = sendTimestamps.get(numero) || 0;
    const elapsed = Date.now() - lastSend;
    const MIN_INTERVAL = 1000;

    if (elapsed < MIN_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL - elapsed));
    }
    sendTimestamps.set(numero, Date.now());
};

// ── Reparacion manual de sesion Signal con un contacto ────────────────────
// Borra la sesion Signal local con el contacto indicado. La proxima vez que
// le enviemos o nos escriba, Baileys renegocia desde cero y los "Esperando
// este mensaje" del lado del receptor desaparecen.
app.post('/session/repair-contact', requireAuth, async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'Faltan datos' });
    const sock = sessions.get(sessionId);
    if (!sock) return res.status(404).json({ error: 'Sesion no activa' });
    try {
        let jid = verifiedJids.get(number);
        if (!jid) {
            const rawJid = formatToJid(number);
            const [result] = await sock.onWhatsApp(rawJid);
            if (!result?.exists) return res.status(400).json({ error: 'Numero no esta en WhatsApp' });
            jid = result.jid;
            verifiedJids.set(number, jid);
        }
        const ok = await tryRepairSignalSession(sock, jid, sessionId);
        return res.json({ status: ok ? 'REPAIRED' : 'NO_OP', jid });
    } catch (e) {
        logger.error({ sessionId, number, err: e.message }, 'Error reparando sesion Signal');
        return res.status(500).json({ error: e.message });
    }
});

// ── Envio de mensajes de texto ─────────────────────────────────────────────
// Respuesta sincronica: devuelve el waId para que Java trackee delivery/read
app.post('/send-message', requireAuth, async (req, res) => {
    const { sessionId, number, message } = req.body;
    const sock = sessions.get(sessionId);
    if (!sock) return res.status(404).json({ error: 'Sesion no activa' });

    try {
        const jid = formatToJid(number);
        let finalJid;

        const cachedJid = verifiedJids.get(number);

        if (cachedJid) {
            finalJid = cachedJid;
        } else {
            const [result] = await sock.onWhatsApp(jid);
            if (!result?.exists) {
                return res.status(400).json({ error: 'Numero no encontrado', jid });
            }
            finalJid = result.jid;
            verifiedJids.set(number, finalJid);
            // Si WhatsApp asignó un JID @lid, mapearlo al teléfono real
            // para que un futuro mensaje fromMe (vendedor desde celular)
            // se resuelva al mismo contacto y no genere duplicado.
            if (finalJid && finalJid.includes('@lid')) {
                const lidUser = getJidUser(finalJid);
                if (lidUser) lidToPhone.set(lidUser, number);
            }
        }

        await waitForRateLimit(number);
        const sent = await sock.sendMessage(finalJid, { text: message });
        recordSentMessage(sent.key, sent.message);
        res.json({ status: 'SENT', jid: finalJid, id: sent.key.id });
    } catch (e) {
        logger.error({ sessionId, number, error: e.message }, "Error enviando mensaje");
        res.status(500).json({ error: e.message });
    }
});

// ── Envio de media ─────────────────────────────────────────────────────────
// Respuesta sincronica: devuelve el waId
app.post('/send-media', requireAuth, async (req, res) => {
    const { sessionId, number, message, url, type, filename, base64, mimetype } = req.body;
    const sock = sessions.get(sessionId);
    if (!sock) return res.status(404).json({ error: 'Sesion no activa' });

    try {
        let jid;
        const cachedJid = verifiedJids.get(number);
        if (cachedJid) {
            jid = cachedJid;
        } else {
            const rawJid = formatToJid(number);
            const [result] = await sock.onWhatsApp(rawJid);
            if (!result?.exists) {
                return res.status(400).json({ error: 'Numero no encontrado en WhatsApp', jid: rawJid });
            }
            jid = result.jid;
            verifiedJids.set(number, jid);
            // Mismo cacheo LID→PN que en /send-message: evita que un
            // posterior fromMe al mismo @lid se interprete como contacto nuevo.
            if (jid && jid.includes('@lid')) {
                const lidUser = getJidUser(jid);
                if (lidUser) lidToPhone.set(lidUser, number);
            }
        }

        let buffer, contentType;
        if (base64) {
            const MAX_BASE64_SIZE = 50 * 1024 * 1024; // 50MB
            if (base64.length > MAX_BASE64_SIZE) {
                return res.status(400).json({ error: 'Archivo demasiado grande' });
            }
            buffer = Buffer.from(base64, 'base64');
            contentType = mimetype || 'application/octet-stream';
        } else {
            if (!url || !isUrlSafe(url)) {
                return res.status(400).json({ error: 'URL no permitida o invalida' });
            }
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            buffer = Buffer.from(response.data, 'binary');
            contentType = response.headers['content-type'] || '';
        }

        let mediaPayload = {};

        if (type === 'IMAGEN') {
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
            const isOgg = contentType.includes('ogg') || (url && url.endsWith('.ogg'));
            let audioBuffer = buffer;
            let asVoiceNote = isOgg;
            if (!isOgg) {
                // WhatsApp solo entrega voice notes en ogg/opus. Cualquier otro
                // contenedor (webm de MediaRecorder, mp3, m4a) lo acepta la API
                // pero no se lo envía al destinatario. Convertimos con ffmpeg.
                try {
                    audioBuffer = await convertToOggOpus(buffer);
                    asVoiceNote = true;
                    logger.info({ originalMime: contentType, ogSize: buffer.length, oggSize: audioBuffer.length }, 'Audio convertido a ogg/opus');
                } catch (e) {
                    logger.error({ error: e.message, contentType }, 'Conversión a opus falló, fallback a audio regular');
                    asVoiceNote = false;
                    audioBuffer = buffer;
                }
            }
            if (asVoiceNote) {
                mediaPayload = {
                    audio: audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                };
            } else {
                const audMime = contentType.split(';')[0].trim() || 'audio/mpeg';
                mediaPayload = {
                    audio: audioBuffer,
                    mimetype: audMime,
                    ptt: false
                };
            }
        } else if (type === 'STICKER') {
            mediaPayload = {
                sticker: buffer,
                mimetype: 'image/webp'
            };
        } else {
            // DOCUMENTO: derivar mimetype desde filename si es octet-stream
            const rawMime = contentType.split(';')[0].trim();
            const fileName = filename || getFileNameFromUrl(url || '', rawMime);
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
        recordSentMessage(sent.key, sent.message);
        res.json({ status: 'SENT', id: sent.key.id });
    } catch (e) {
        logger.error({ error: e.message }, "Error enviando media");
        res.status(500).json({ error: e.message });
    }
});

// ── Keepalive ──────────────────────────────────────────────────────────────
const KEEPALIVE_URL = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}/health`
    : `http://localhost:${PORT}/health`;
setInterval(() => { axios.get(KEEPALIVE_URL).catch(() => {}); }, 600000);

// ── Arranque ───────────────────────────────────────────────────────────────
// Node default keepAliveTimeout = 5s. El RestTemplate del backend mantiene un
// pool de conexiones HTTP que sobrevive más que eso, y al reutilizar una
// conexión que el bot ya cerró tira "header parser received no bytes".
// 65s es lo que recomienda AWS ELB / nginx por defecto para entornos detrás
// de proxy, y elimina la race.
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000; // siempre > keepAliveTimeout

server.listen(PORT, '0.0.0.0', () => {
    logger.info(`BOT SERVER LISTO EN PUERTO ${PORT}`);
    restoreExistingSessions();
});
