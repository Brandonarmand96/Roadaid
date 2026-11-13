#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./restore.sh <path-to-backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring database from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | docker exec -i roadaid-postgres psql -U roadaid -d roadaid
echo "Database restored successfully."
