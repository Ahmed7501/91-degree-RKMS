# Backup and Recovery — 91 Degree RKDS

What is protected: the PostgreSQL database in volume `rkds_pgdata` (orders, counters, audit, users, sessions). Everything else can be rebuilt from Git plus `/opt/rkds/.env`.

> **Status:** planned. `scripts/backup.sh`, `restore.sh` and `verify-backup.sh` are written in Phase 2 (P11) and tested locally. VPS cron installation is **NOT RUN** until deployment.

Related: [DEPLOYMENT.md](DEPLOYMENT.md) · [DATABASE.md](DATABASE.md) · [ERROR_HANDLING.md](ERROR_HANDLING.md)

## 1. What to back up

| Item | How | Where |
|---|---|---|
| Database | `pg_dump -Fc` (custom format, compressed) | `/opt/rkds/backups/rkds-YYYYMMDD-HHMMSS.dump` |
| `/opt/rkds/.env` | Manual copy to the owner's password manager / an encrypted location | Off-server |
| Code | Git remote / release tarball | Off-server |

Targets: **RPO ≤ 24 h** (daily dumps; take an extra manual dump before every update), **RTO ≤ 30 min**.

## 2. Daily backup

Mechanics shared by all scripts:
- `scripts/lib/compose.sh` defines the one `$COMPOSE` command: `docker compose -p rkds --env-file /opt/rkds/.env -f /opt/rkds/app/docker-compose.yml -f /opt/rkds/app/docker-compose.proxy-${RKDS_PROXY_OVERLAY}.yml`. `RKDS_PROXY_OVERLAY` (`traefik`|`host`) is read from `/opt/rkds/.env`. The scripts therefore work from cron and from any directory.
- The `db` service bind-mounts `/opt/rkds/backups` at `/backups`. Dumps are written with `pg_dump -f` to a **file**, and restores read from a file path, never a pipe. A custom-format dump written to a pipe lacks data offsets, which can break restores.
- Database name and user are expanded **inside** the container (`sh -c '… -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`), where the postgres image sets them. Cron needs no secrets in its environment.
- After writing, the script `chown`s the dump to the invoking host user (`id -u`/`id -g`), so it can be copied off-server without sudo.

`scripts/backup.sh`:
1. `set -euo pipefail`, `umask 077`, `source "$(dirname "$0")/lib/compose.sh"`.
2. `$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /backups/rkds-<ts>.dump.partial'`
3. Verify: the file is non-empty **and** `$COMPOSE exec -T db pg_restore --list /backups/rkds-<ts>.dump.partial` succeeds.
4. Rename `.partial` → `.dump`. On any failure, delete the partial and exit non-zero.
5. Retention (7 days, matching order retention ADR-024): delete `rkds-*.dump` files older than 7 days in `/opt/rkds/backups` only (`find … -maxdepth 1 -name 'rkds-*.dump' -mtime +7`), but **always keep the newest 3**, so a run of failed backups never leaves zero dumps.
6. Print one summary line (file, size, duration).

Cron (VPS time is probably UTC, so check with `timedatectl`. 22:30 UTC = 03:30 Asia/Karachi, just after closing):
```cron
30 22 * * * /opt/rkds/app/scripts/backup.sh >> /opt/rkds/backups/backup.log 2>&1
```

Manual backup before any update or migration:
```bash
/opt/rkds/app/scripts/backup.sh
```

### Off-server copy (recommended, owner's choice)
Dumps on the same VPS do not survive loss of the VPS. Options: Hostinger VPS snapshots (in hPanel), or periodically `scp`/`rclone` the latest dump to storage the owner controls. Never upload dumps to a service without the owner's explicit approval, because dumps contain customer order text.

## 3. Verify a backup (monthly drill)

`scripts/verify-backup.sh <dump-file-name>` restores into a **scratch database** inside the same `db` container. It never touches `rkds`. Its core steps:
```bash
$COMPOSE exec -T db sh -c 'createdb -U "$POSTGRES_USER" rkds_restore_check'
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d rkds_restore_check --no-owner /backups/<file>.dump'
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d rkds_restore_check -c "select count(*) from orders; select max(business_date) from order_day_counters;"'
$COMPOSE exec -T db sh -c 'dropdb -U "$POSTGRES_USER" rkds_restore_check'
```
Record the date and result in `docs/reports/`.

## 4. Restore (disaster or bad data)

Requires the owner's approval. The kitchen will be offline for a few minutes.

`scripts/restore.sh <dump> --i-understand-this-replaces-production-data`:
1. Refuse without the flag. Refuse if the dump fails `pg_restore --list`.
2. Take a **safety dump** of the current DB (`rkds-pre-restore-<ts>.dump`).
3. `$COMPOSE stop server web` (only RKDS services; `db` keeps running).
4. `$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --role=rkds_app --single-transaction /backups/<file>.dump'`. With `--single-transaction`, a failed restore leaves the DB as it was. `--role=rkds_app` keeps the restored objects owned by the app role.
5. `$COMPOSE up -d --no-deps server web`, then check `/api/health/ready`.
6. Print counts (orders, active orders, max business date) for confirmation.

If step 4 fails: the DB is unchanged (single transaction). Start the services again and investigate. If data is wrong after the restore, repeat with the safety dump.

### Full rebuild on a new VPS
1. Install Docker, then complete DEPLOYMENT.md steps 1–3 with the saved `.env`.
2. Copy the dump into `/opt/rkds/backups/`, then `$COMPOSE up -d db` and wait until it is healthy. The first init creates `rkds_app` via the init script.
3. Run `restore.sh` with the latest dump (the server is not running yet, which is fine).
4. `$COMPOSE up -d`. Migrations apply any newer schema.

## 5. Volume safety

- The compose file sets `name: rkds_pgdata` explicitly on the volume, so its real Docker name is exactly `rkds_pgdata` (no project prefix). It is only deleted by an explicit `docker volume rm rkds_pgdata` or `down -v`. Both are forbidden in normal operations (DEPLOYMENT.md §0).
- Before any risky operation, check that a dump less than 1 hour old exists.

## 6. Failure handling

| Failure | Signal | Action |
|---|---|---|
| Backup fails | Non-zero exit, `backup.log` line `FAILED` | Check disk (`df -h`), `db` health, credentials. TROUBLESHOOTING.md §Backups |
| Disk filling | `df -h` > 85% | Lower retention or move old dumps off-server. Never delete the newest 3 |
| Restore verification fails | Drill script exits non-zero | Treat backups as invalid. Fix before the next deployment |
