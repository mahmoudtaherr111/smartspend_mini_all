#!/usr/bin/env bash
# ==============================================================================
# SmartSpend AI — Migration Preflight Verification Script
# Requirements: OPS-01, Feature 21 (vps-deployment-infra.test.ts Test 3)
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-smartspend-mysql}"
MAX_BACKUP_AGE_SECONDS=900 # 15 minutes

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting migration preflight verification..."

# Gate 1: databaseHealthy
echo -n "Checking database health... "
if docker exec "${MYSQL_CONTAINER}" mysqladmin ping --protocol=socket --silent >/dev/null 2>&1; then
  echo "OK (database is healthy)"
else
  echo "FAILED!"
  echo "ERROR: PREFLIGHT_FAIL_DATABASE_UNHEALTHY" >&2
  exit 1
fi

# Gate 2: backupSnapshotTaken (within last 15 minutes)
echo -n "Checking recent backup snapshot (<15 mins)... "
LATEST_BACKUP=$(find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql.gz" 2>/dev/null | sort -r | head -n 1)

if [ -z "${LATEST_BACKUP}" ]; then
  echo "FAILED! No backup found in ${BACKUP_DIR}."
  echo "ERROR: PREFLIGHT_FAIL_NO_BACKUP_SNAPSHOT" >&2
  exit 1
fi

NOW_SEC=$(date +%s)
BACKUP_SEC=$(stat -c %Y "${LATEST_BACKUP}" 2>/dev/null || stat -f %m "${LATEST_BACKUP}" 2>/dev/null || echo 0)
AGE_SEC=$((NOW_SEC - BACKUP_SEC))

if [ "${AGE_SEC}" -gt "${MAX_BACKUP_AGE_SECONDS}" ]; then
  echo "FAILED! Latest backup is ${AGE_SEC}s old (max allowed: ${MAX_BACKUP_AGE_SECONDS}s)."
  echo "ERROR: PREFLIGHT_FAIL_NO_BACKUP_SNAPSHOT" >&2
  exit 1
fi
echo "OK (${LATEST_BACKUP}, age: ${AGE_SEC}s)"

# Gate 3: journalValid (db-doctor check)
echo -n "Checking migration journal status... "
cd "${PROJECT_ROOT}"
if npm run db:doctor -- --strict >/dev/null 2>&1; then
  echo "OK (journal is synchronized and valid)"
else
  # If npm run db:doctor strictly failed
  echo "FAILED! Journal desync detected."
  echo "ERROR: PREFLIGHT_FAIL_JOURNAL_DESYNC" >&2
  exit 1
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] All preflight checks PASSED. Ready for migration."
exit 0
