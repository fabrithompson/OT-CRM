-- ============================================================================
-- V9 — Auditor IA: configuración de tiempos de respuesta del vendedor
-- Agrega umbrales personalizables y horarios pico por agencia.
-- ============================================================================

ALTER TABLE agent_config
    ADD COLUMN IF NOT EXISTS respuesta_max_minutos      INT  NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS respuesta_pico_max_minutos INT  NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS horas_pico_config          TEXT;

COMMENT ON COLUMN agent_config.respuesta_max_minutos IS
    'Minutos máximos de tolerancia para la primera respuesta del vendedor (default 30).';
COMMENT ON COLUMN agent_config.respuesta_pico_max_minutos IS
    'Tolerancia reducida durante horarios pico en minutos (default 15).';
COMMENT ON COLUMN agent_config.horas_pico_config IS
    'JSON: array de rangos horarios pico, ej: [{"inicio":"11:00","fin":"12:30"}]. Vacío = sin horarios pico.';
