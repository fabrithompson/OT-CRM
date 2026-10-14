-- Vendedor responsable de cada contacto. Es un usuario de la misma agencia
-- (el endpoint lo valida); si se borra el usuario, el contacto queda sin responsable.
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS responsable_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_agencia_responsable ON clientes (agencia_id, responsable_id);
