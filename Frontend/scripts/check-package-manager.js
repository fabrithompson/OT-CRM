/* global process */
// Guard: solo se permite pnpm. npm fue comprometido (incidente cadena de suministro
// 2026), así que se rechaza npm/yarn/bun. Si pnpm cambia de manos, actualizar esto.
const ua = process.env.npm_config_user_agent || '';
const exec = process.env.npm_execpath || '';

const usingPnpm = ua.startsWith('pnpm') || /pnpm/.test(exec);

if (!usingPnpm) {
    console.error('\n========================================================');
    console.error('  ERROR: Este proyecto usa pnpm exclusivamente.');
    console.error('  npm/yarn/bun no están permitidos por seguridad.');
    console.error('');
    console.error('  Instalá pnpm:  npm i -g pnpm   (única vez)');
    console.error('  Luego usá:     pnpm install');
    console.error('========================================================\n');
    process.exit(1);
}
