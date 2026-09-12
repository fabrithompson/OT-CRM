-- ============================================================================
-- V13 — Contador de intentos fallidos del código de verificación/recuperación
-- El campo `codigo_verificacion` se reutiliza tanto para el código de
-- verificación de cuenta (post-registro) como para el de recuperación de
-- contraseña, sin ningún límite de intentos (solo el rate limit por IP).
-- Agrega un contador que se resetea cada vez que se emite un código nuevo y
-- que, al llegar al máximo, invalida el código (fuerza a pedir uno nuevo).
-- ============================================================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS codigo_intentos INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN usuarios.codigo_intentos IS 'Intentos fallidos consumidos contra codigo_verificacion desde que se emitió; se resetea al generar un código nuevo y se invalida el código al alcanzar el máximo permitido';
