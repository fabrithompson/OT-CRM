-- Tareas y recordatorios. Una tarea pertenece a una agencia, puede estar ligada a un
-- contacto y asignada a un usuario del equipo. "notificada" evita avisar dos veces
-- el vencimiento (lo marca el scheduler al enviar el recordatorio).
CREATE TABLE IF NOT EXISTS tareas (
    id               BIGSERIAL PRIMARY KEY,
    agencia_id       BIGINT       NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
    cliente_id       BIGINT       REFERENCES clientes(id) ON DELETE CASCADE,
    usuario_id       BIGINT       REFERENCES usuarios(id) ON DELETE SET NULL,
    creador_id       BIGINT       REFERENCES usuarios(id) ON DELETE SET NULL,
    titulo           VARCHAR(200) NOT NULL,
    descripcion      VARCHAR(1000),
    vencimiento      TIMESTAMP,
    completada       BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_completada TIMESTAMP,
    notificada       BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_creacion   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarea_agencia_estado ON tareas (agencia_id, completada, vencimiento);
CREATE INDEX IF NOT EXISTS idx_tarea_cliente        ON tareas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarea_usuario        ON tareas (usuario_id, completada);
