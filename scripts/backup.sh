#!/usr/bin/env bash
# Daily database backup (BACKUP_AND_RECOVERY §2). Safe to run from cron and before every update.
# Writes a custom-format dump to a FILE via the /backups bind mount (never a pipe), verifies it,
# then keeps 7 days of dumps (always at least the newest 3).
set -euo pipefail
umask 077
# shellcheck source=lib/compose.sh
source "$(dirname "$0")/lib/compose.sh"

BACKUP_DIR="$(grep -E '^RKDS_BACKUP_DIR=' "$RKDS_ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
BACKUP_DIR="${BACKUP_DIR:-$RKDS_HOME/backups}"
RETENTION_DAYS=7
KEEP_AT_LEAST=3

ts="$(date -u +%Y%m%d-%H%M%S)"
name="rkds-$ts.dump"
start=$(date +%s)

cleanup_partial() {
  $COMPOSE exec -T db sh -c "rm -f /backups/$name.partial" >/dev/null 2>&1 || true
}
trap 'echo "$(date -u +%FT%TZ) FAILED backup $name" >&2; cleanup_partial' ERR

# Credentials and database name are expanded INSIDE the container; cron needs no secrets.
$COMPOSE exec -T db sh -c "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc -f /backups/$name.partial"
$COMPOSE exec -T db sh -c "test -s /backups/$name.partial && pg_restore --list /backups/$name.partial >/dev/null"
$COMPOSE exec -T db sh -c "mv /backups/$name.partial /backups/$name"
$COMPOSE exec -T db sh -c "chown $(id -u):$(id -g) /backups/$name" 2>/dev/null || true

# Retention: only this directory, only rkds-*.dump, never the newest $KEEP_AT_LEAST.
mapfile -t all < <(ls -1t "$BACKUP_DIR"/rkds-*.dump 2>/dev/null || true)
for file in "${all[@]:$KEEP_AT_LEAST}"; do
  if [ -n "$(find "$file" -maxdepth 0 -mtime +"$RETENTION_DAYS" 2>/dev/null)" ]; then
    rm -f -- "$file"
  fi
done

size="$(du -h "$BACKUP_DIR/$name" 2>/dev/null | cut -f1 || echo '?')"
echo "$(date -u +%FT%TZ) OK backup $name size=$size duration=$(( $(date +%s) - start ))s"
