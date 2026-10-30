# Environment Variables — 91 Degree RKDS

The server validates its variables at startup with Zod (`apps/server/src/config/env.ts`). Invalid or missing variables stop startup, and the error lists the variable **names** only. The frontend has **no** runtime environment variables and receives no secrets (same-origin, ADR-011).

Files:
- `.env.example` (committed): placeholders only.
- `.env` (local dev, git-ignored).
- `/opt/rkds/.env` (VPS, `chmod 600`, never committed).

## Server (`apps/server`)

| Variable | Required | Default | Example / format | Notes |
|---|---|---|---|---|
| `NODE_ENV` | yes | — | `development` \| `test` \| `production` | Production enables `__Host-` cookie + Secure flag |
| `PORT` | no | `3000` | int | Internal container port |
| `DATABASE_URL` | yes | — | `postgresql://rkds_app:<password>@db:5432/rkds?schema=public` | Secret. In Compose it is assembled from `RKDS_DB_APP_PASSWORD` and `POSTGRES_DB`. Always the non-superuser `rkds_app` (ADR-022) |
| `APP_ORIGIN` | yes | — | `https://kds.example.com` (placeholder) / `http://localhost:5173` | Exact origin, used for the CSRF/socket Origin check |
| `TRUST_PROXY` | no | `0` (dev) | `2` in production | Exact hop count. Never `true` |
| `RESTAURANT_TIMEZONE` | no | `Asia/Karachi` | IANA name | Display + business-day calculation |
| `BUSINESS_DAY_CUTOFF_HOUR` | no | `6` | 0–23 | Owner decision Q-01 (open 17:00–03:00) |
| `ORDER_RETENTION_DAYS` | no | `7` | int 1–365 | Owner decision Q-04. Completed/cancelled orders older than this many business days are purged hourly (ADR-024) |
| `OWNER_SESSION_ABSOLUTE_HOURS` | no | `168` | int | 7 days |
| `OWNER_SESSION_IDLE_HOURS` | no | `24` | int | |
| `KITCHEN_SESSION_ABSOLUTE_DAYS` | no | `90` | int | |
| `KITCHEN_SESSION_IDLE_DAYS` | no | `14` | int | |
| `LOG_LEVEL` | no | `info` | `fatal`…`trace` | `debug` never logs order text either |
| `RATE_LIMIT_MULTIPLIER` | no | `1` | positive int | Scales all rate limits for integration/E2E servers only. **Must be 1 in production** (startup refuses otherwise) |
| `RKDS_INSECURE_LOCAL` | no | unset | `1` | Only for the local prod-like run over plain HTTP: drops the Secure flag and `__Host-` prefix. **The server refuses to start if this is set and `APP_ORIGIN` is not a loopback address** |
| `TEST_DATABASE_URL` | tests only | — | `postgresql://rkds_app:rkds_app_dev@127.0.0.1:55432/rkds_test` | The harness refuses DB names not ending in `_test` |
| `SHADOW_DATABASE_URL` | local dev only | — | `postgresql://rkds_app:rkds_app_dev@127.0.0.1:55432/rkds_shadow` | Shadow DB for `prisma migrate dev`, owned by `rkds_app`. Never set in production |

