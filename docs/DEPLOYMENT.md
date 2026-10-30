# Deployment — 91 Degree RKDS

Target (ADR-026): the owner's existing **Hostinger KVM 2** VPS, which already runs **n8n** and **Evolution API**, as an online HTTPS web app. Netlify was considered and rejected (no long-running Socket.IO server or database). Nothing about the VPS is assumed. Every production step starts with read-only inspection.

**Needed before go-live:** a domain or subdomain whose DNS A record points at the VPS IP (Q-05). For example `kds.<your-domain>`, or a cheap new domain. Building and local testing do not wait for it.

> **Status:** planning. No deployment has been performed. The files referenced here are created in Phase 2 (IMPLEMENTATION_PLAN P11).

Related: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) · [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) · [SECURITY.md](SECURITY.md) §9–10 · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## 0. Safety rules (non-negotiable)

**Never:**
- reinstall/reset the VPS or touch Hostinger's OS templates
- `docker system prune`, `docker volume prune`, `docker network prune`, `docker image prune -a`, `docker container prune`
- `docker compose down -v` (deletes volumes) on **any** project, including `rkds` in normal operation
- stop, restart, recreate or edit n8n / Evolution API containers or their compose files
- restart the shared reverse proxy without first validating its config (`nginx -t`), and only with the owner's approval
- publish PostgreSQL (`ports:` on `db`) or the server port
- use a host port without confirming it is free
- commit `/opt/rkds/.env` or paste secrets into chats, tickets or logs

**Always:**
- run every `docker compose` command with `-p rkds` (or from `/opt/rkds` with `COMPOSE_PROJECT_NAME=rkds`) and the explicit `-f` files
- back up before migrating
- keep the previous image tag for rollback

## 1. Local development

```bash
nvm use                      # Node 24 (.nvmrc)
npm ci
cp .env.example .env         # fill local values (dev DB lines)
npm run db:up                # docker compose -f docker-compose.dev.yml up -d  (Postgres 127.0.0.1:55432)
npm run db:migrate           # prisma migrate dev against rkds_dev
npm run owner:create         # local owner via CLI (prompts)
npm run dev                  # server :3000 + Vite :5173 (Vite proxies /api and /socket.io)
```
Open `http://localhost:5173/owner`, and `http://localhost:5173/kitchen` in another window (pair it from Owner → Settings → Kitchen screens).

Local tests and checks:
```bash
npm run typecheck && npm run lint
npm run test:unit
npm run test:integration     # needs Docker running (rkds_test)
npm run test:e2e             # Playwright; installs browsers once with: npx playwright install chromium firefox webkit
npm run test:coverage
npm run build
npm run verify               # typecheck + lint + unit + integration + build
```

Prod-like local run (verifies Dockerfiles, nginx and Compose before touching the VPS):
```bash
docker compose -p rkds-local -f docker-compose.yml -f docker-compose.proxy-host.yml --env-file .env.prodlike config -q   # validate
docker compose -p rkds-local -f docker-compose.yml -f docker-compose.proxy-host.yml --env-file .env.prodlike up -d --build
curl -fsS http://127.0.0.1:${RKDS_HTTP_PORT}/api/health/ready
```
(`.env.prodlike` is git-ignored. The images always run with `NODE_ENV=production`. For this local HTTP run, set `COMPOSE_PROJECT_NAME=rkds-local`, `APP_ORIGIN=http://127.0.0.1:<port>`, `RKDS_INSECURE_LOCAL=1`, `TRUST_PROXY=1` (only the web nginx is in front), `RKDS_PGDATA_VOLUME=rkds_local_pgdata` and `RKDS_BACKUP_DIR=./backups/prodlike`, so the test stack never shares a volume or folder with a real install. The ops scripts work against it with `RKDS_ENV_FILE=$PWD/.env.prodlike`. Browser smoke tests against it: `E2E_BASE_URL=http://127.0.0.1:<port> E2E_COMPOSE_ARGS="-p rkds-local --env-file .env.prodlike -f docker-compose.yml -f docker-compose.proxy-host.yml" npx playwright test --grep @smoke` (after creating the `e2e-owner` with the container CLI). That flag is the **only** exemption from the https-origin rule, it drops the Secure flag and `__Host-` prefix, and the server refuses it unless `APP_ORIGIN` is a loopback address. See ENVIRONMENT_VARIABLES.md.)

## 2. Step 1 on the VPS — read-only inspection

Run these over SSH (or `scripts/vps-inspect.sh`, which runs exactly these) and send the output to the developer **with secrets removed**. Nothing here changes state.

