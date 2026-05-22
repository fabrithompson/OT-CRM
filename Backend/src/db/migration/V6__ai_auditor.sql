-- ============================================================================
-- V6 — Módulo Auditor IA
-- Agrega:
--   * Tabla ai_audit_report — reportes diarios generados por el auditor
--   * Columnas de auditoría en agent_config (toggle, procedimientos, destinos)
--   * Columnas horario_laboral en agencias (para limitar análisis a horas hábiles)
-- ============================================================================

-- Reportes de auditoría generados por IA
CREATE TABLE IF NOT EXISTS ai_audit_report (
    id               BIGSERIAL    PRIMARY KEY,
    agencia_id       BIGINT       NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    periodo_inicio   TIMESTAMP    NOT NULL,
    periodo_fin      TIMESTAMP    NOT NULL,
    resumen          TEXT,
    hallazgos_json   JSONB,
    incumplimientos  INT          NOT NULL DEFAULT 0,
    tokens_usados    INT          NOT NULL DEFAULT 0,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_report_agencia_fecha
    ON ai_audit_report(agencia_id, created_at DESC);

-- Configuración del auditor por agencia (extensión de agent_config)
ALTER TABLE agent_config
    ADD COLUMN IF NOT EXISTS audit_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS audit_procedures     TEXT,
    ADD COLUMN IF NOT EXISTS audit_email          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS audit_whatsapp_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS audit_dispositivo_id BIGINT      REFERENCES dispositivos(id) ON DELETE SET NULL;

-- Horario laboral de la agencia (usado para filtrar mensajes fuera de horario)
ALTER TABLE agencias
    ADD COLUMN IF NOT EXISTS horario_laboral_inicio TIME,
    ADD COLUMN IF NOT EXISTS horario_laboral_fin    TIME;
