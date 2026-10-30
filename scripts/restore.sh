#!/usr/bin/env bash
# Restore the LIVE database from a dump (BACKUP_AND_RECOVERY §4). Needs the owner's approval.
# The kitchen is offline for a few minutes. A safety dump of the current data is taken first.
#   scripts/restore.sh rkds-20261030-223000.dump --i-understand-this-replaces-production-data
set -euo pipefail
# shellcheck source=lib/compose.sh
source "$(dirname "$0")/lib/compose.sh"

file="${1:?usage: restore.sh <dump file name> --i-understand-this-replaces-production-data}"
if [ "${2:-}" != "--i-understand-this-replaces-production-data" ]; then
  echo "Refusing: add --i-understand-this-replaces-production-data to confirm." >&2
  exit 1
fi
# Strict name check: the name is used inside `sh -c`, so nothing but the expected pattern passes.
if [[ ! "$file" =~ ^rkds-(pre-restore-)?[0-9]{8}-[0-9]{6}\.dump$ ]]; then
  echo "Expected a dump name like rkds-20261030-223000.dump" >&2
  exit 1
fi

echo "1/5 Checking the dump…"
$COMPOSE exec -T db sh -c "pg_restore --list /backups/$file >/dev/null"

safety="rkds-pre-restore-$(date -u +%Y%m%d-%H%M%S).dump"
echo "2/5 Safety dump of the current data: $safety"
$COMPOSE exec -T db sh -c "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc -f /backups/$safety"

echo "3/5 Stopping server and web (db keeps running)…"
$COMPOSE stop server web

echo "4/5 Restoring in a single transaction (a failure leaves the database unchanged)…"
if ! $COMPOSE exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner --role=rkds_app --single-transaction /backups/$file"; then
  echo "Restore FAILED; the database is unchanged. Starting the services again." >&2
  $COMPOSE up -d --no-deps server web
  exit 1
fi

echo "5/5 Starting server and web…"
$COMPOSE up -d --no-deps server web
$COMPOSE exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"select 'orders=' || count(*) from orders; select 'active=' || count(*) from orders where status = 'ACTIVE'; select 'latest_business_date=' || coalesce(max(business_date)::text, 'none') from order_day_counters;\""
echo "Restore finished from $file. If the data looks wrong, restore $safety the same way."
