import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import LogoOrb from './LogoOrb';

export default function Sidebar() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { usuario } = useUser();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const getInitials = () => {
        if (usuario?.nombreCompleto) return usuario.nombreCompleto.charAt(0).toUpperCase();
        if (usuario?.username)       return usuario.username.charAt(0).toUpperCase();
        return '?';
    };

    const isSuscripcionActive = pathname === '/planes' || pathname === '/mi-suscripcion' || pathname === '/checkout';

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <LogoOrb size={40} onClick={() => navigate('/dashboard')} />
            </div>

            <ul className="menu-list">
                <li className="menu-item">
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-home"></i>
                        <span className="link-text">Inicio</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/kanban" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fa-solid fa-filter"></i>
                        <span className="link-text">Embudo</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/respuestas-rapidas" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-bolt"></i>
                        <span className="link-text">Respuestas</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/contactos" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-users"></i>
                        <span className="link-text">Contactos</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/planes" className={() => isSuscripcionActive ? 'active' : ''}>
                        <i className="fas fa-crown"></i>
                        <span className="link-text">Suscripción</span>
                    </NavLink>
                </li>
            </ul>

            <ul className="menu-bottom">
                <li className="menu-item">
                    <NavLink to="/perfil" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fa-solid fa-user"></i>
                        <span className="link-text">Cuenta</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="logout-btn"
                        style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                    >
                        <i className="fas fa-sign-out-alt"></i>
                        <span className="link-text">Salir</span>
                    </button>
                </li>
            </ul>

            <div className="sidebar-footer">
                <div className="footer-left">
                    <div className="avatar-container">
                        {usuario?.fotoUrl ? (
                            <img src={usuario.fotoUrl} className="user-img" alt="Avatar" />
                        ) : (
                            <div className="user-avatar-placeholder">
                                <span>{getInitials()}</span>
                            </div>
                        )}
                    </div>
                    <div className="user-info">
                        <span>{usuario?.nombreCompleto || usuario?.username || 'Cargando...'}</span>
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {usuario?.rol === 'ADMIN' ? 'Admin' : 'Colaborador'}
                        </small>
                    </div>
                </div>
            </div>
        </div>
    );
}
