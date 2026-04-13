import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import LogoOrb from './LogoOrb';

export default function Sidebar() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const isSuscripcionActive = pathname === '/planes' || pathname === '/mi-suscripcion' || pathname === '/checkout';

    return (
        <div className="sidebar">
            {/* Ambient green glow */}
            <div className="sidebar-glow" aria-hidden="true" />

            {/* Logo — centered, no text */}
            <div className="sidebar-header">
                <LogoOrb size={48} showText={false} onClick={() => navigate('/dashboard')} />
            </div>

            {/* Main nav */}
            <ul className="menu-list">
                <li className="menu-item">
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-home" />
                        <span className="link-text">Inicio</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/kanban" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fa-solid fa-filter" />
                        <span className="link-text">Embudo</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/respuestas-rapidas" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-bolt" />
                        <span className="link-text">Respuestas</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/contactos" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fas fa-users" />
                        <span className="link-text">Contactos</span>
                    </NavLink>
                </li>
                <li className="menu-item">
                    <NavLink to="/planes" className={() => isSuscripcionActive ? 'active' : ''}>
                        <i className="fas fa-crown" />
                        <span className="link-text">Suscripción</span>
                    </NavLink>
                </li>
            </ul>

            {/* Bottom — Cuenta only */}
            <ul className="menu-bottom">
                <li className="menu-item">
                    <NavLink to="/perfil" className={({ isActive }) => isActive ? 'active' : ''}>
                        <i className="fa-solid fa-user" />
                        <span className="link-text">Cuenta</span>
                    </NavLink>
                </li>
            </ul>
        </div>
    );
}
