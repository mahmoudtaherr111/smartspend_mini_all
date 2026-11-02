#!/bin/sh
# Proves a backup can be restored: dumps a database, loads the dump into a scratch database on the same server, and
# compares every table's row count. Usage: MYSQL_CONTAINER=name MYSQL_PWD=... scripts/ops/backup-restore-check.sh <database>
# It only reads the source and only writes the scratch database, which it drops at the end.
set -eu
source_db="$1"
scratch="${source_db}_restore_check"
run() { docker exec -i -e MYSQL_PWD "$MYSQL_CONTAINER" "$@"; }
counts() {
  run mysql -uroot -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$1' AND table_type='BASE TABLE' ORDER BY table_name" |
    while read -r table; do
      printf '%s ' "$table"
      run mysql -uroot -N -e "SELECT COUNT(*) FROM \`$1\`.\`$table\`" </dev/null
    done
}
run mysql -uroot -e "DROP DATABASE IF EXISTS \`$scratch\`; CREATE DATABASE \`$scratch\`"
trap 'run mysql -uroot -e "DROP DATABASE IF EXISTS \`$scratch\`"' EXIT
started=$(date +%s)
run mysqldump -uroot --single-transaction --no-tablespaces "$source_db" | run mysql -uroot "$scratch"
restored=$(date +%s)
before=$(counts "$source_db")
after=$(counts "$scratch")
if [ "$before" != "$after" ]; then
  echo "RESTORE_FAILED: row counts differ"
  exit 1
fi
echo "RESTORE_OK: $(echo "$before" | wc -l) tables match, in $((restored - started)) seconds"
