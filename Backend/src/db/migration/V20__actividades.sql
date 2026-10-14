-- Historial de actividad de cada contacto (línea de tiempo): notas, cambios de etapa,
-- movimientos de saldo, tareas y automatizaciones.
CREATE TABLE IF NOT EXISTS actividades (
    id         BIGSERIAL PRIMARY KEY,
    agencia_id BIGINT        NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    cliente_id BIGINT        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    usuario_id BIGINT        REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo       VARCHAR(30)   NOT NULL,
    texto      VARCHAR(2000) NOT NULL,
    fecha      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actividad_cliente_fecha ON actividades (cliente_id, fecha DESC);

-- Las notas que ya existían (un único campo de texto por contacto) pasan a ser la
-- primera nota de la línea de tiempo. El campo clientes.notas se conserva como resumen.
INSERT INTO actividades (agencia_id, cliente_id, tipo, texto, fecha)
SELECT agencia_id, id, 'NOTA', LEFT(TRIM(notas), 2000), COALESCE(fecha_registro, NOW())
FROM clientes
WHERE notas IS NOT NULL AND TRIM(notas) <> '' AND agencia_id IS NOT NULL;