```bash
uname -a; cat /etc/os-release | head -3
free -h; df -h /; nproc
docker --version; docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
docker network ls
docker volume ls --format '{{.Name}}' | head -50
sudo ss -tlnp | awk 'NR==1 || /LISTEN/'
# Which reverse proxy owns 80/443?
docker ps --format '{{.Names}} {{.Image}}' | grep -Ei 'traefik|nginx|caddy|proxy' || true
systemctl is-active nginx caddy apache2 2>/dev/null || true
# If Traefik: its args/labels reveal entrypoints, cert resolver, network
docker inspect <traefik-container> --format '{{json .Config.Cmd}} {{json .Args}}' 2>/dev/null
docker inspect <traefik-container> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# If host nginx:
ls /etc/nginx/sites-enabled/ 2>/dev/null; sudo nginx -T 2>/dev/null | grep -E 'server_name|listen' | sort -u
# DNS for the chosen RKDS subdomain:
dig +short <your-rkds-domain>  # must resolve to the VPS IP before HTTPS can be issued
```

Decision table:
| Finding | Route with |
|---|---|
| Traefik container holds :80/:443 with the Docker provider | **Overlay A** `docker-compose.proxy-traefik.yml` |
| Host nginx or Caddy (systemd) holds :80/:443 | **Overlay B** `docker-compose.proxy-host.yml` + one new server block |
| Nginx Proxy Manager or something else | Stop and document. Add a matching overlay or use B with the NPM UI |
| Nothing on :80/:443 | Ask the owner. Do **not** install a proxy silently. Recommended: Caddy on the host, or a small Traefik stack, as a separate approved task |

Resource check: confirm ≥ 1 GB RAM free and ≥ 5 GB disk free for images, volume and backups.

## 3. Step 2 — prepare the RKDS directory

```bash
sudo mkdir -p /opt/rkds /opt/rkds/backups
sudo chown -R $USER:$USER /opt/rkds
cd /opt/rkds
git clone <your-private-repo-url> app      # or upload a release tarball via scp (no git needed)
cp app/.env.example .env && chmod 600 .env
# edit .env: COMPOSE_PROJECT_NAME=rkds, RKDS_VERSION=<git short sha>, RKDS_PROXY_OVERLAY=traefik|host,
#            POSTGRES_USER=rkds_admin, POSTGRES_PASSWORD=<generated>, RKDS_DB_APP_PASSWORD=<different generated>,
#            APP_ORIGIN=https://<your-rkds-domain>, TRUST_PROXY=2, overlay variables from inspection
# generate each password separately with:  openssl rand -base64 32 | tr -d '/+='
```

## 4. Step 3 — routing overlay

### Overlay A — existing Traefik
`docker-compose.proxy-traefik.yml` attaches **only** `web` to the existing Traefik network (declared `external: true`, name from `TRAEFIK_NETWORK`) with labels:
```
traefik.enable=true
traefik.docker.network=${TRAEFIK_NETWORK}
traefik.http.routers.rkds.rule=Host(`${RKDS_DOMAIN}`)
traefik.http.routers.rkds.entrypoints=${TRAEFIK_ENTRYPOINT}
traefik.http.routers.rkds.tls.certresolver=${TRAEFIK_CERTRESOLVER}
traefik.http.services.rkds.loadbalancer.server.port=8080
```
Traefik picks up labels dynamically. No Traefik restart and no edits to its compose file are needed. `db` and `server` never join the Traefik network.

### Overlay B — host nginx / Caddy
`docker-compose.proxy-host.yml` publishes `web` on `127.0.0.1:${RKDS_HTTP_PORT}:8080` (loopback only). Add one site:

