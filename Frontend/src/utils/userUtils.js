/**
 * Returns the best display name for a user object.
 * Prefers nombreCompleto when it's a real name (not just the email fallback).
 * Falls back to the email prefix (before @).
 */
export const getDisplayName = (user) => {
    if (!user) return 'Agente';
    const email = user.email || user.username || '';
    const nombre = user.nombreCompleto;
    if (nombre && nombre !== email) return nombre;
    return email.includes('@') ? email.split('@')[0] : email || 'Agente';
};
