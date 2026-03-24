-- Migración: unificar enum EstadoMensaje
-- Ejecutar en producción ANTES del deploy que elimina SENT y LEIDO del enum
-- Si el deploy se hace sin esta migración, Hibernate fallará al leer registros con valores viejos

UPDATE mensaje SET estado = 'ENVIADO' WHERE estado = 'SENT';
UPDATE mensaje SET estado = 'READ'    WHERE estado = 'LEIDO';
