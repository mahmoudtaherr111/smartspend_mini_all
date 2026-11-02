#!/usr/bin/env bash
# ==============================================================================
# SmartSpend AI — Zero-Loss Rollback Script (Application & Database)
# Requirements: OPS-01, Feature 21, DEBT-23, DEBT-24
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_CONTAINER="${APP_CONTAINER:-smartspend-app}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://127.0.0.1:3000/health}"

TARGET_COMMIT_OR_TAG=""
DB_SNAPSHOT_PATH=""
FORCE_ROLLBACK=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --git-ref)
      TARGET_COMMIT_OR_TAG="$2"
      shift 2
      ;;
    --db-snapshot)
      DB_SNAPSHOT_PATH="$2"
      shift 2
      ;;
    -f|--force|-y|--yes)
      FORCE_ROLLBACK=true
      shift
      ;;
    *)
      if [ -z "$TARGET_COMMIT_OR_TAG" ]; then
        TARGET_COMMIT_OR_TAG="$1"
      elif [ -z "$DB_SNAPSHOT_PATH" ]; then
        DB_SNAPSHOT_PATH="$1"
      fi
      shift
      ;;
  esac
done

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Initiating zero-loss rollback procedure..."

# 1. Confirm operator intention
if [ "${FORCE_ROLLBACK}" != "true" ]; then
  echo "Target Code Ref:      ${TARGET_COMMIT_OR_TAG:-'(none - keeping current code)'}"
  echo "Database Snapshot:    ${DB_SNAPSHOT_PATH:-'(none - keeping current database)'}"
  read -p "Proceed with rollback? (y/N): " -r CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled by operator."
    exit 0
  fi
fi

# 2. Revert Database if pre-migration snapshot provided
if [ -n "${DB_SNAPSHOT_PATH}" ]; then
  if [ ! -f "${DB_SNAPSHOT_PATH}" ]; then
    echo "ERROR: Specified database snapshot does not exist: ${DB_SNAPSHOT_PATH}" >&2
    exit 1
  fi
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Reverting database using ${DB_SNAPSHOT_PATH}..."
  "${SCRIPT_DIR}/restore.sh" --force "${DB_SNAPSHOT_PATH}"
fi

# 3. Rollback Git / Code if ref provided
if [ -n "${TARGET_COMMIT_OR_TAG}" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Checking out target code ref: ${TARGET_COMMIT_OR_TAG}..."
  cd "${PROJECT_ROOT}"
  git checkout "${TARGET_COMMIT_OR_TAG}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Rebuilding production container..."
  docker compose -f docker-compose.prod.yml build app
  docker compose -f docker-compose.prod.yml up -d --no-deps app
fi

# 4. Verify Health Endpoint
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Verifying post-rollback health status..."
HEALTHY=false
for i in $(seq 1 30); do
  sleep 2
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_ENDPOINT}" 2>/dev/null || true)
  if [ "${HTTP_CODE}" = "200" ]; then
    HEALTHY=true
    break
  fi
  echo "  Waiting for healthcheck to respond 200 (attempt $i/30)..."
done

if [ "${HEALTHY}" = "true" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Rollback completed successfully and application is healthy."
  exit 0
else
  echo "ERROR: Health check failed following rollback. Review container logs immediately: docker logs ${APP_CONTAINER}" >&2
  exit 1
fi
