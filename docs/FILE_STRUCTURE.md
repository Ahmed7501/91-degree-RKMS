# File Structure — 91 Degree RKDS

This is the **planned** structure. Nothing below `apps/`, `packages/`, `database/`, `tests/` or `scripts/` exists until Phase 2. Update this file whenever a module is added, moved or removed.

## 1. Tree

```
91-degree-RKMS/
├─ CLAUDE.md                         # persistent Claude Code instructions (concise)
├─ README.md                         # overview + quick start
├─ package.json                      # npm workspaces root + all scripts
├─ package-lock.json
├─ .nvmrc                            # 24
├─ tsconfig.base.json                # strict TS settings shared by all workspaces
├─ eslint.config.js                  # flat config: typescript-eslint, react, security bans
├─ .prettierrc.json · .editorconfig
├─ .gitignore · .dockerignore
├─ .env.example                      # placeholders only
├─ .env.compose-check                # committed dummy, non-secret values used only for `compose config -q` (G8)
├─ vitest.config.ts                  # root Vitest "projects": shared, server-unit, server-int, web
├─ playwright.config.ts              # E2E config (Chromium primary; Firefox/WebKit owner smoke)
├─ docker-compose.yml                # PRODUCTION base: db, migrate, server, web — no host ports
├─ docker-compose.proxy-traefik.yml  # overlay A: join existing Traefik network + labels
├─ docker-compose.proxy-host.yml     # overlay B: bind web to 127.0.0.1:${RKDS_HTTP_PORT}
├─ docker-compose.dev.yml            # LOCAL ONLY: Postgres on 127.0.0.1:55432 (rkds_dev + rkds_test)
├─ database/
│  ├─ schema.prisma
│  ├─ migrations/<timestamp>_<name>/migration.sql
│  ├─ init/01-create-test-db.sql     # dev compose only: rkds_app role, rkds_test, rkds_shadow
│  └─ init-prod/10-create-app-role.sh # prod first-init: non-superuser rkds_app owning the DB (ADR-022)
├─ packages/shared/                  # @rkds/shared — framework-free contracts and pure logic
│  └─ src/
│     ├─ index.ts
│     ├─ constants.ts
│     ├─ schemas/{order,auth,kitchen,socket,common}.ts
│     ├─ errors/{codes,messages}.ts
│     ├─ time/{business-date,timer,format}.ts
│     └─ text/normalize-order-text.ts
├─ apps/server/                      # @rkds/server
│  ├─ Dockerfile
│  ├─ prisma.config.ts               # points Prisma at ../../database
│  ├─ scripts/migrate-check.mjs      # G9 drift check against rkds_test
│  ├─ src/generated/prisma/          # Prisma client output (git-ignored, `prisma generate` on install)
│  ├─ src/
│  │  ├─ main.ts · app.ts · services.ts   # services.ts: one SessionService/AuthService/PairingService shared by HTTP and sockets
│  │  ├─ config/env.ts
│  │  ├─ lib/{clock,logger,crypto}.ts
│  │  ├─ errors/app-error.ts
│  │  ├─ db/{prisma,errors}.ts
│  │  ├─ http/validate.ts
│  │  ├─ http/middleware/{request-id,http-logger,request-timeout,security,origin-check,rate-limit,not-found,error-handler}.ts
│  │  ├─ modules/health/health.routes.ts
│  │  ├─ modules/auth/{auth.routes,auth.service,session.service,password,cookies,require-role}.ts
│  │  ├─ modules/kitchen-devices/{kitchen-devices.routes,pairing.service}.ts
│  │  ├─ modules/orders/{orders.routes,orders.service,orders.repository,idempotency,transitions,order-dto}.ts
│  │  ├─ modules/menu/{menu-catalog,menu.routes}.ts + 91-degree-menu.json   (ADR-027, docs/MENU.md)
│  │  ├─ modules/maintenance/{session-cleanup,order-retention}.ts
│  │  ├─ realtime/{socket-server,socket-auth}.ts   # socket-server also holds the broadcaster and the 60 s sweeper
│  │  └─ cli/{create-owner,reset-owner-password,list-owners,disable-owner,prompt,cli-context}.ts
│  └─ tests/
│     ├─ global-setup.ts             # recreate rkds_test schema + migrate deploy, once per run
│     ├─ helpers/{test-db,factories,app-harness,socket-client,fixed-clock}.ts
│     └─ integration/*.int.test.ts
├─ apps/web/                         # @rkds/web
│  ├─ Dockerfile · nginx/default.conf · index.html · vite.config.ts
│  ├─ public/brand/                  # logo cropped from the menu (Q-06), favicon, app icons 192/512
│  ├─ public/manifest.webmanifest    # installable web app (NFR-12)
│  └─ src/
│     ├─ main.tsx · App.tsx
│     ├─ styles/{tokens.css,global.css}
│     ├─ lib/{api-client,api-error,clock-sync,idempotency,clipboard,sound,wake-lock,fullscreen,storage}.ts
│     ├─ realtime/{socket,order-store,use-order-sync}.ts
│     ├─ auth/{session-context.tsx,require-session.tsx}
│     ├─ hooks/{use-now,use-reduced-motion}.ts
│     ├─ components/ui/{Button,SegmentedControl,Textarea,Dialog,Toast,ConnectionPill,Spinner,EmptyState,ErrorBanner,BrandMark}.tsx
│     ├─ components/orders/{TimerBadge,SourceBadge,StatusBadge,OrderText,OrderItems,KitchenNotes}.tsx
│     ├─ features/owner/{OwnerLoginPage,OwnerPage,OwnerHeader,OrderComposer,ActiveOrdersList,HistoryPanel,SettingsSheet,KitchenDevicesPanel}.tsx
│     ├─ features/owner/{use-submit-order.ts,NotesField.tsx}
│     ├─ features/owner/menu/{cart.ts,use-menu.ts,MenuPicker,CartSummary,QuantityStepper}.tsx
│     ├─ features/kitchen/{KitchenPairPage,KitchenPage,KitchenHeader,OrderBoard,KitchenOrderCard,SoundSettings}.tsx
│     └─ app/{ErrorBoundary,NotFoundPage}.tsx
├─ tests/e2e/                        # Playwright
│  ├─ start-server.mjs               # reset rkds_test, migrate, create owner (built CLI), run built server
│  ├─ fixtures.ts                    # login, pairing, sendOrder, clearOrders, backdated orders
│  ├─ tsconfig.json
│  └─ *.spec.ts
├─ scripts/
│  ├─ vps-inspect.sh                 # READ-ONLY VPS inspection
│  ├─ lib/compose.sh                 # single $COMPOSE definition (-p rkds, --env-file, -f files) sourced by all ops scripts
│  ├─ backup.sh · restore.sh · verify-backup.sh
│  ├─ compose-check.mjs               # G8: compose config -q for both overlays + dev
│  └─ check-bundle-secrets.mjs
└─ docs/ …                           # see INDEX.md
```

