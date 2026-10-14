-- Valor estimado de la oportunidad (lo que se espera vender a este contacto).
-- Es distinto del saldo: el saldo es dinero ya cargado/retirado; esto es proyección.
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC(14, 2);
