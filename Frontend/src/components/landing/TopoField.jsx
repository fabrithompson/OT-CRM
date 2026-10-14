import { memo } from 'react';
import PropTypes from 'prop-types';

/*
 * Fondo de "mapa topográfico" para las bandas claras de la landing: curvas de
 * nivel generadas por código (sin imágenes) alrededor de dos centros. El SVG
 * entero rota y se desplaza muy lento con CSS (solo transform, así se compone en
 * la GPU sin repintar), ver .lx-topo en landing-x.css.
 * Decorativo: aria-hidden.
 */

// Curva cerrada "orgánica": un círculo deformado por senos de distintas frecuencias
function contour(cx, cy, r, seed) {
    const pts = [];
    for (let a = 0; a < 360; a += 6) {
        const t = (a * Math.PI) / 180;
        const rr = r
            + r * 0.09 * Math.sin(3 * t + seed)
            + r * 0.05 * Math.sin(5 * t + seed * 1.7)
            + r * 0.03 * Math.sin(8 * t + seed * 0.6);
        pts.push(`${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * 0.78 * Math.sin(t)).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
}

function ring(cx, cy, count, step, seed) {
    return Array.from({ length: count }, (_, i) => contour(cx, cy, 40 + i * step, seed + i * 0.35));
}

// Se calculan una sola vez al cargar el módulo
const GROUP_A = ring(330, 300, 16, 34, 0.4);
const GROUP_B = ring(960, 560, 13, 38, 2.1);

function TopoField({ className = '' }) {
    return (
        <svg
            className={`lx-topo ${className}`}
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <g>
                {GROUP_A.map((d, i) => <path key={i} d={d} className={i === 9 ? 'is-accent' : undefined} />)}
            </g>
            <g>
                {GROUP_B.map((d, i) => <path key={i} d={d} className={i === 5 ? 'is-accent' : undefined} />)}
            </g>
        </svg>
    );
}

TopoField.propTypes = {
    className: PropTypes.string,
};

export default memo(TopoField);
