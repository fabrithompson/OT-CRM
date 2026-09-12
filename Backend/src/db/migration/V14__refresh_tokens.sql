-- ============================================================================
-- V14 — Refresh tokens con revocacion por jti
-- El JWT de acceso ahora dura minutos (antes 10hs) y se renueva con un refresh
-- token de vida mas larga. Guardamos solo el jti (no el token en si) para
-- poder revocarlo: logout invalida el jti, y refresh lo rota (revoca el viejo,
-- emite uno nuevo) para acotar la ventana util de un refresh token robado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    jti         VARCHAR(36) NOT NULL UNIQUE,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en   TIMESTAMP NOT NULL,
    revocado    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Lookup por jti en cada /auth/refresh y /auth/logout.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);

COMMENT ON TABLE refresh_tokens IS 'Un row por refresh token emitido (login o rotacion). No hay limpieza automatica de filas vencidas/revocadas todavia: son livianas y de bajo volumen (una por login), pendiente si el volumen crece.';