## 2. Major files

Unit tests sit next to their source (`foo.ts` → `foo.test.ts`). Integration tests are in `apps/server/tests/integration/`.

### packages/shared
| File | Purpose / responsibilities | Depends on | Docs | Tests |
|---|---|---|---|---|
| `constants.ts` | `ORDER_TEXT_MAX_CHARS=5000`, `PREP_MINUTES=[15,20,25,30]`, `WARNING_THRESHOLD_S=300`, `RESTAURANT_TZ='Asia/Karachi'`, sources | — | REQUIREMENTS | — |
| `schemas/order.ts` | `CreateOrderBody`, `OrderDto`, `HistoryQuery`, response schemas | zod, constants, normalize | API_CONTRACTS | `order.test.ts` |
| `schemas/socket.ts` | Event names + payload schemas | order | REALTIME_FLOW | `socket.test.ts` |
| `errors/codes.ts` | `ErrorCode` union, `httpStatusFor`, `isRetryable` | — | ERROR_HANDLING | `codes.test.ts` |
| `errors/messages.ts` | User-facing message catalog | codes | ERROR_HANDLING | `messages.test.ts` (every code has a message) |
| `time/business-date.ts` | `businessDateFor(instant, cutoffHour, tz)` | Intl | DATABASE §4 | `business-date.test.ts` (≥ 90%) |
| `time/timer.ts` | `computeTimerState(deadline, now)` → `{phase, seconds, label}` | — | ARCHITECTURE §7 | `timer.test.ts` (≥ 90%) |
| `time/format.ts` | `formatDisplayNumber`, `formatClock`, `formatKarachiTime` | Intl | DESIGN_SYSTEM | `format.test.ts` |
| `text/normalize-order-text.ts` | ADR-020 normalization | — | DECISIONS | `normalize-order-text.test.ts` |

