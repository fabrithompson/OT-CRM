import PropTypes from 'prop-types';

/* Íconos de trazo fino (1.25px) para la landing. Decorativos: aria-hidden. */
const PATHS = {
    kanban: (
        <>
            <rect x="3" y="4" width="5" height="16" rx="1.5" />
            <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
            <rect x="16" y="4" width="5" height="7" rx="1.5" />
        </>
    ),
    chat: (
        <>
            <path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
            <path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3.5-3H12" />
        </>
    ),
    contacts: (
        <>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7.5 17.5c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" />
        </>
    ),
    chart: (
        <>
            <path d="M3 20h18" />
            <path d="M6 16v-4M10.5 16V8M15 16v-6M19.5 16V5" />
        </>
    ),
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    team: (
        <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
            <circle cx="17" cy="9" r="2.4" />
            <path d="M16 14.6c2.3 0 4 1.3 4.6 3.9" />
        </>
    ),
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
    arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    minus: <path d="M6 12h12" />,
    mail: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </>
    ),
    shield: <path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3z" />,
    headset: (
        <>
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
            <rect x="3" y="13" width="4" height="6" rx="1.5" />
            <rect x="17" y="13" width="4" height="6" rx="1.5" />
            <path d="M19 19c0 1.5-1.5 2.5-4 2.5h-2" />
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z" />
        </>
    ),
};

export default function LineIcon({ name, size = 24, className = '' }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {PATHS[name]}
        </svg>
    );
}

LineIcon.propTypes = {
    name: PropTypes.oneOf(Object.keys(PATHS)).isRequired,
    size: PropTypes.number,
    className: PropTypes.string,
};
