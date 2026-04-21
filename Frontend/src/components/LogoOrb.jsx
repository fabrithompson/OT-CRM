import React from 'react';

export default function LogoOrb({ size = 42, width, height, showText = true, className = '', onClick }) {
  const imgWidth = width ?? size * 1.2;
  const imgHeight = height ?? size;
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
        style={{ width: imgWidth, height: imgHeight, objectFit: 'contain' }}
        draggable={false}
      />
      {showText && <span className="logo-sa">CRM</span>}
    </div>
  );
}
