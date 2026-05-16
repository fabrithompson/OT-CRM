-- ============================================================================
-- V3 — Módulo de Campañas (envío masivo aislado del embudo principal)
--
-- Aísla números "quemables" para outreach en frío:
--   * Los dispositivos con proposito='CAMPANIAS' no aparecen en el Kanban,
--     Dashboard ni en /contactos. Viven solo en /spam.
--   * Sus contactos, mensajes y plantillas son tablas separadas de clientes/mensajes
--     para que un baneo del número no contamine la base real de leads.
--   * Cuando un lead madura, el operador le pasa el número PRINCIPAL por chat
--     y el lead entra al Kanban naturalmente cuando escribe a ese otro número.
-- ============================================================================

-- ── 1) Distinguir propósito de cada dispositivo ─────────────────────────────
-- Los dispositivos existentes quedan automáticamente como PRINCIPAL.
ALTER TABLE dispositivos
    ADD COLUMN IF NOT EXISTS proposito VARCHAR(20) NOT NULL DEFAULT 'PRINCIPAL';

-- Restringimos a los valores válidos para que un INSERT incorrecto falle rápido
ALTER TABLE dispositivos
    DROP CONSTRAINT IF EXISTS chk_dispositivo_proposito;
ALTER TABLE dispositivos
    ADD CONSTRAINT chk_dispositivo_proposito
    CHECK (proposito IN ('PRINCIPAL', 'CAMPANIAS'));

-- Index para filtros frecuentes: "dame los devices de campaña de esta agencia"
CREATE INDEX IF NOT EXISTS idx_dispositivo_agencia_proposito
    ON dispositivos (agencia_id, proposito);

-- ── 2) Contactos del sector campañas ────────────────────────────────────────
-- Tabla totalmente separada de `clientes`. Un mismo teléfono puede vivir acá
-- y en `clientes` sin conflicto — son universos distintos.
CREATE TABLE IF NOT EXISTS contactos_campania (
    id              BIGSERIAL       PRIMARY KEY,
    nombre          VARCHAR(255)    NOT NULL,
    telefono        VARCHAR(255)    NOT NULL,
    notas           VARCHAR(500),
    fecha_importado TIMESTAMP       NOT NULL DEFAULT NOW(),
    dispositivo_id  BIGINT          NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    agencia_id      BIGINT          NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    -- Un mismo número no se importa dos veces al mismo dispositivo
    CONSTRAINT uk_contacto_campania_disp_tel UNIQUE (dispositivo_id, telefono)
);

CREATE INDEX IF NOT EXISTS idx_contacto_campania_agencia
    ON contactos_campania (agencia_id);
CREATE INDEX IF NOT EXISTS idx_contacto_campania_dispositivo
    ON contactos_campania (dispositivo_id);

-- ── 3) Plantillas de mensaje ────────────────────────────────────────────────
-- El cuerpo soporta {nombre} como variable que se reemplaza al renderizar.
CREATE TABLE IF NOT EXISTS plantillas_campania (
    id              BIGSERIAL       PRIMARY KEY,
    nombre          VARCHAR(255)    NOT NULL,
    cuerpo          TEXT            NOT NULL,
    fecha_creacion  TIMESTAMP       NOT NULL DEFAULT NOW(),
    agencia_id      BIGINT          NOT NULL REFERENCES agencias(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plantilla_campania_agencia
    ON plantillas_campania (agencia_id);

-- ── 4) Envíos masivos (uno por cada destinatario de una campaña) ────────────
-- Se inserta una fila por destinatario al iniciar la campaña, con estado
-- PENDING. El worker la actualiza a SENT/FAILED/SKIPPED al procesarla.
--
-- Esta tabla permite:
--   * Calcular el límite diario por dispositivo (count WHERE fecha_enviado >= hoy)
--   * Skip de duplicados ("ya le mandé a este contacto hace <30 días")
--   * Auditoría de qué se mandó, cuándo y con qué resultado
CREATE TABLE IF NOT EXISTS envios_campania (
    id                  BIGSERIAL       PRIMARY KEY,
    texto_renderizado   TEXT            NOT NULL,
    estado              VARCHAR(20)     NOT NULL DEFAULT 'PENDING',
    fecha_creado        TIMESTAMP       NOT NULL DEFAULT NOW(),
    fecha_enviado       TIMESTAMP,
    error_msg           VARCHAR(500),
    contacto_id         BIGINT          NOT NULL REFERENCES contactos_campania(id) ON DELETE CASCADE,
    dispositivo_id      BIGINT          NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    plantilla_id        BIGINT          REFERENCES plantillas_campania(id) ON DELETE SET NULL,
    agencia_id          BIGINT          NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    CONSTRAINT chk_envio_campania_estado
        CHECK (estado IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'))
);

-- Para el rate-limit diario: count rápido de "cuántos mandé hoy con este device"
CREATE INDEX IF NOT EXISTS idx_envio_campania_disp_enviado
    ON envios_campania (dispositivo_id, fecha_enviado);

-- Para el skip-30-días: "¿ya le mandé a este contacto recientemente?"
CREATE INDEX IF NOT EXISTS idx_envio_campania_contacto_creado
    ON envios_campania (contacto_id, fecha_creado DESC);

-- Para listar la cola pendiente en orden FIFO
CREATE INDEX IF NOT EXISTS idx_envio_campania_estado_creado
    ON envios_campania (estado, fecha_creado);

-- ── 5) Mensajes del chat (cuando el contacto responde) ──────────────────────
-- Aparte de la tabla `mensaje` principal para no mezclar. Los chats del sector
-- spam viven acá y solo se muestran en /spam.
CREATE TABLE IF NOT EXISTS mensajes_campania (
    id              BIGSERIAL       PRIMARY KEY,
    texto           TEXT            NOT NULL,
    direccion       VARCHAR(10)     NOT NULL,
    leido           BOOLEAN         NOT NULL DEFAULT FALSE,
    fecha           TIMESTAMP       NOT NULL DEFAULT NOW(),
    contacto_id     BIGINT          NOT NULL REFERENCES contactos_campania(id) ON DELETE CASCADE,
    dispositivo_id  BIGINT          NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    CONSTRAINT chk_mensaje_campania_direccion
        CHECK (direccion IN ('IN', 'OUT'))
);

-- Listado del chat (más reciente primero)
CREATE INDEX IF NOT EXISTS idx_mensaje_campania_contacto_fecha
    ON mensajes_campania (contacto_id, fecha DESC);

-- "Bandeja": contactos con mensajes no leídos ordenados por última actividad
CREATE INDEX IF NOT EXISTS idx_mensaje_campania_disp_fecha
    ON mensajes_campania (dispositivo_id, fecha DESC);
