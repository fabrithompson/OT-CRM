#!/usr/bin/env bash
# =============================================================================
# backup.sh — Backup manual de la base de datos de producción
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:port/dbname" ./scripts/backup.sh
#
# O con la URL de Railway directamente:
#   export DATABASE_URL=$(railway variables get DATABASE_URL)
#   ./scripts/backup.sh
#
# El dump se guarda en: backups/crm_YYYY-MM-DD_HH-MM.dump
# Formato: custom (-Fc) — comprimido, restaurable con pg_restore
# =============================================================================

set -euo pipefail

# ── Validaciones ───────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: La variable DATABASE_URL no está definida."
  echo "Ejemplo: DATABASE_URL='postgresql://user:pass@host:5432/dbname' ./scripts/backup.sh"
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  echo "ERROR: pg_dump no está instalado."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt install postgresql-client"
  exit 1
fi

# ── Destino ────────────────────────────────────────────────────────────────────
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
OUTPUT="$BACKUP_DIR/crm_${TIMESTAMP}.dump"

# ── Backup ─────────────────────────────────────────────────────────────────────
echo "Conectando a la base de datos..."
echo "Destino: $OUTPUT"

pg_dump \
  --format=custom \
  --no-acl \
  --no-owner \
  --compress=6 \
  --verbose \
  "$DATABASE_URL" \
  --file="$OUTPUT"

SIZE=$(du -sh "$OUTPUT" | cut -f1)
echo ""
echo "Backup completado: $OUTPUT ($SIZE)"
echo ""
echo "Para restaurar este backup:"
echo "  DATABASE_URL='...' ./scripts/restore.sh $OUTPUT"
