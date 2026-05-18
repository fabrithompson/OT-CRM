-- ============================================================================
-- V4 — Módulo de Calentamiento de Líneas
--
-- Permite que las líneas CAMPANIAS se manden mensajes entre sí antes de
-- realizar campañas masivas, simulando actividad orgánica para reducir
-- el riesgo de baneo. Cada "plan" define qué líneas participan, cuántos
-- intercambios hacen por día y con qué pool de mensajes.
-- ============================================================================

-- ── 1) Planes de calentamiento ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planes_calentamiento (
    id                      BIGSERIAL       PRIMARY KEY,
    nombre                  VARCHAR(255)    NOT NULL,
    estado                  VARCHAR(20)     NOT NULL DEFAULT 'ACTIVO',
    mensajes_por_par_por_dia INT             NOT NULL DEFAULT 10,
    fecha_creado            TIMESTAMP       NOT NULL DEFAULT NOW(),
    agencia_id              BIGINT          NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    CONSTRAINT chk_plan_calentamiento_estado
        CHECK (estado IN ('ACTIVO', 'PAUSADO'))
);

CREATE INDEX IF NOT EXISTS idx_plan_calentamiento_agencia
    ON planes_calentamiento (agencia_id);

CREATE INDEX IF NOT EXISTS idx_plan_calentamiento_estado
    ON planes_calentamiento (agencia_id, estado);

-- ── 2) Dispositivos que participan en cada plan (many-to-many) ───────────────
CREATE TABLE IF NOT EXISTS plan_calentamiento_dispositivos (
    plan_id         BIGINT  NOT NULL REFERENCES planes_calentamiento(id) ON DELETE CASCADE,
    dispositivo_id  BIGINT  NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, dispositivo_id)
);

-- ── 3) Pool de mensajes de calentamiento por plan ────────────────────────────
-- Mensajes cortos y naturales que se envían entre las líneas. Se elige uno
-- al azar en cada envío.
CREATE TABLE IF NOT EXISTS textos_calentamiento (
    id       BIGSERIAL   PRIMARY KEY,
    cuerpo   TEXT        NOT NULL,
    plan_id  BIGINT      NOT NULL REFERENCES planes_calentamiento(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_texto_calentamiento_plan
    ON textos_calentamiento (plan_id);

-- ── 4) Cola de envíos de calentamiento ──────────────────────────────────────
-- Una fila por mensaje enviado/a enviar entre un par de dispositivos.
-- El campo `respondido` indica si el dispositivo destino ya envió la
-- respuesta automática (evita loops infinitos).
CREATE TABLE IF NOT EXISTS envios_calentamiento (
    id                      BIGSERIAL   PRIMARY KEY,
    texto                   TEXT        NOT NULL,
    estado                  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    respondido              BOOLEAN     NOT NULL DEFAULT FALSE,
    fecha_creado            TIMESTAMP   NOT NULL DEFAULT NOW(),
    fecha_enviado           TIMESTAMP,
    error_msg               VARCHAR(500),
    dispositivo_origen_id   BIGINT      NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    dispositivo_destino_id  BIGINT      NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    plan_id                 BIGINT      NOT NULL REFERENCES planes_calentamiento(id) ON DELETE CASCADE,
    agencia_id              BIGINT      NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    CONSTRAINT chk_envio_calentamiento_estado
        CHECK (estado IN ('PENDING', 'SENT', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_envio_calentamiento_estado
    ON envios_calentamiento (estado, fecha_creado);

CREATE INDEX IF NOT EXISTS idx_envio_calentamiento_plan
    ON envios_calentamiento (plan_id, fecha_creado DESC);

-- Para calcular cuántos intercambios hubo hoy entre un par dado
CREATE INDEX IF NOT EXISTS idx_envio_calentamiento_par_dia
    ON envios_calentamiento (dispositivo_origen_id, dispositivo_destino_id, fecha_enviado);

-- Para detectar si hay un envío no respondido hacia un device destino
CREATE INDEX IF NOT EXISTS idx_envio_calentamiento_destino_respondido
    ON envios_calentamiento (dispositivo_destino_id, respondido, fecha_enviado);
