#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-roadaid-postgres-prod}"
POSTGRES_USER="${POSTGRES_USER:-roadaid}"
POSTGRES_DB="${POSTGRES_DB:-roadaid}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
FILENAME="roadaid_backup_${TIMESTAMP}.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "Creating database backup: ${FILENAME}..."
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || { echo "PostgreSQL container not found: $POSTGRES_CONTAINER"; exit 1; }
docker exec -t "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "${BACKUP_DIR}/${FILENAME}"
gzip -t "${BACKUP_DIR}/${FILENAME}"
test -s "${BACKUP_DIR}/${FILENAME}" || { echo "Backup is empty"; exit 1; }
echo "Backup saved to ${BACKUP_DIR}/${FILENAME}"

# Retain only last 14 days of backups
find "$BACKUP_DIR" -type f -name "roadaid_backup_*.sql.gz" -mtime +14 -delete
echo "Backup completed successfully."
