-- ============================================================================
-- V8 — Auditor IA: etapas configurables por agencia (multi-cliente)
-- Reemplaza el campo libre audit_procedures por una tabla estructurada.
-- El campo audit_procedures se mantiene como DEPRECATED para datos legacy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_stage (
    id              BIGSERIAL PRIMARY KEY,
    agent_config_id BIGINT NOT NULL REFERENCES agent_config(id) ON DELETE CASCADE,
    nombre          VARCHAR(120) NOT NULL,
    descripcion     TEXT,
    peso            INT NOT NULL DEFAULT 10 CHECK (peso >= 1 AND peso <= 100),
    orden           INT NOT NULL DEFAULT 0,
    activa          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_stage_agent_config
    ON audit_stage(agent_config_id, orden);

ALTER TABLE ai_audit_report
    ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN agent_config.audit_procedures IS
    'DEPRECATED: usar tabla audit_stage. Se mantiene para reportes legacy y migración automática.';
