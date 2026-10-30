#!/usr/bin/env bash
# Monthly restore drill (BACKUP_AND_RECOVERY §3). Restores a dump into a SCRATCH database in the same
# db container and prints row counts. Never touches the live database.
#   scripts/verify-backup.sh rkds-20261030-223000.dump
set -euo pipefail
# shellcheck source=lib/compose.sh
source "$(dirname "$0")/lib/compose.sh"

file="${1:?usage: verify-backup.sh <dump file name in the backups folder>}"
# Strict name check: the name is used inside `sh -c`, so nothing but the expected pattern passes.
if [[ ! "$file" =~ ^rkds-(pre-restore-)?[0-9]{8}-[0-9]{6}\.dump$ ]]; then
  echo "Expected a dump name like rkds-20261030-223000.dump" >&2
  exit 1
fi
scratch=rkds_restore_check

$COMPOSE exec -T db sh -c "pg_restore --list /backups/$file >/dev/null"
$COMPOSE exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $scratch && createdb -U \"\$POSTGRES_USER\" $scratch"
trap '$COMPOSE exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists '"$scratch"'" >/dev/null 2>&1 || true' EXIT
$COMPOSE exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $scratch --no-owner /backups/$file"
$COMPOSE exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d $scratch -At -c \"select 'orders=' || count(*) from orders; select 'active=' || count(*) from orders where status = 'ACTIVE'; select 'users=' || count(*) from users; select 'latest_business_date=' || coalesce(max(business_date)::text, 'none') from order_day_counters;\""
echo "Restore drill OK for $file (scratch database dropped)."
