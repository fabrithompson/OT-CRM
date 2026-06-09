-- ============================================================================
-- V9 — Auditor IA: disparo automático al finalizar el horario laboral
-- Agrega:
--   * last_auto_audit_at — timestamp de la última corrida automática del scheduler.
--     Se usa para deduplicar: si ya se corrió en el mismo día, el tick por minuto
--     no la vuelve a disparar (protege ante reinicios y múltiples instancias).
-- ============================================================================

ALTER TABLE agent_config
    ADD COLUMN IF NOT EXISTS last_auto_audit_at TIMESTAMP;

COMMENT ON COLUMN agent_config.last_auto_audit_at IS
    'Última ejecución automática del scheduler (UTC). Se compara por fecha local AR '
    'para evitar disparos duplicados dentro del mismo día.';
