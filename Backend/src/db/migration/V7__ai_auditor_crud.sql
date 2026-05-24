-- ============================================================================
-- V7 — Auditor IA: metadatos de reporte (CRUD + reorden manual)
-- Agrega:
--   * nombre — etiqueta editable opcional del reporte
--   * notas  — anotaciones del usuario
--   * orden  — posición manual cuando el usuario reordena el historial
--             (NULL = ordenar por created_at DESC como antes)
-- ============================================================================

ALTER TABLE ai_audit_report
    ADD COLUMN IF NOT EXISTS nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS notas  TEXT,
    ADD COLUMN IF NOT EXISTS orden  INT;

-- Índice combinado para listar respetando el orden manual cuando existe
CREATE INDEX IF NOT EXISTS idx_audit_report_agencia_orden
    ON ai_audit_report(agencia_id, orden NULLS LAST, created_at DESC);
