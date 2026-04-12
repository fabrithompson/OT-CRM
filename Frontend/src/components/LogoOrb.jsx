import React from 'react';

/**
 * LogoOrb — brand logo using logonew.png.
 * Props:
 *   size      : image height in px (default 42)
 *   showText  : show "CRM" label next to logo (default true)
 *   className : extra class on the wrapper
 *   onClick   : click handler
 */
export default function LogoOrb({ size = 42, showText = true, className = '', onClick }) {
  return (
    <div
      className={`logo-orb-wrap ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <img
        src="/logonew.png"
        alt="OT CRM"
        className="logo-img"
        style={{ width: size * 1.2, height: size, objectFit: 'contain' }}
        draggable={false}
      />
      {showText && <span className="logo-sa">CRM</span>}
    </div>
  );
}
