import React from 'react';

/**
 * LogoOrb — brand logo using logonew.png.
 * Props:
 *   size      : image height in px (default 42), sets width to size*1.2
 *   width     : explicit width in px (overrides size-based width)
 *   height    : explicit height in px (overrides size-based height)
 *   showText  : show "CRM" label next to logo (default true)
 *   className : extra class on the wrapper
 *   onClick   : click handler
 */
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
