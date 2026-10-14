-- Montos exactos: de double precision (binario, 0.1 + 0.2 = 0.30000000000000004)
-- a NUMERIC(14,2): hasta 999.999.999.999,99 con exactamente 2 decimales.
-- Afecta lo que se acumula: saldo y cargas del contacto, y el monto de cada movimiento.
-- Los precios de plan no se tocan (son enteros y pasan por MercadoPago/PayPal).
--
-- ROUND(x::numeric, 2) conserva los valores existentes (ya estaban a 2 decimales o
-- menos); USING es obligatorio para convertir el tipo de una columna con datos.

ALTER TABLE clientes
    ALTER COLUMN saldo       TYPE NUMERIC(14, 2) USING ROUND(saldo::numeric, 2),
    ALTER COLUMN carga       TYPE NUMERIC(14, 2) USING ROUND(carga::numeric, 2),
    ALTER COLUMN carga_total TYPE NUMERIC(14, 2) USING ROUND(carga_total::numeric, 2);

ALTER TABLE transacciones
    ALTER COLUMN monto TYPE NUMERIC(14, 2) USING ROUND(monto::numeric, 2);
