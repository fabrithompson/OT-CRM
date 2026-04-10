import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';

const PAGE_TITLES = {
  '/':                  'OT CRM — CRM para WhatsApp y Telegram',
  '/login':             'OT CRM — Iniciar sesión',
  '/dashboard':         'Dashboard',
  '/kanban':            'Embudo',
  '/contactos':         'Contactos',
  '/respuestas-rapidas':'Respuestas Rápidas',
  '/planes':            'Suscripción',
  '/mi-suscripcion':    'Mi Suscripción',
  '/perfil':            'Cuenta',
};

function TitleUpdater() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || 'OT CRM';
  }, [pathname]);
  return null;
}

// Auth se carga eager (es la primera pantalla que ve el usuario)
import Auth from './pages/Auth';
import MainLayout from './components/MainLayout';
import { ToastProvider } from './context/ToastContext';
import { UserProvider } from './context/UserContext';

const Landing = lazy(() => import('./pages/Landing'));

// Lazy loading: cada página se descarga solo cuando el usuario navega a ella
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Kanban = lazy(() => import('./pages/Kanban'));
const WhatsAppVincular = lazy(() => import('./pages/WhatsAppVincular'));
const TelegramVincular = lazy(() => import('./pages/TelegramVincular'));
const Contactos = lazy(() => import('./pages/Contactos'));
const RespuestasRapidas = lazy(() => import('./pages/RespuestasRapidas'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Planes = lazy(() => import('./pages/Planes'));
const Checkout = lazy(() => import('./pages/Checkout'));
const MiSuscripcion = lazy(() => import('./pages/MiSuscripcion'));

function App() {
  return (
    <UserProvider>
    <ToastProvider>
      <Router>
        <TitleUpdater />
        <Suspense fallback={<div className="app-loading" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth />} />

            <Route element={<MainLayout />}>
              <Route path="/dashboard"          element={<Dashboard />} />
              <Route path="/kanban"             element={<Kanban />} />
              <Route path="/whatsapp-vincular"  element={<WhatsAppVincular />} />
              <Route path="/telegram-vincular"  element={<TelegramVincular />} />
              <Route path="/respuestas-rapidas" element={<RespuestasRapidas/>} />
              <Route path="/contactos"          element={<Contactos />} />
              <Route path="/planes"             element={<Planes />} />
              <Route path="/perfil"             element={<Perfil />} />
              <Route path="/checkout"        element={<Checkout />} />
              <Route path="/mi-suscripcion"  element={<MiSuscripcion />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </ToastProvider>
    </UserProvider>
  );
}

export default App;
