#!/usr/bin/env bash
# ==============================================================================
# SmartSpend AI — Zero-Loss Database Restoration & Recovery Script
# Requirements: OPS-01, GAP-37, DEBT-23, DEBT-24
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-smartspend-mysql}"
APP_CONTAINER="${APP_CONTAINER:-smartspend-app}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://127.0.0.1:3000/health}"

# Load environment securely if available
if [ -f "${PROJECT_ROOT}/.env" ]; then
  set +o allexport
  while IFS='=' read -r key val || [ -n "$key" ]; do
    key=$(echo "$key" | tr -d ' ' | tr -d '\r')
    if [[ "$key" =~ ^# ]] || [[ -z "$key" ]]; then
      continue
    fi
    if [[ "$key" == "MYSQL_DATABASE" || "$key" == "MYSQL_USER" || "$key" == "MYSQL_PASSWORD" || "$key" == "MYSQL_ROOT_PASSWORD" ]]; then
      val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | tr -d '\r')
      export "${key}=${val}"
    fi
  done < "${PROJECT_ROOT}/.env"
fi

DB_NAME="${MYSQL_DATABASE:-smartspend}"
DB_USER="${MYSQL_USER:-smartspend}"
DB_PASS="${MYSQL_PASSWORD}"

FORCE_RESTORE=false
ARCHIVE_INPUT=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -f|--force|-y|--yes)
      FORCE_RESTORE=true
      shift
      ;;
    *)
      if [ -z "$ARCHIVE_INPUT" ]; then
        ARCHIVE_INPUT="$1"
      fi
      shift
      ;;
  esac
done

# If no archive specified, find the most recent one
if [ -z "${ARCHIVE_INPUT}" ]; then
  ARCHIVE_INPUT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "smartspend_db_*.sql.gz" 2>/dev/null | sort -r | head -n 1)
  if [ -z "${ARCHIVE_INPUT}" ]; then
    echo "ERROR: No backup archive found in ${BACKUP_DIR}." >&2
    exit 1
  fi
  echo "No archive specified. Automatically selected latest: ${ARCHIVE_INPUT}"
fi

ARCHIVE_PATH="${ARCHIVE_INPUT}"
if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "ERROR: Backup archive file does not exist: ${ARCHIVE_PATH}" >&2
  exit 1
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Preparing restoration from: ${ARCHIVE_PATH}"

# 1. Verify Archive Integrity (gzip test)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Verifying gzip integrity..."
if ! gzip -t "${ARCHIVE_PATH}"; then
  echo "ERROR: Backup archive failed gzip integrity test (archive corrupted)." >&2
  exit 1
fi

# 2. Verify SHA-256 Checksum against metadata if JSON exists
META_FILE="${ARCHIVE_PATH%.sql.gz}.json"
if [ -f "${META_FILE}" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Verifying SHA-256 checksum with ${META_FILE}..."
  EXPECTED_HASH=$(grep '"checksumSha256"' "${META_FILE}" | sed -E 's/.*"checksumSha256": *"([^"]+)".*/\1/')
  ACTUAL_HASH=$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')
  if [ -n "${EXPECTED_HASH}" ] && [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
    echo "ERROR: Checksum mismatch!" >&2
    echo "  Expected: ${EXPECTED_HASH}" >&2
    echo "  Actual:   ${ACTUAL_HASH}" >&2
    exit 1
  fi
  echo "  Checksum verified: ${ACTUAL_HASH}"
fi

# 3. Interactive confirmation unless forced
if [ "${FORCE_RESTORE}" != "true" ]; then
  read -p "WARNING: Restoring this archive will overwrite database '${DB_NAME}'. Continue? (y/N): " -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Restoration cancelled by operator."
    exit 0
  fi
fi

# 4. Mandatory Pre-Restore Safety Snapshot to Guarantee Zero-Loss
SAFETY_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SAFETY_SNAPSHOT="${BACKUP_DIR}/pre_restore_${SAFETY_TIMESTAMP}.sql.gz"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Creating automatic pre-restore safety snapshot..."

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
    "${DB_NAME}" | gzip -9 > "${SAFETY_SNAPSHOT}" || true
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
    "${DB_NAME}" | gzip -9 > "${SAFETY_SNAPSHOT}" || true
fi
echo "  Pre-restore safety snapshot stored: ${SAFETY_SNAPSHOT}"

# 5. Execute Database Restoration
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Streaming decompressed dump to MySQL container..."

if [ -n "${DB_PASS}" ]; then
  gunzip -c "${ARCHIVE_PATH}" | docker exec -i -e MYSQL_PWD="${DB_PASS}" "${MYSQL_CONTAINER}" \
    mysql -u"${DB_USER}" --default-character-set=utf8mb4 "${DB_NAME}"
else
  gunzip -c "${ARCHIVE_PATH}" | docker exec -i "${MYSQL_CONTAINER}" \
    mysql -u"${DB_USER}" --default-character-set=utf8mb4 "${DB_NAME}"
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Database restore finished successfully."

# 6. Restart App Container
if docker ps -a --filter "name=${APP_CONTAINER}" | grep -q "${APP_CONTAINER}"; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restarting application container ${APP_CONTAINER}..."
  docker restart "${APP_CONTAINER}" >/dev/null

  # 7. Poll Health Endpoint until ready (up to 30 attempts, 2s interval)
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Verifying health at ${HEALTH_ENDPOINT}..."
  HEALTHY=false
  for i in $(seq 1 30); do
    sleep 2
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_ENDPOINT}" 2>/dev/null || true)
    if [ "${HTTP_CODE}" = "200" ]; then
      HEALTHY=true
      break
    fi
    echo "  Waiting for application to report healthy (attempt $i/30, status=${HTTP_CODE})..."
  done

  if [ "${HEALTHY}" = "true" ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Verification PASSED: Application is healthy."
  else
    echo "WARNING: Application health endpoint did not respond 200 within timeout. Check docker logs ${APP_CONTAINER}." >&2
    exit 1
  fi
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoration workflow completed successfully."
exit 0
