#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
FILENAME="roadaid_backup_${TIMESTAMP}.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "Creating database backup: ${FILENAME}..."
docker exec -t roadaid-postgres pg_dump -U roadaid -d roadaid | gzip > "${BACKUP_DIR}/${FILENAME}"
echo "Backup saved to ${BACKUP_DIR}/${FILENAME}"

# Retain only last 14 days of backups
find "$BACKUP_DIR" -type f -name "roadaid_backup_*.sql.gz" -mtime +14 -delete
echo "Backup completed successfully."
