-- ============================================================================
-- V12 — Google Contacts: tokens OAuth por usuario
-- Agrega tres columnas a `usuarios` para almacenar las credenciales OAuth 2.0
-- de Google de cada vendedor. Permiten que el CRM sincronice el nombre de un
-- cliente al Google Contacts del vendedor cuando se renombra desde el chat.
-- ============================================================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS google_access_token  TEXT,
    ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS google_token_expiry  BIGINT;

COMMENT ON COLUMN usuarios.google_access_token  IS 'Token de acceso OAuth 2.0 de Google (expira en ~1 hora)';
COMMENT ON COLUMN usuarios.google_refresh_token IS 'Refresh token para renovar el access token sin re-autenticar';
COMMENT ON COLUMN usuarios.google_token_expiry  IS 'Epoch ms en que vence el access token actual (con margen de 1 min)';
