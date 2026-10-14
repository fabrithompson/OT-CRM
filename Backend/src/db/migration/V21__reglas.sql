-- Automatizaciones simples: "cuando un contacto entra a la etapa X -> hacer Y".
-- Acciones soportadas: CREAR_TAREA y ASIGNAR_RESPONSABLE.
CREATE TABLE IF NOT EXISTS reglas (
    id               BIGSERIAL PRIMARY KEY,
    agencia_id       BIGINT       NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    etapa_id         BIGINT       NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
    nombre           VARCHAR(120) NOT NULL,
    accion           VARCHAR(30)  NOT NULL,
    titulo_tarea     VARCHAR(200),
    dias_vencimiento INTEGER,
    usuario_id       BIGINT       REFERENCES usuarios(id) ON DELETE SET NULL,
    activa           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regla_agencia_etapa ON reglas (agencia_id, etapa_id, activa);
