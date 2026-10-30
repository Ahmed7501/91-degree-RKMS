# Troubleshooting — 91 Degree RKDS

Shorthand: `$COMPOSE` is defined by `source /opt/rkds/app/scripts/lib/compose.sh` (= `docker compose -p rkds --env-file /opt/rkds/.env -f …/docker-compose.yml -f …/docker-compose.proxy-${RKDS_PROXY_OVERLAY}.yml`) in production. Locally, use the `npm run …` scripts.

Every API error carries a `requestId`. Search the server logs for it: `$COMPOSE logs server | grep <requestId>`.

## Owner panel

| Symptom | Likely cause | Fix |
|---|---|---|
| "Paste" just focuses the textarea | Browser denied clipboard access or doesn't support `readText` (non-HTTPS, Firefox setting, iOS) | Press Ctrl+V / long-press → Paste, then Send. Allow clipboard permission for the site |
| "Not confirmed — Retry" | Network/proxy/server down during send | Press Retry. The same idempotency key prevents duplicates. Check `/api/health/ready` |
| "An earlier version of this order was already sent as #N" | The first attempt reached the server, then the text was edited | Check order #N on the kitchen screen. Choose "Send as new" only if it really is a different order |
| "Kitchen system is temporarily unavailable" | DB down (503) | `$COMPOSE ps db`, `$COMPOSE logs db`. Restart with `$COMPOSE restart db` if needed |
| Logged out unexpectedly | Idle 24 h / absolute 7 d expiry, or password reset | Log in again. The draft is kept |
| "Too many attempts" | Rate limit | Wait for the countdown |
| Times look wrong | Device clock off (corrected automatically) or wrong `RESTAURANT_TIMEZONE` | Check env. The device clock note is informational |

## Kitchen display

| Symptom | Likely cause | Fix |
|---|---|---|
| Pairing screen after it worked before | Session revoked/expired (90 d / 14 d idle) | Owner → Settings → Kitchen screens → new code |
| Pill stays "Reconnecting" | Proxy not forwarding WebSocket upgrade, or server down | Check health. Verify the proxy config passes `Upgrade`/`Connection` for `/socket.io/`. Long-polling fallback should still work |
| No sound | Autoplay blocked after reload | Tap "Enable sound". Check TV volume/mute |
| Screen goes to sleep | Wake Lock unsupported/denied | Disable TV/OS power saving. Use a Chromium browser |
| Order missing on the kitchen but present on the owner screen | Missed event (should self-heal within 5 min or on reconnect) | Reload the kitchen page. Report it (bug) with the time and order number |
| Duplicate number visible | Two business days' active orders | The "Yesterday" badge distinguishes them. Complete stale orders |

## Server / containers

| Symptom | Check | Fix |
|---|---|---|
| `server` restarting | `$COMPOSE logs --tail=100 server` | Env validation lists missing/invalid variable **names**: fix `/opt/rkds/.env` |
| `migrate` exited non-zero | `$COMPOSE logs migrate` | The server was not replaced. Fix the migration or roll back (DEPLOYMENT §9). Restore the backup only if data was changed |
| `/api/health/ready` 503 | `$COMPOSE ps db`; `$COMPOSE exec db pg_isready` | Start/restart `db`. Check disk space (`df -h`) |
| 502/504 from the domain | Proxy can't reach `web` | Overlay A: is `web` on the Traefik network (`docker inspect rkds-web-1`)? Labels correct? Overlay B: `curl -I http://127.0.0.1:$RKDS_HTTP_PORT/` on the VPS, then nginx `error.log` |
| HTTPS certificate not issued | DNS not pointing to the VPS, or port 80 blocked | `dig +short <domain>`. Traefik/certbot logs |
| CSP errors in the browser console | Header too strict for a new asset | Fix the asset (no inline scripts). Never loosen CSP without an ADR |
| High memory | `docker stats --no-stream` | Limits are set per service. Investigate leaks via logs; restart only `rkds` services |

## Local development

| Symptom | Fix |
|---|---|
| Integration/E2E tests fail to connect | Start Docker Desktop, then `npm run db:up` |
| Test harness refuses the DB | `TEST_DATABASE_URL` must end in `_test` (safety guard) |
| Port 55432 in use | Change the host port in `docker-compose.dev.yml` and both URLs in `.env` |
| Playwright browsers missing | `npx playwright install chromium firefox webkit` |
| Prisma client out of date | `npm run db:generate` |

## Backups

| Symptom | Fix |
|---|---|
| `backup.sh` FAILED | `df -h /opt/rkds`; `$COMPOSE ps db`; ensure `.env` POSTGRES_* match the DB |
| `pg_restore --list` fails | The dump is corrupt. Take a new backup immediately and investigate disk errors |
| Restore failed midway | The single transaction leaves the DB unchanged. Start services and use the pre-restore safety dump if needed |

