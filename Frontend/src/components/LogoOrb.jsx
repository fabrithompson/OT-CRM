import React, { useEffect, useId, useRef } from 'react';

const LB = 'M323 156 L229 264 L276 228 Z';
const RB = 'M323 156 L372 241 L302 210 Z';
const TEE = 'M257 262 H306 V272 H286.5 V301 H276.5 V272 H257 Z';

const VARIANT_INK = {
  reverse: '#F4F3EF',
  primary: '#313E46',
  mono: '#000000',
};

export default function LogoOrb({
  size = 42,
  width,
  height,
  showText = true,
  className = '',
  onClick,
  variant = 'reverse',
  animate = true,
}) {
  const imgWidth = width ?? size * 1.2;
  const imgHeight = height ?? size;
  const ink = VARIANT_INK[variant] ?? VARIANT_INK.reverse;
  const uid = useId().replace(/:/g, '');
  const clipId = `ot-mc-${uid}`;
  const gradId = `ot-sh-${uid}`;
  const svgRef = useRef(null);

  useEffect(() => {
    if (!animate) return undefined;
    const el = svgRef.current;
    if (!el) return undefined;
    el.classList.remove('ot-anim');
    void el.getBoundingClientRect();
    el.classList.add('ot-anim');
    const t = setTimeout(() => el.classList.remove('ot-anim'), 1700);
    return () => clearTimeout(t);
  }, [animate]);

  const handleClick = (e) => {
    const el = svgRef.current;
    if (el) {
      el.classList.remove('ot-anim');
      void el.getBoundingClientRect();
      el.classList.add('ot-anim');
      setTimeout(() => el.classList.remove('ot-anim'), 1700);
    }
    if (onClick) onClick(e);
  };

  return (
    <div
      className={`logo-orb-wrap ot-logo ${className}`}
      onClick={onClick ? handleClick : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <svg
        ref={svgRef}
        className="ot-svg"
        width={imgWidth}
        height={imgHeight}
        viewBox="170 148 208 164"
        role="img"
        aria-label="OT CRM"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={LB} />
            <path d={RB} />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="ot-mark">
          <path className="ot-lb" d={LB} fill={ink} />
          <path className="ot-rb" d={RB} fill={ink} />
          <circle
            className="ot-o"
            cx="197"
            cy="283"
            r="18.5"
            fill="none"
            stroke={ink}
            strokeWidth="9"
          />
          <path className="ot-t" d={TEE} fill={ink} />
          <g clipPath={`url(#${clipId})`}>
            <rect
              className="ot-sheen"
              x="200"
              y="150"
              width="26"
              height="120"
              fill={`url(#${gradId})`}
            />
          </g>
        </g>
      </svg>
      {showText && <span className="logo-sa">CRM</span>}
    </div>
  );
}