## Compose (`docker-compose.yml` + overlays)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | yes | `rkds` | Unique project name, isolates containers/networks/volumes |
| `RKDS_VERSION` | yes | `2026.10.29-1` or the git short SHA | Image tag for `rkds-server`/`rkds-web`; enables rollback |
| `POSTGRES_DB` | yes | `rkds` | |
| `POSTGRES_USER` | yes | `rkds_admin` | Superuser. Used **only** for admin/backup via `exec` |
| `POSTGRES_PASSWORD` | yes | *generate*: `openssl rand -base64 32 \| tr -d '/+='` | Secret. Never reuse n8n/Evolution passwords |
| `RKDS_DB_APP_PASSWORD` | yes | *generate separately* | Secret. Password of the non-superuser `rkds_app` role created by the init script |
| `RKDS_PROXY_OVERLAY` | yes | `traefik` or `host` | Chosen from the VPS inspection. Used by `scripts/lib/compose.sh` |
| `RKDS_INSECURE_LOCAL` | local prod-like only | `1` | Never set on the VPS (see the server table) |
| `APP_ORIGIN` | yes | `https://<your-rkds-domain>` | Passed to server |
| `TRUST_PROXY` | yes | `2` | Host proxy + web nginx |
| `BUSINESS_DAY_CUTOFF_HOUR` | no | `6` | Passed to server |
| `ORDER_RETENTION_DAYS` | no | `7` | Passed to server |
| `RKDS_DOMAIN` | overlay A only | `<your-rkds-domain>` | Traefik router rule |
| `TRAEFIK_NETWORK` | overlay A only | *from inspection* | Existing external network name |
| `TRAEFIK_ENTRYPOINT` | overlay A only | *from inspection* (e.g. `websecure`) | |
| `TRAEFIK_CERTRESOLVER` | overlay A only | *from inspection* | Existing ACME resolver name |
| `RKDS_PGDATA_VOLUME` | no | `rkds_pgdata` | Name of the database volume. Change it **only** for local test stacks (e.g. `rkds_local_pgdata`) |
| `RKDS_BACKUP_DIR` | no | `/opt/rkds/backups` | Host folder mounted at `/backups` in `db`, used by the backup scripts |
| `RKDS_HTTP_PORT` | overlay B / prod-like local | *a free port chosen after inspection* | Bound to `127.0.0.1` only |

No variable values in this document are real. Domains, ports and network names must come from the user and the VPS inspection (DEPLOYMENT.md §2).

## `.env.example` (to be created in Phase 2)

```dotenv
# --- Compose ---
COMPOSE_PROJECT_NAME=rkds
RKDS_VERSION=change-me
RKDS_PROXY_OVERLAY=host           # traefik | host — chosen from the VPS inspection
POSTGRES_DB=rkds
POSTGRES_USER=rkds_admin
POSTGRES_PASSWORD=change-me-generate-with-openssl
RKDS_DB_APP_PASSWORD=change-me-generate-with-openssl-different
APP_ORIGIN=https://your-rkds-domain.example
TRUST_PROXY=2
BUSINESS_DAY_CUTOFF_HOUR=6
ORDER_RETENTION_DAYS=7
# Overlay B (host nginx/Caddy) — fill from VPS inspection
RKDS_HTTP_PORT=
# Overlay A (Traefik) — fill from VPS inspection
RKDS_DOMAIN=
TRAEFIK_NETWORK=
TRAEFIK_ENTRYPOINT=
TRAEFIK_CERTRESOLVER=
# --- Local development only (docker-compose.dev.yml; local-only throwaway passwords) ---
# DATABASE_URL=postgresql://rkds_app:rkds_app_dev@127.0.0.1:55432/rkds_dev
# SHADOW_DATABASE_URL=postgresql://rkds_app:rkds_app_dev@127.0.0.1:55432/rkds_shadow   # prisma migrate dev only
# TEST_DATABASE_URL=postgresql://rkds_app:rkds_app_dev@127.0.0.1:55432/rkds_test
```

Startup rules in `production` (images always run with `NODE_ENV=production`):
- Refuse if `DATABASE_URL` contains `change-me`. (The compose file also refuses to interpolate empty `POSTGRES_PASSWORD`/`RKDS_DB_APP_PASSWORD` via `${VAR:?}`.)
- Refuse if `APP_ORIGIN` is not `https://`, **unless** `RKDS_INSECURE_LOCAL=1` **and** `APP_ORIGIN` is a loopback address (`localhost`/`127.0.0.1`). This is the single exemption, used for the local prod-like run.
- Refuse if `RATE_LIMIT_MULTIPLIER` ≠ 1, or if `TRUST_PROXY` is `true`.

`.env.compose-check` (committed) holds dummy, non-secret values for every variable, including both overlays' variables. It is used only for `docker compose … config -q` (gate G8).

## Change rules

Adding or renaming a variable means updating: `env.ts` schema + `env.test.ts`, `.env.example`, `docker-compose*.yml`, this file, and the report's "environment changes" section.
