-- Datos básicos del contacto: email y empresa (ambos opcionales).
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS email   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS empresa VARCHAR(255);