### apps/server
| File | Purpose / responsibilities | Depends on | Docs | Tests |
|---|---|---|---|---|
| `main.ts` | Load env, create HTTP server, attach Socket.IO, start cleanup, graceful shutdown | app, realtime, config | ARCHITECTURE | E2E restart |
| `app.ts` | Express factory: middleware order, routes, error handler. No `listen` (testable) | middleware, modules | ERROR_HANDLING §3 | all `*.int.test.ts` |
| `config/env.ts` | Zod-validated env, names-only error output | zod | ENVIRONMENT_VARIABLES | `env.test.ts` |
| `lib/clock.ts` | `Clock` interface (`now()`), system + fixed impls | — | DATABASE §4 | used by tests |
| `lib/logger.ts` | pino instance + redaction | pino | ERROR_HANDLING §3 | `logger.test.ts` (redaction) |
| `db/errors.ts` | Prisma/pg error → `AppError` (SQLSTATE + constraint name) | Prisma | ERROR_HANDLING | `db/errors.test.ts` |
| `http/middleware/request-timeout.ts` | 12 s handler timeout → `503 REQUEST_TIMEOUT` | — | ERROR_HANDLING §3 | `request-timeout.test.ts` |
| `http/middleware/error-handler.ts` | Central error → envelope + log | shared/errors | ERROR_HANDLING | `error-handler.test.ts` |
| `http/middleware/origin-check.ts` | CSRF Origin rule, JSON content-type rule | env | SECURITY §4 | `security.int.test.ts` |
| `http/middleware/rate-limit.ts` | Limiters per SECURITY §7 | express-rate-limit | SECURITY | `rate-limit.int.test.ts` |
| `modules/auth/session.service.ts` | Create/resolve/touch/revoke sessions, TTLs | prisma, crypto, clock | SECURITY §2 | `session.service.test.ts`, `auth.int.test.ts` |
| `modules/auth/password.ts` | Argon2id hash/verify/needsRehash, common-password check | @node-rs/argon2 | SECURITY §1 | `password.test.ts` |
| `modules/auth/require-role.ts` | Role guard middleware | session | SECURITY §3 | `authorization.int.test.ts` |
| `modules/kitchen-devices/pairing.service.ts` | Generate/redeem codes, list/revoke devices | session (revocations reach sockets via `SessionService.onRevoke`) | SECURITY §1 | `pairing.int.test.ts` |
| `modules/orders/orders.service.ts` | Create (idempotency + numbering), transitions, list. Emits after commit | repository, OrderEventBus, clock | ARCHITECTURE §5 | `orders.*.int.test.ts` (≥ 90%) |
| `modules/orders/orders.repository.ts` | Raw SQL counter upsert, conditional update, keyset history | prisma | DATABASE §3 | integration |
| `modules/orders/idempotency.ts` | Request hash (text or menu lines + notes), replay/reuse decision | crypto | ADR-006, ADR-027 | `idempotency.test.ts` (≥ 90%) |
| `modules/menu/menu-catalog.ts` | Loads and validates the menu file (fails fast), owner menu, resolves order lines into snapshots, builds the kitchen text | shared `Menu` | ADR-027, MENU.md | `menu-catalog.test.ts` |
| `modules/menu/menu.routes.ts` | `GET /api/menu` (owner) | menu-catalog | API_CONTRACTS | `orders.menu.int`, `authorization.int` |
| `modules/menu/91-degree-menu.json` | The printed menu as data (12 categories, 88 items) | — | MENU.md | `menu-catalog.test.ts` |
| `modules/maintenance/order-retention.ts` | Hourly batched purge of closed orders past `ORDER_RETENTION_DAYS` | orders repository, clock, logger | ADR-024, DATABASE §7 | `order-retention.int.test.ts` |
| `modules/orders/transitions.ts` | Pure transition table + outcome resolution | shared | DATABASE §3 | `transitions.test.ts` (100% branches) |
| `realtime/socket-auth.ts` | Handshake Origin + cookie session check | session | REALTIME_FLOW §1 | `socket.auth.int.test.ts` |
| `realtime/socket-server.ts` | Socket.IO setup, Origin `allowRequest`, rooms, broadcaster (subscribes to `OrderEventBus` and session revocations), 60 s sweeper | socket.io, services | REALTIME_FLOW | `socket.auth.int.test.ts`, `socket.events.int.test.ts` |
| `modules/orders/order-events.ts` | In-process `OrderEventBus`: the service publishes after commit, the socket server subscribes | — | ARCHITECTURE §5 | `order-events.test.ts` |
| `cli/create-owner.ts` | Interactive owner creation, refuses duplicates | password, prisma | DEPLOYMENT §6 | `cli.int.test.ts` |

