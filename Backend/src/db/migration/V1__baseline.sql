-- ============================================================================
-- V1 — Baseline: schema generado a partir de las entidades JPA existentes.
-- Este archivo representa el estado actual de la DB en produccion.
-- Flyway lo ejecuta solo en DBs nuevas; en produccion se marca como baseline.
-- ============================================================================

-- ── Planes de suscripcion ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan (
    id              BIGSERIAL       PRIMARY KEY,
    nombre          VARCHAR(255)    NOT NULL UNIQUE,
    descripcion     VARCHAR(255),
    max_dispositivos INT            NOT NULL DEFAULT 1,
    max_contactos   INT             NOT NULL DEFAULT 25,
    precio_mensual  DOUBLE PRECISION NOT NULL DEFAULT 0,
    mp_plan_id      VARCHAR(255),
    paypal_plan_id  VARCHAR(255),
    stripe_price_id VARCHAR(255)
);

-- ── Agencias ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agencias (
    id                      BIGSERIAL       PRIMARY KEY,
    nombre                  VARCHAR(255)    NOT NULL UNIQUE,
    codigo_invitacion       VARCHAR(255)    UNIQUE,
    whatsapp_token          VARCHAR(255),
    whatsapp_phone_id       VARCHAR(255),
    whatsapp_waba_id        VARCHAR(255),
    whatsapp_business_id    VARCHAR(255),
    whatsapp_session_id     VARCHAR(255),
    numero_conectado        VARCHAR(255),
    estado_conexion         VARCHAR(255)
);

-- ── Usuarios ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
    id                      BIGSERIAL       PRIMARY KEY,
    username                VARCHAR(255)    NOT NULL UNIQUE,
    nombre_completo         VARCHAR(255),
    password                VARCHAR(255)    NOT NULL,
    rol                     VARCHAR(255),
    email                   VARCHAR(255)    UNIQUE,
    codigo_verificacion     VARCHAR(255),
    codigo_expiracion       TIMESTAMP,
    verificado              BOOLEAN         NOT NULL DEFAULT FALSE,
    foto_url                VARCHAR(255),
    proveedor_pago          VARCHAR(255),
    agencia_original_id     BIGINT,
    plan_vencimiento        DATE,
    agencia_id              BIGINT          NOT NULL REFERENCES agencias(id),
    plan_id                 BIGINT          REFERENCES plan(id)
);

-- ── Etapas del embudo ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS etapas (
    id          BIGSERIAL       PRIMARY KEY,
    nombre      VARCHAR(255)    NOT NULL,
    orden       INT,
    es_inicial  BOOLEAN         NOT NULL DEFAULT FALSE,
    color       VARCHAR(7)      DEFAULT '#6366f1',
    agencia_id  BIGINT          REFERENCES agencias(id)
);

-- ── Etiquetas ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS etiquetas (
    id          BIGSERIAL       PRIMARY KEY,
    nombre      VARCHAR(255)    NOT NULL,
    color       VARCHAR(255)    DEFAULT '#10b981',
    agencia_id  BIGINT          REFERENCES agencias(id)
);

-- ── Dispositivos (sesiones WhatsApp/Telegram) ───────────────────────────────

