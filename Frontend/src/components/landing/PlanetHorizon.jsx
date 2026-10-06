import { memo, useId } from 'react';
import PropTypes from 'prop-types';

/*
 * Horizonte curvo de un planeta con borde de luz violeta, en SVG y con fondo
 * transparente: se superpone a la foto del cielo (héroe y cierre de la landing).
 *
 * Solo gradientes: nada de feGaussianBlur ni filter: blur(), que en superficies
 * grandes congelaban el render al mover el mouse (ver commit 217936b).
 * preserveAspectRatio "xMidYMax slice" lo ancla abajo como un object-fit: cover.
 */
const ACCENT = '#A78BFA';
const ACCENT_DEEP = '#7C3AED';
const ICE = '#EEECFF';

function PlanetHorizon({ className = '' }) {
    const uid = `ph${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    const cx = 1200, cy = 4020, R = 2780; // el borde superior del planeta queda en y = 1240
    return (
        <svg
            className={className}
            viewBox="0 0 2400 1500"
            preserveAspectRatio="xMidYMax slice"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {/* Resplandor de la atmósfera sobre el horizonte */}
                <radialGradient id={`${uid}-glow`} cx="1200" cy="1250" r="1300" gradientTransform="matrix(1 0 0 0.24 0 950)" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor={ACCENT} stopOpacity="0.38" />
                    <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
                </radialGradient>
                {/* Anillo brillante en el borde del planeta que se apaga hacia afuera */}
                <radialGradient id={`${uid}-atmo`} cx={cx} cy={cy} r={R + 140} gradientUnits="userSpaceOnUse">
                    <stop offset={(R - 30) / (R + 140)} stopColor={ACCENT} stopOpacity="0" />
                    <stop offset={(R - 2) / (R + 140)} stopColor={ICE} stopOpacity="0.95" />
                    <stop offset={(R + 10) / (R + 140)} stopColor={ACCENT} stopOpacity="0.55" />
                    <stop offset={(R + 50) / (R + 140)} stopColor={ACCENT_DEEP} stopOpacity="0.18" />
                    <stop offset="1" stopColor={ACCENT_DEEP} stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${uid}-body`} x1="0" y1={cy - R} x2="0" y2={cy - R + 260} gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#2A1F5C" />
                    <stop offset="0.35" stopColor="#120D2B" />
                    <stop offset="1" stopColor="#06060F" />
                </linearGradient>
            </defs>
            <rect width="2400" height="1500" fill={`url(#${uid}-glow)`} />
            <circle cx={cx} cy={cy} r={R + 140} fill={`url(#${uid}-atmo)`} />
            <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-body)`} />
        </svg>
    );
}

PlanetHorizon.propTypes = {
    className: PropTypes.string,
};

export default memo(PlanetHorizon);
