import React from 'react';

/**
 * LogoOrb — 3D spinning orb logo with float animation.
 * Props:
 *   size     : orb diameter in px (default 42)
 *   showText : show "CRM" text next to orb (default true)
 *   className: extra class on the wrapper
 *   onClick  : click handler
 */
export default function LogoOrb({ size = 42, showText = true, className = '', onClick }) {
    const fontSize = `${(size * 0.36).toFixed(1)}px`;

    return (
        <div
            className={`logo-orb-wrap ${className}`}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <div className="logo-orb" style={{ width: size, height: size }}>
                <div className="logo-orb-sphere" style={{ width: size, height: size }}>
                    <span className="logo-orb-text" style={{ fontSize }}>O'T</span>
                </div>
            </div>
            {showText && <span className="logo-sa">CRM</span>}
        </div>
    );
}