CREATE TABLE IF NOT EXISTS dispositivos (
    id              BIGSERIAL       PRIMARY KEY,
    alias           VARCHAR(255),
    numero_telefono VARCHAR(255),
    session_id      VARCHAR(255)    NOT NULL UNIQUE,
    estado          VARCHAR(255)    DEFAULT 'DESCONECTADO',
    plataforma      VARCHAR(255)    NOT NULL,
    activo          BOOLEAN         DEFAULT FALSE,
    visible         BOOLEAN         NOT NULL DEFAULT TRUE,
    agencia_id      BIGINT          NOT NULL REFERENCES agencias(id),
    usuario_id      BIGINT          REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_dispositivo_agencia_estado
    ON dispositivos (agencia_id, estado);

-- ── Clientes (contactos) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clientes (
    id                      BIGSERIAL       PRIMARY KEY,
    nombre                  VARCHAR(255)    NOT NULL,
    telefono                VARCHAR(255)    NOT NULL,
    notas                   VARCHAR(500),
    carga                   DOUBLE PRECISION DEFAULT 0.0,
    carga_total             DOUBLE PRECISION DEFAULT 0.0,
    ultimo_mensaje_resumen  VARCHAR(255),
    ultimo_mensaje_fecha    TIMESTAMP,
    mensajes_sin_leer       INT             DEFAULT 0,
    descripcion_perfil      VARCHAR(500),
    fecha_registro          TIMESTAMP,
    foto_url                VARCHAR(1000),
    origen                  VARCHAR(20)     DEFAULT 'WHATSAPP',
    saldo                   DOUBLE PRECISION DEFAULT 0.0,
    etapa_id                BIGINT          REFERENCES etapas(id),
    dispositivo_id          BIGINT          REFERENCES dispositivos(id),
    agencia_id              BIGINT          REFERENCES agencias(id)
);

ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS uk_cliente_dispositivo_agencia_v3;
ALTER TABLE clientes
    ADD CONSTRAINT uk_cliente_dispositivo_agencia_v3
    UNIQUE (telefono, dispositivo_id, agencia_id);

CREATE INDEX IF NOT EXISTS idx_cliente_telefono
    ON clientes (telefono);
CREATE INDEX IF NOT EXISTS idx_cliente_agencia
    ON clientes (agencia_id);
CREATE INDEX IF NOT EXISTS idx_cliente_agencia_telefono
    ON clientes (agencia_id, telefono);
CREATE INDEX IF NOT EXISTS idx_cliente_agencia_etapa
    ON clientes (agencia_id, etapa_id);
CREATE INDEX IF NOT EXISTS idx_cliente_agencia_ultimo_msg
    ON clientes (agencia_id, ultimo_mensaje_fecha DESC);

-- ── Tabla intermedia: cliente <-> etiquetas (ManyToMany) ────────────────────

CREATE TABLE IF NOT EXISTS cliente_etiquetas (
    cliente_id  BIGINT NOT NULL REFERENCES clientes(id),
    etiqueta_id BIGINT NOT NULL REFERENCES etiquetas(id),
    PRIMARY KEY (cliente_id, etiqueta_id)
);

-- ── Mensajes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensaje (
    id              BIGSERIAL       PRIMARY KEY,
    contenido       TEXT            NOT NULL,
    es_salida       BOOLEAN         NOT NULL,
    fecha_hora      TIMESTAMP,
    url_archivo     VARCHAR(255),
    whatsapp_id     VARCHAR(128),
    estado          VARCHAR(20)     DEFAULT 'ENVIADO',
    tipo            VARCHAR(20)     DEFAULT 'TEXTO',
    autor           VARCHAR(100),
    cliente_id      BIGINT          NOT NULL REFERENCES clientes(id)
);

CREATE INDEX IF NOT EXISTS idx_mensaje_cliente_fecha
    ON mensaje (cliente_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_mensaje_whatsapp_id
    ON mensaje (whatsapp_id);

-- ── Respuestas rapidas ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS respuesta_rapida (
    id                  BIGSERIAL       PRIMARY KEY,
    atajo               VARCHAR(50)     NOT NULL,
    respuesta           TEXT            NOT NULL,
    fecha_creacion      TIMESTAMP,
    fecha_actualizacion TIMESTAMP,
    usuario_id          BIGINT          NOT NULL REFERENCES usuarios(id),
    agencia_id          BIGINT          NOT NULL REFERENCES agencias(id),
    UNIQUE (agencia_id, atajo)
);

-- ── Transacciones ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transacciones (
    id          BIGSERIAL       PRIMARY KEY,
    monto       DOUBLE PRECISION,
    tipo        VARCHAR(255),
    fecha       TIMESTAMP,
    cliente_id  BIGINT          REFERENCES clientes(id),
    usuario_id  BIGINT          REFERENCES usuarios(id)
);

-- ── Solicitudes de union a equipo ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitudes_union_equipo (
    id                      BIGSERIAL       PRIMARY KEY,
    estado                  VARCHAR(255)    NOT NULL,
    fecha_creacion          TIMESTAMP       NOT NULL,
    usuario_solicitante_id  BIGINT          NOT NULL REFERENCES usuarios(id),
    agencia_id              BIGINT          NOT NULL REFERENCES agencias(id)
);

-- ── Webhooks procesados (idempotencia) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id        VARCHAR(255)    PRIMARY KEY,
    source          VARCHAR(50)     NOT NULL,
    processed_at    TIMESTAMP       NOT NULL
);
