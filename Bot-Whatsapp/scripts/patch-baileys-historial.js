// Parche a Baileys 6.7.21: el historial que manda WhatsApp al vincular trae la
// tabla teléfono <-> LID (HistorySync.phoneNumberToLidMappings), pero esta versión
// de Baileys la descarta. Hoy WhatsApp identifica casi todos los chats por LID
// (un id interno), así que sin esa tabla el bot no puede saber el teléfono del
// contacto y descarta el historial entero.
//
// El parche convierte cada par en un "contacto" { id: <tel>@s.whatsapp.net, lid: <lid>@lid }
// dentro del evento 'messaging-history.set'; index.js (registrarMapeosHistorial)
// ya sabe leer ese formato. Es idempotente y corta el build si el código de
// Baileys cambió (para no quedar con el parche sin aplicar sin enterarnos).
const fs = require('fs');
const path = require('path');

const MARCA = '/* crm-patch: phoneNumberToLidMappings */';
const ANCLA = '    switch (item.syncType) {';
const PARCHE = `    ${MARCA}
    for (const mapeo of item.phoneNumberToLidMappings || []) {
        if (mapeo.pnJid && mapeo.lidJid) {
            contacts.push({ id: mapeo.pnJid, lid: mapeo.lidJid });
        }
    }
`;

const raiz = fs.realpathSync(path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys'));
const archivo = path.join(raiz, 'lib', 'Utils', 'history.js');
const fuente = fs.readFileSync(archivo, 'utf8');

if (fuente.includes(MARCA)) {
    console.log('[patch-baileys-historial] ya aplicado');
    process.exit(0);
}
if (!fuente.includes(ANCLA)) {
    console.error('[patch-baileys-historial] no se encontró el punto de inserción en', archivo);
    process.exit(1);
}
fs.writeFileSync(archivo, fuente.replace(ANCLA, PARCHE + ANCLA));
console.log('[patch-baileys-historial] aplicado en', archivo);
