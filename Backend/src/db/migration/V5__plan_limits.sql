-- ============================================================================
-- V5 — Limites granulares por plan.
-- Agrega:
--   * max_dispositivos_campanias  → dispositivos de WhatsApp para /spam
--   * max_miembros_equipo         → tope de invitaciones al equipo
--   * agente_ia_habilitado        → flag de Agente IA (antes hardcodeado a ENTERPRISE)
--   * campanias_habilitadas       → flag del modulo /spam
-- Y refresca los valores de los 4 planes base.
-- ============================================================================

ALTER TABLE plan
    ADD COLUMN IF NOT EXISTS max_dispositivos_campanias INT     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_miembros_equipo        INT     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS agente_ia_habilitado       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS campanias_habilitadas      BOOLEAN NOT NULL DEFAULT FALSE;

-- Actualizar los valores de cada plan. Si el plan no existe en DB, DataInitializer
-- lo crea con los mismos valores en su primer arranque.
UPDATE plan SET
    max_dispositivos           = 1,
    max_dispositivos_campanias = 0,
    max_contactos              = 25,
    max_miembros_equipo        = 2,
    agente_ia_habilitado       = FALSE,
    campanias_habilitadas      = FALSE
WHERE nombre = 'FREE';

UPDATE plan SET
    max_dispositivos           = 3,
    max_dispositivos_campanias = 2,
    max_contactos              = 500,
    max_miembros_equipo        = 5,
    agente_ia_habilitado       = FALSE,
    campanias_habilitadas      = TRUE
WHERE nombre = 'PRO';

UPDATE plan SET
    max_dispositivos           = 6,
    max_dispositivos_campanias = 5,
    max_contactos              = 2000,
    max_miembros_equipo        = 10,
    agente_ia_habilitado       = FALSE,
    campanias_habilitadas      = TRUE
WHERE nombre = 'BUSINESS';

UPDATE plan SET
    max_dispositivos           = -1,
    max_dispositivos_campanias = -1,
    max_contactos              = -1,
    max_miembros_equipo        = -1,
    agente_ia_habilitado       = TRUE,
    campanias_habilitadas      = TRUE
WHERE nombre = 'ENTERPRISE';
