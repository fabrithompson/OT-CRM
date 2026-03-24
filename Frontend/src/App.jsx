import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

const PAGE_TITLES = {
  '/login':             'OT CRM',
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
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import WhatsAppVincular from './pages/WhatsAppVincular';
import TelegramVincular from './pages/TelegramVincular';
import Contactos from './pages/Contactos';
import MainLayout from './components/MainLayout';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import RespuestasRapidas from './pages/RespuestasRapidas';
import Perfil from './pages/Perfil';
import Planes from './pages/Planes';
import Checkout from './pages/Checkout';
import MiSuscripcion from './pages/MiSuscripcion';

function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
      <Router>
        <TitleUpdater />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
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
      </Router>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;