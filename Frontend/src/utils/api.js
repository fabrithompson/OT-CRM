import axios from 'axios';

const BASE_URL = '/api/v1';
const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

const api = axios.create({ baseURL: BASE_URL });

function esValido(v) {
    return v && v !== 'undefined' && v !== 'null';
}

export function getToken() {
    const t = localStorage.getItem(TOKEN_KEY);
    return esValido(t) ? t : null;
}

export function getRefreshToken() {
    const t = localStorage.getItem(REFRESH_TOKEN_KEY);
    return esValido(t) ? t : null;
}

export function setTokens(token, refreshToken) {
    localStorage.setItem(TOKEN_KEY, token);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function irALogin() {
    clearTokens();
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// El access token ahora dura minutos (antes 10hs): cualquier pantalla que
// quede abierta un rato va a pegarle a un endpoint con el token vencido tarde
// o temprano. En vez de mandar a todos a /login en ese momento, se intenta
// renovar UNA vez con el refresh token y reintentar el request original.
//
// refreshPromise dedupea: si varios requests fallan con 401 al mismo tiempo
// (una pantalla que dispara varios api.get en paralelo al montar), todos
// esperan la MISMA llamada a /auth/refresh en vez de disparar una por cada
// uno — evitaría además que la rotación del refresh token (RefreshTokenService)
// invalide el que usa el segundo request antes de que llegue a usarlo.
let refreshPromise = null;

function refrescarSesion() {
    if (!refreshPromise) {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            return Promise.reject(new Error('No hay refresh token'));
        }
        refreshPromise = axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
            .then((res) => {
                setTokens(res.data.token, res.data.refreshToken);
                return res.data.token;
            })
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        // 401 = no autenticado (token ausente/inválido/expirado —
        // SecurityConfig.authenticationEntryPoint). 403 = autenticado pero sin
        // permiso para ESTA acción (@PreAuthorize, agencia distinta, etc.): no
        // hay que tocar la sesión en ese caso, sería desloguear a alguien que
        // está bien logueado por una acción puntual que no le corresponde.
        if (error.response?.status !== 401 || !original || original._retry) {
            return Promise.reject(error);
        }
        if (original.url?.includes('/auth/refresh') || original.url?.includes('/auth/login')) {
            // El propio refresh (o el login) devolviendo 401 significa que no
            // hay sesión que salvar.
            irALogin();
            return Promise.reject(error);
        }
        if (!getRefreshToken()) {
            irALogin();
            return Promise.reject(error);
        }

        original._retry = true;
        try {
            const nuevoToken = await refrescarSesion();
            original.headers.Authorization = `Bearer ${nuevoToken}`;
            return api(original);
        } catch {
            irALogin();
            return Promise.reject(error);
        }
    }
);

export default api;

export function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace('T', ' '));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso, todayLabel = 'Hoy', locale = undefined) {
    if (!iso) return null;
    const d = new Date(iso.replace('T', ' '));
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? todayLabel
        : d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

export function getAuthHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function expiracionDe(token) {
    try {
        const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(payloadB64));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

// Margen antes de que expire para considerarlo "por vencer" y refrescarlo
// proactivamente, en vez de esperar a que un request falle con 401.
const MARGEN_REFRESH_MS = 60_000;

/**
 * Devuelve un access token con margen de vida, refrescando la sesión primero
 * si el actual está por vencer. Pensado para useWebSocket: una pantalla como
 * el Kanban se deja abierta sin tocar nada durante horas, y sin esto una
 * reconexión de WS con el token ya vencido entraba en loop con
 * WebSocketConfig.authenticateConnection rechazándola una y otra vez — nada
 * más en la app dispara naturalmente un refresh si no hay requests REST.
 */
export async function asegurarTokenFresco() {
    const token = getToken();
    if (!token) return null;

    const exp = expiracionDe(token);
    if (exp !== null && exp - Date.now() > MARGEN_REFRESH_MS) {
        return token;
    }
    if (!getRefreshToken()) {
        return token;
    }
    try {
        return await refrescarSesion();
    } catch {
        return token;
    }
}

/**
 * fetch nativo con el mismo refresh-and-retry que el interceptor de arriba,
 * para los pocos casos (subida de archivos con FormData) que no pueden pasar
 * por el cliente axios. Antes, con el access token de 10hs, esto casi nunca
 * importaba; con un token de minutos es mucho más fácil que alguien tarde en
 * adjuntar un archivo y el token ya haya vencido a mitad de sesión.
 */
export async function fetchConReintento(url, options = {}) {
    const conAuth = (token) => ({
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });

    let res = await fetch(url, conAuth(getToken()));
    if (res.status === 401 && getRefreshToken()) {
        try {
            const nuevoToken = await refrescarSesion();
            res = await fetch(url, conAuth(nuevoToken));
        } catch {
            irALogin();
        }
    }
    return res;
}
