import axios from 'axios';

const BASE_URL = '/api/v1';
const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'undefined' && token !== 'null') {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;

export function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace('T', ' '));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso.replace('T', ' '));
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? 'Hoy'
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return (token && token !== 'undefined' && token !== 'null') 
        ? { Authorization: `Bearer ${token}` } 
        : {};
}