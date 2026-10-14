/** Fecha/hora corta en el idioma del usuario; vacío si no hay fecha o no es válida. */
export function formatVencimiento(iso, lang) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'es-AR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
}