### apps/web
| File | Purpose / responsibilities | Depends on | Docs | Tests |
|---|---|---|---|---|
| `lib/api-client.ts` | Fetch wrapper: timeout, request ID, idempotency, envelope parsing, clock samples | shared | ERROR_HANDLING §4 | `api-client.test.ts` |
| `lib/clock-sync.ts` | Offset estimation (median of 5) | — | REALTIME_FLOW §5 | `clock-sync.test.ts` |
| `lib/clipboard.ts` | Gesture-bound `readText` with capability/permission fallbacks | — | REQUIREMENTS FR-OWN-06 | `clipboard.test.ts` |
| `lib/sound.ts` | `OrderAlert`: ~3.5 s Web Audio alert, unlock on gesture, one per order id, one follow-up while playing, volume | storage | REALTIME_FLOW §6, ADR-028 | `sound.test.ts` |
| `lib/wake-lock.ts` | Screen Wake Lock acquire/re-acquire on visibility, silent fallback | — | FR-KIT-09 | `wake-lock.test.ts` |
| `realtime/order-store.ts` | Reducer: snapshot replace, buffered events, version merge | shared | REALTIME_FLOW §4 | `order-store.test.ts` (≥ 90%) |
| `realtime/use-order-sync.ts` | Socket lifecycle → store + connection state | socket.io-client, api | REALTIME_FLOW §3 | `use-order-sync.test.tsx` |
| `hooks/use-now.ts` | Single shared 1 Hz ticker aligned to second + offset | clock-sync | ADR-010 | `use-now.test.ts` |
| `features/owner/use-submit-order.ts` | Submission state machine, retry with the same key, draft persistence | api, idempotency, storage | ERROR_HANDLING §6 | `use-submit-order.test.ts` |
| `features/owner/OrderComposer.tsx` | Mode tabs (Menu / Paste / Type), textarea, menu picker + summary, notes, selectors, Paste (fills only) + Send to Kitchen | use-submit-order, use-menu, clipboard | DESIGN_SYSTEM §4 | `OrderComposer.test.tsx`, `OrderComposer.menu.test.tsx` |
| `features/owner/menu/cart.ts` | Pure cart logic: + / −, clamp 0–99, no duplicate lines, summary with stale-line flags, reference total, stored-draft sanitizing | shared | ADR-027 | `cart.test.ts` |
| `features/owner/menu/{MenuPicker,CartSummary,QuantityStepper}.tsx`, `use-menu.ts` | Menu UI and loading | cart, api | DESIGN_SYSTEM §4–5 | `OrderComposer.menu.test.tsx` |
| `features/owner/NotesField.tsx` | Kitchen notes textarea with counter | shared | FR-NOTE-01 | `OrderComposer.menu.test.tsx` |
| `features/kitchen/OrderBoard.tsx` | Sorted grid, AnimatePresence, overflow indicator | order-store, motion | DESIGN_SYSTEM §4 | `OrderBoard.test.tsx` |
| `features/kitchen/KitchenOrderCard.tsx` | Card anatomy, timer phases, safe text rendering, menu lines, kitchen notes | TimerBadge, OrderText, OrderItems, KitchenNotes | DESIGN_SYSTEM §5 | `KitchenOrderCard.test.tsx` |
| `features/kitchen/SoundSettings.tsx` | Alert on/off, volume, test | lib/sound | ADR-028 | E2E `menu-and-notes.spec` |
| `nginx/default.conf` | Static serve, SPA fallback, `/api` + `/socket.io` proxy, security headers | — | DEPLOYMENT, SECURITY §6 | E2E (prod-like run) |

### Infrastructure
| File | Purpose | Docs |
|---|---|---|
| `docker-compose.yml` | Production services, healthchecks, restart policies, limits, internal network, volume | DEPLOYMENT |
| `docker-compose.proxy-*.yml` | One routing overlay, chosen after inspection | DEPLOYMENT §4 |
| `docker-compose.dev.yml` | Local Postgres for dev + tests only | TESTING |
| `scripts/backup.sh` / `restore.sh` | pg_dump/pg_restore with safety checks (file-based via the `/backups` bind mount) | BACKUP_AND_RECOVERY |
| `database/init-prod/10-create-app-role.sh` | Creates the non-superuser app role on first DB init | SECURITY §8, ADR-022 |
| `scripts/vps-inspect.sh` | Read-only inventory of VPS ports/proxy/containers | DEPLOYMENT §2 |
