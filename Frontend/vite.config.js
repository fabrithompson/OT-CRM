import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    define: {
        global: 'globalThis',
    },
    server: {
        port: 5173,
        // Proxy de desarrollo: reenvía la API y el WebSocket al backend (Docker
        // publica el backend en el host:8081). Permite usar `pnpm dev` con
        // hot-reload contra el backend real (login, Auditoría, etc.).
        proxy: {
            '/api/v1': {
                target: 'http://localhost:8081',
                changeOrigin: true,
            },
            '/ws-crm': {
                target: 'http://localhost:8081',
                changeOrigin: true,
                ws: true,
            },
        },
    },
});