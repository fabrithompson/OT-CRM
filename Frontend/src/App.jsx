import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import WhatsAppVincular from './pages/WhatsAppVincular';
import TelegramVincular from './pages/TelegramVincular';
import Contactos from './pages/Contactos';
import MainLayout from './components/MainLayout';
import { ToastProvider } from './context/ToastContext';
import RespuestasRapidas from './pages/RespuestasRapidas';
import Perfil from './pages/Perfil';
import Planes from './pages/Planes';
import Checkout from './pages/Checkout';
import MiSuscripcion from './pages/MiSuscripcion';

function App() {
  return (
    <ToastProvider>
      <Router>
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
  );
}

export default App;