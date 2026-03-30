#!/usr/bin/env bash
# =============================================================================
# restore.sh — Restaura un backup en una base de datos PostgreSQL
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:port/dbname" ./scripts/restore.sh <archivo.dump>
#
# IMPORTANTE: Este script borra y recrea el schema público antes de restaurar.
#             NO usar en producción sin confirmación explícita.
#             Usar en un ambiente de staging o para verificar el backup localmente.
#
# Verificación local (recomendado para el drill mensual):
#   docker run -d --name crm_restore_test \
#     -e POSTGRES_PASSWORD=test -e POSTGRES_DB=crm_restore \
#     -p 5433:5432 postgres:16-alpine
#
#   DATABASE_URL="postgresql://postgres:test@localhost:5433/crm_restore" \
#     ./scripts/restore.sh backups/crm_2025-03-30_03-00.dump
#
#   docker rm -f crm_restore_test
# =============================================================================

set -euo pipefail

# ── Validaciones ───────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: La variable DATABASE_URL no está definida."
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ]; then
  echo "ERROR: Especificá el archivo de backup."
  echo "Uso: DATABASE_URL='...' ./scripts/restore.sh <archivo.dump>"
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: Archivo no encontrado: $DUMP_FILE"
  exit 1
fi

if ! command -v pg_restore &>/dev/null; then
  echo "ERROR: pg_restore no está instalado."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt install postgresql-client"
  exit 1
fi

# ── Confirmación ───────────────────────────────────────────────────────────────
echo "========================================================"
echo "  RESTAURAR BACKUP"
echo "========================================================"
echo "  Archivo : $DUMP_FILE"
echo "  Base    : $DATABASE_URL"
echo ""
echo "  ADVERTENCIA: El schema público será recreado."
echo "  Todos los datos existentes se perderán."
echo "========================================================"
echo ""
read -r -p "¿Confirmar restauración? [escribí 'si' para continuar]: " CONFIRM

if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 0
fi

# ── Limpiar schema existente ───────────────────────────────────────────────────
echo ""
echo "Limpiando schema público..."
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" -q

# ── Restore ────────────────────────────────────────────────────────────────────
echo "Restaurando desde $DUMP_FILE..."

pg_restore \
  --no-acl \
  --no-owner \
  --verbose \
  --dbname="$DATABASE_URL" \
  "$DUMP_FILE"

echo ""
echo "Verificando tablas restauradas..."
psql "$DATABASE_URL" -c "\dt" 2>/dev/null || true

echo ""
echo "Restore completado exitosamente."
