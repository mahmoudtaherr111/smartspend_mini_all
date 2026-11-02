#!/usr/bin/env bash
# ==============================================================================
# SmartSpend AI — Transactional Database & State Backup Script
# Requirements: OPS-01, GAP-37, DEBT-23, DEBT-24
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-smartspend-mysql}"
REDIS_CONTAINER="${REDIS_CONTAINER:-smartspend-redis}"

# Load environment securely if available without leaking credentials
if [ -f "${PROJECT_ROOT}/.env" ]; then
  # Read variables while suppressing terminal echo
  set +o allexport
  while IFS='=' read -r key val || [ -n "$key" ]; do
    # Strip comments and trim whitespace
    key=$(echo "$key" | tr -d ' ' | tr -d '\r')
    if [[ "$key" =~ ^# ]] || [[ -z "$key" ]]; then
      continue
    fi
    # Only export expected database keys if not already provided
    if [[ "$key" == "MYSQL_DATABASE" || "$key" == "MYSQL_USER" || "$key" == "MYSQL_PASSWORD" || "$key" == "MYSQL_ROOT_PASSWORD" ]]; then
      val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | tr -d '\r')
      export "${key}=${val}"
    fi
  done < "${PROJECT_ROOT}/.env"
fi

DB_NAME="${MYSQL_DATABASE:-smartspend}"
DB_USER="${MYSQL_USER:-smartspend}"
DB_PASS="${MYSQL_PASSWORD}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_ID="bkp_${TIMESTAMP}"
ARCHIVE_FILENAME="smartspend_db_${TIMESTAMP}.sql.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_FILENAME}"
META_PATH="${BACKUP_DIR}/smartspend_db_${TIMESTAMP}.json"
REDIS_ARCHIVE="${BACKUP_DIR}/smartspend_redis_${TIMESTAMP}.rdb"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting transactional backup: ${BACKUP_ID}"

# 1. Verify MySQL Container is running and healthy
if ! docker ps --filter "name=${MYSQL_CONTAINER}" --filter "status=running" | grep -q "${MYSQL_CONTAINER}"; then
  echo "ERROR: Database container ${MYSQL_CONTAINER} is not running." >&2
  exit 1
fi

# 2. Perform Single-Transaction MySQL Dump with compression
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Executing mysqldump for database '${DB_NAME}'..."

if [ -n "${DB_PASS}" ]; then
  docker exec -i -e MYSQL_PWD="${DB_PASS}" "${MYSQL_CONTAINER}" mysqldump \
    -u"${DB_USER}" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --hex-blob \
    --default-character-set=utf8mb4 \
    "${DB_NAME}" | gzip -9 > "${ARCHIVE_PATH}"
else
  docker exec -i "${MYSQL_CONTAINER}" mysqldump \
    -u"${DB_USER}" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    --hex-blob \
    --default-character-set=utf8mb4 \
    "${DB_NAME}" | gzip -9 > "${ARCHIVE_PATH}"
fi

# Test Gzip Archive Integrity immediately
if ! gzip -t "${ARCHIVE_PATH}"; then
  echo "ERROR: Generated backup archive corrupted or empty." >&2
  rm -f "${ARCHIVE_PATH}"
  exit 1
fi

# 3. Redis Snapshot
if docker ps --filter "name=${REDIS_CONTAINER}" --filter "status=running" | grep -q "${REDIS_CONTAINER}"; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Triggering Redis background save..."
  docker exec "${REDIS_CONTAINER}" redis-cli bgsave >/dev/null 2>&1 || true
  # Give Redis a moment to write dump.rdb
  sleep 2
  docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${REDIS_ARCHIVE}" 2>/dev/null || true
fi

# 4. Generate Verifiable SHA-256 Checksum and Metadata
CHECKSUM=$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')
SIZE_BYTES=$(wc -c < "${ARCHIVE_PATH}" | tr -d ' ')
ISO_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > "${META_PATH}"
{
  "backupId": "${BACKUP_ID}",
  "filename": "${ARCHIVE_FILENAME}",
  "format": "sql.gz",
  "storageClass": "cold_archive",
  "exportedTables": [
    "users",
    "local_users",
    "expenses",
    "expense_daily_rollups",
    "sessions",
    "system_settings",
    "pro_subscriptions",
    "user_wallets",
    "admin_audit_logs",
    "store_purchases",
    "support_tickets",
    "ads"
  ],
  "checksumSha256": "${CHECKSUM}",
  "sizeBytes": ${SIZE_BYTES},
  "createdAt": "${ISO_TIME}"
}
EOF

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup completed successfully."
echo "  Archive:  ${ARCHIVE_PATH}"
echo "  Metadata: ${META_PATH}"
echo "  Checksum: ${CHECKSUM}"
echo "  Size:     ${SIZE_BYTES} bytes"

# 5. Archive Rotation (Prune older than 30 days, retain at least 3 historical snapshots)
TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -maxdepth 1 -name "smartspend_db_*.sql.gz" | wc -l)
if [ "${TOTAL_BACKUPS}" -gt 3 ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Evaluating 30-day retention rotation policy..."
  find "${BACKUP_DIR}" -maxdepth 1 -name "smartspend_db_*.sql.gz" -mtime +30 | while read -r old_archive; do
    CURRENT_TOTAL=$(find "${BACKUP_DIR}" -maxdepth 1 -name "smartspend_db_*.sql.gz" | wc -l)
    if [ "${CURRENT_TOTAL}" -gt 3 ]; then
      old_meta="${old_archive%.sql.gz}.json"
      echo "  Pruning expired archive (>30d): ${old_archive}"
      rm -f "${old_archive}" "${old_meta}"
    fi
  done
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup workflow finished."
exit 0