nginx (`/etc/nginx/sites-available/rkds`, symlinked into `sites-enabled`):
```nginx
server {
  server_name <your-rkds-domain>;
  listen 80;
  location / {
    proxy_pass http://127.0.0.1:<RKDS_HTTP_PORT>;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;   # requires the standard map block
    proxy_read_timeout 75s;
    proxy_buffering off;
    client_max_body_size 64k;
  }
}
```
Add HSTS in the HTTPS server block that certbot creates: `add_header Strict-Transport-Security "max-age=31536000" always;` (Overlay A sets it with a Traefik middleware). Then `sudo nginx -t && sudo systemctl reload nginx` (reload, not restart), and `sudo certbot --nginx -d <your-rkds-domain>` (free Let's Encrypt).
Caddy: `<your-rkds-domain> { reverse_proxy 127.0.0.1:<RKDS_HTTP_PORT> }`, then `caddy validate` and `systemctl reload caddy` (automatic HTTPS).

## 5. Step 4 — build, migrate, start

```bash
cd /opt/rkds
source app/scripts/lib/compose.sh        # defines $COMPOSE = docker compose -p rkds --env-file /opt/rkds/.env -f …/docker-compose.yml -f …/docker-compose.proxy-${RKDS_PROXY_OVERLAY}.yml
$COMPOSE config -q                        # validate (prints nothing on success)
$COMPOSE build                            # tags rkds-server:${RKDS_VERSION}, rkds-web:${RKDS_VERSION}
$COMPOSE up -d                            # db → migrate (one-off) → server → web
$COMPOSE ps                               # all healthy; migrate "exited (0)"
$COMPOSE logs --tail=100 migrate server
```

Compose guarantees (from `docker-compose.yml`):
| Service | Image | Healthcheck | Restart | Limits | Network | Ports |
|---|---|---|---|---|---|---|
| `db` | `postgres:17-alpine` (pinned minor); mounts `database/init-prod` → `/docker-entrypoint-initdb.d` (creates `rkds_app`, first init only) and `/opt/rkds/backups` → `/backups` | `pg_isready` | `unless-stopped` | 512 MB | `rkds_internal` | none |
| `migrate` | `rkds-server:${RKDS_VERSION}` cmd `prisma migrate deploy` | — | `no` | 256 MB | `rkds_internal` | none |
| `server` | `rkds-server:${RKDS_VERSION}` | `GET /api/health/live` | `unless-stopped` | 384 MB | `rkds_internal` | none |
| `web` | `rkds-web:${RKDS_VERSION}` (nginx-unprivileged) | `GET /` | `unless-stopped` | 64 MB | `rkds_internal` (+ proxy net in A) | only via overlay |

All services: json-file logging `max-size=10m, max-file=3`, `no-new-privileges`, non-root (except the postgres entrypoint, which drops to `postgres` itself). Volume: `rkds_pgdata` with explicit `name: rkds_pgdata` (persistent). `migrate` and `server` connect as `rkds_app`, never as the superuser (ADR-022).

Web nginx upstream: `resolver 127.0.0.11 valid=10s ipv6=off;` plus `set $rkds_upstream http://server:3000;` and `proxy_pass $rkds_upstream;`. Docker DNS is re-resolved after `server` is recreated, which otherwise causes stale-IP 502s.

## 6. Step 5 — first owner account (once)

```bash
$COMPOSE exec server node dist/cli/create-owner.js
# prompts: username, password (hidden, ≥12 chars), confirm
```
The database starts empty: no orders, no users, until this command runs.

## 7. Step 6 — verify

```bash
curl -fsS https://<your-rkds-domain>/api/health/ready          # {"status":"ok","db":"ok"}
curl -sI https://<your-rkds-domain>/owner | grep -Ei 'strict-transport|content-security|x-content-type'
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from orders;"'   # 0 on a fresh install
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tc "select rolsuper from pg_roles where rolname = '"'"'rkds_app'"'"';"'   # f
$COMPOSE port db 5432 || echo "db not published (expected)"
docker ps --format '{{.Names}} {{.Status}}' | grep -Ev '^rkds' # n8n / Evolution still Up
```
Manual smoke test: log in, pair the kitchen screen, send an order, see it on the kitchen screen, complete it. Mark the deployment report PASS only for the steps actually observed.

Install the daily backup cron now (BACKUP_AND_RECOVERY.md §2).

## 8. Updates

```bash
cd /opt/rkds/app && git fetch && git checkout <release-tag-or-sha>
cd /opt/rkds && sed -i 's/^RKDS_VERSION=.*/RKDS_VERSION=<new-sha>/' .env
/opt/rkds/app/scripts/backup.sh               # mandatory before migrations
$COMPOSE config -q && $COMPOSE build
$COMPOSE up -d                                # migrate runs first; on failure server is not replaced
$COMPOSE ps && curl -fsS https://<your-rkds-domain>/api/health/ready
```
Expect a few seconds of downtime while `server` restarts. Clients reconnect and resync automatically.

The ADR-027 release adds migration `20261030120000_menu_orders_notes`: expand-only (a new enum and three nullable/defaulted columns plus two CHECKs; existing rows become `TEXT` orders unchanged). It runs automatically in the `migrate` step above, after the mandatory backup. Menu data ships inside the server image; changing the menu later is a normal update with no migration (MENU.md §3).

## 9. Rollback

App-only rollback (migrations are backward-compatible, ADR-017):
```bash
sed -i 's/^RKDS_VERSION=.*/RKDS_VERSION=<previous-sha>/' /opt/rkds/.env
$COMPOSE up -d --no-deps server web           # --no-deps: do NOT re-run the old migrate image against the newer schema
```
If a migration itself broke data (rare, needs owner approval): restore the pre-update backup per BACKUP_AND_RECOVERY.md §4, then start the previous version.

Never `docker rmi` the previous release's images until the new release has been verified for at least a day of service.

## 10. Logs and operations

```bash
$COMPOSE logs -f --tail=200 server            # JSON logs (no order text)
$COMPOSE logs --tail=100 web
$COMPOSE ps
$COMPOSE restart server                       # restarts only RKDS server
$COMPOSE exec server node dist/cli/list-owners.js
$COMPOSE exec server node dist/cli/reset-owner-password.js
```
Stopping RKDS **without** deleting data: `$COMPOSE stop` (or `down` **without** `-v`).

## 11. What remains unverified until the owner provides access/info

- Proxy type, network names, free ports, available RAM/disk (Step 1).
- Domain and DNS (Q-05: none yet; required before go-live).
- Live HTTPS, WebSocket upgrade through the real proxy, backup cron on the VPS.

These will be marked **NOT RUN** in reports until executed.
