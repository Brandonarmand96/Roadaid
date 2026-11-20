#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./restore.sh <path-to-backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-roadaid-postgres-prod}"
POSTGRES_USER="${POSTGRES_USER:-roadaid}"
POSTGRES_DB="${POSTGRES_DB:-roadaid}"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

gzip -t "$BACKUP_FILE" || { echo "Backup archive is invalid: $BACKUP_FILE"; exit 1; }
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || { echo "PostgreSQL container not found: $POSTGRES_CONTAINER"; exit 1; }

if [ "${CONFIRM_RESTORE:-}" != "RESTORE" ]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=RESTORE after verifying the target container and database."
  exit 1
fi

echo "Restoring database from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Database restored successfully."
