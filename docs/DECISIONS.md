# Architecture Decision Records — 91 Degree RKDS

Each ADR records context, the decision, the alternatives considered, and the consequences. Never edit an accepted ADR to reverse it. Add a new ADR that supersedes it instead.

Status values: `Proposed` (awaiting owner approval of the Phase 1 package) · `Accepted` · `Superseded by ADR-NNN`.

All ADRs below are **Proposed** until the planning package is approved.

---

### ADR-001 — Monorepo with npm workspaces and a shared contracts package
- **Context:** The frontend and backend must agree on schemas, error codes, timer maths and business-date logic.
- **Decision:** One repo with npm workspaces: `apps/server`, `apps/web`, `packages/shared`. Zod schemas, error codes, constants and pure time functions live in `@rkds/shared` and both apps import them.
- **Alternatives:** pnpm/Turborepo (more tooling than needed); duplicating types (they drift).
- **Consequences:** One source of truth for contracts. `packages/shared` must stay framework-free (no React, no Express, no Prisma).

### ADR-002 — Express + Socket.IO on Node.js 24 LTS
- **Context:** The stack is required. One restaurant, low request volume.
- **Decision:** Express 5 for REST, Socket.IO 4 attached to the same HTTP server. Node 24 LTS (local: v24.18.0).
- **Consequences:** Single process and single port. Horizontal scaling is not needed. If it ever is, Socket.IO would need an adapter (out of scope, see ADR-013).

### ADR-003 — PostgreSQL 17 with Prisma ORM, raw SQL for the counter
- **Decision:** Prisma for schema, migrations and typed queries. The daily counter upsert (`INSERT … ON CONFLICT … RETURNING`) and the conditional status update use `$queryRaw`/`$executeRaw` inside interactive transactions. CHECK constraints (which Prisma cannot express, and leaves alone) are added by hand to migration SQL. Partial/expression indexes are avoided because Prisma reports them as drift.
- **Alternatives:** Drizzle or Kysely (also good; Prisma chosen for the migration workflow and the available `prisma-cli` skill); raw `pg` (more boilerplate).
- **Consequences:** Migrations live in `database/migrations/` and are reviewed as SQL. Hand-added constraints must be covered by an integration test so they cannot silently disappear.

### ADR-004 — Daily numbering with a per-business-day counter row
- **Decision:** Table `order_day_counters(business_date PK, last_number)`. In the same transaction that inserts the order, run an upsert that increments `last_number` and returns it. `UNIQUE(business_date, daily_number)` on `orders` is the backstop.
- **Alternatives:** `MAX(number)+1` (race-prone); PostgreSQL sequences (cannot reset per day transactionally, and gaps on rollback); a global sequence (not human-friendly).
- **Consequences:** The counter row lock serializes concurrent creates for the same day, which is fine at restaurant volume. A rolled-back create also rolls back its increment, so numbers are not skipped in practice. Restarts cannot reset numbering.

### ADR-005 — Business day uses a configurable cutoff hour (Asia/Karachi)
- **Decision:** `businessDate = localDate(instant − cutoffHour)` in `Asia/Karachi`, with `BUSINESS_DAY_CUTOFF_HOUR` default `6`. Computed from `Intl.DateTimeFormat` (no tz library). Pakistan has no DST, but the code does not rely on that.
- **Alternatives:** Hard midnight reset (an order at 00:05 during a busy late night would become `001`).
- **Consequences:** Owner decision Q-01: the restaurant is open 17:00–03:00, so the cutoff is 06:00, three hours after closing and well before opening. Changing the cutoff later is safe because counters are keyed by date and uniqueness holds.

### ADR-006 — Idempotency via a unique key column plus a request hash
- **Decision:** The client generates a UUID per draft and sends it as the `Idempotency-Key` header. `orders.idempotency_key` is UNIQUE. `orders.request_hash` stores the SHA-256 of the normalized `{text, source, prepMinutes}`. Same key + same hash → return the original order (`200`, `Idempotent-Replayed: true`). Same key + different hash → `422 IDEMPOTENCY_KEY_REUSED`.
- **Alternatives:** A separate idempotency table with TTL (more moving parts); time-window de-duplication by text (would block genuinely repeated orders).
- **Consequences:** Retries after timeouts are always safe. Keys live as long as the order row (deleted by the retention purge, ADR-024). A retry more than a week later is not a realistic case.

### ADR-007 — Server-side sessions in PostgreSQL, httpOnly cookie
- **Decision:** A random 256-bit token goes in the cookie (`__Host-rkds_sid` in production). Only its SHA-256 is stored in `sessions`. Owner sessions last 7 days absolute and 24 h idle. Kitchen sessions last 90 days absolute and 14 days idle. `last_seen_at` is written at most every 5 minutes.
- **Alternatives:** JWT (cannot revoke instantly, risky in localStorage); express-session with a store (extra dependency for little gain).
- **Consequences:** Logout and revocation take effect immediately and can disconnect sockets. One DB lookup per request, which is negligible.

### ADR-008 — Kitchen screens are paired with one-time codes
- **Decision:** The owner generates an 8-character code (`XXXX-XXXX`, unambiguous alphabet, 10-minute TTL, single use, stored hashed). The kitchen device enters it at `/kitchen/pair` and receives a `KITCHEN` session labelled with a device name.
- **Alternatives:** A shared kitchen password (hard to rotate, often written on the wall); unauthenticated kitchen URL (leaks customer order text).
- **Consequences:** Each screen can be revoked individually. Typing 8 characters once per 90 days is acceptable on a TV remote or keyboard.

### ADR-009 — REST for all mutations; Socket.IO is broadcast-only
- **Decision:** Clients never mutate state over the socket. The server registers no client→server event handlers, and unknown inbound events are ignored and logged at debug level.
- **Consequences:** Validation, auth, rate limiting and idempotency live in one place (HTTP). Socket auth only needs to answer "may this session receive order events?".

### ADR-010 — Deadline-based timers with server clock-offset correction
- **Decision:** Timers compute `deadlineAt − (Date.now() + clockOffset)`. `clockOffset` comes from `serverTime` in API responses and the socket `server:hello` event (RTT/2 corrected, median of recent samples). One shared 1 Hz ticker drives every card. It is aligned to the boundary of the **corrected** second (`Date.now() + clockOffset`), not the device's second, so displayed seconds never skip or repeat.
- **Consequences:** Survives refresh, reconnect and restart. A wrong device clock is corrected automatically, and an offset larger than 2 minutes shows a subtle warning.

### ADR-011 — Same-origin deployment; nginx in the web container
- **Decision:** The `web` container (nginx, unprivileged) serves the built SPA and reverse-proxies `/api` and `/socket.io` to `server:3000` on the internal network. The browser only ever talks to one origin.
- **Alternatives:** Separate API subdomain (needs CORS and cross-site cookies).
- **Consequences:** CORS stays disabled (no cross-origin access allowed). CSRF defence = SameSite=Strict + Origin check + JSON content-type requirement. `TRUST_PROXY=2` in production (host proxy → web nginx → server).

### ADR-012 — Owner bootstrap via server CLI, not a web setup page
- **Decision:** `create-owner` runs inside the server container (`docker compose exec server node dist/cli/create-owner.js`), prompts for a username and a password (hidden input), and refuses to overwrite existing users.
- **Alternatives:** A web "first run" page (an attacker could claim the instance before the owner does); env-var default password (forbidden).
- **Consequences:** Needs shell access to the VPS, which the owner already has.

### ADR-013 — No Redis; single server instance; in-memory rate limits
- **Decision:** One server container. Rate-limit counters are kept in memory, so they reset on restart (acceptable).
- **Consequences:** Less infrastructure on a shared VPS. Revisit only if multiple instances become necessary.

### ADR-014 — Argon2id for password hashing
- **Decision:** `@node-rs/argon2` (prebuilt binaries including linux-musl, no node-gyp) with OWASP parameters (m=19 MiB, t=2, p=1).
- **Alternative/fallback:** Node's built-in `crypto.scrypt` (N=2^17, r=8, p=1) if prebuilt binaries are unavailable for the target platform.

### ADR-015 — React 19 + Vite + Tailwind CSS v4 + `motion` for list animation
- **Decision:** Tailwind with design tokens as CSS variables. The `motion` library (`AnimatePresence`, layout animations) handles card enter/exit and grid reflow, which CSS alone cannot do cleanly for exits. App state uses React context + `useReducer`; there is no global state library and no TanStack Query.
- **Consequences:** About 35 KB gzip for `motion`, acceptable. Every animation honours `prefers-reduced-motion`.

### ADR-016 — Self-hosted fonts including an Arabic-script fallback
- **Decision:** Barlow Condensed (display), Inter Variable (UI/body, tabular numerals), and Noto Sans Arabic as the fallback for Urdu text pasted from WhatsApp, all via `@fontsource` (OFL). Order text uses `dir="auto"`.
- **Consequences:** No Google Fonts request at runtime (privacy, CSP `font-src 'self'`, works when the CDN is unreachable).

### ADR-017 — Forward-only migrations with expand/contract
- **Decision:** `prisma migrate deploy` runs as a one-off `migrate` service before `server` starts. Schema changes must be backward-compatible with the previous app version (expand → deploy → contract later). Back up before every production migration.
- **Consequences:** App rollback does not need a DB rollback. Destructive changes need a dedicated plan. `prisma` (CLI) is a runtime dependency of the server image. Rolling back with `up -d --no-deps server web` avoids re-running the old `migrate` service.

### ADR-018 — Vitest + Supertest + real PostgreSQL + Playwright
- **Decision:** Vitest for unit tests (server, shared, web with Testing Library + jsdom). Integration tests use Supertest and socket.io-client against a dedicated `rkds_test` database, never mocks for SQL behaviour. Playwright for E2E. Coverage uses `@vitest/coverage-v8`.
- **Consequences:** Docker Desktop must be running for integration/E2E tests (it is installed locally but was **not running** during Phase 1).

### ADR-019 — Production routing decided by VPS inspection, with two overlays
- **Decision:** Base `docker-compose.yml` publishes **no** host ports. Choose one overlay after the read-only inspection in [DEPLOYMENT.md](DEPLOYMENT.md):
  - `docker-compose.proxy-traefik.yml`: joins the existing Traefik network with labels (likely if n8n came from Hostinger's template, **unverified**).
  - `docker-compose.proxy-host.yml`: binds `web` to `127.0.0.1:${RKDS_HTTP_PORT}` for an existing host nginx/Caddy.
- **Consequences:** No second public reverse proxy. Existing services are never modified except for adding one route.

### ADR-020 — Order text normalization policy
- **Decision:** Normalize CRLF/CR → LF, strip `\u0000` (PostgreSQL text cannot store it), trim leading/trailing whitespace of the whole text, then reject if empty, and enforce ≤ 5,000 characters. Rendering always uses React text nodes with `white-space: pre-wrap`. `dangerouslySetInnerHTML` is never used.
- **Consequences:** Quantities, instructions and internal line breaks are preserved exactly.

### ADR-021 — Owner can view the kitchen display; kitchen is read-only
- **Decision:** `/kitchen` accepts `KITCHEN` or `OWNER` sessions. Neither role gets mutation controls on the kitchen view in v1. Owner decision Q-03 ("do what is best"): keep the kitchen read-only, so a shared kitchen screen cannot close orders by accident and one person stays accountable for completing and cancelling.

### ADR-022 — Application connects as a non-superuser database owner
- **Context:** The postgres image's `POSTGRES_USER` is a superuser. An app compromise would then allow server-side command execution in the db container.
- **Decision:** A first-init script creates `rkds_app` (no superuser, createdb or createrole) as owner of the `rkds` database. `migrate` and `server` use it. The superuser is reserved for admin and backup via `docker compose exec`.
- **Consequences:** Two DB passwords to manage. Init scripts run only on an empty volume. An existing volume would need the role created manually (documented in DEPLOYMENT if ever needed).

### ADR-023 — Socket.IO default transport order and lenient missing-Origin
- **Context:** Browsers omit `Origin` on same-origin GET polling requests. With a WebSocket-first transport list, Socket.IO v4 does not fall back to polling by default.
- **Decision:** Use the default transports (polling handshake → WebSocket upgrade). Reject only a present-but-foreign Origin. The session cookie (`SameSite=Strict`) remains mandatory.
- **Consequences:** It works behind proxies that block WebSocket. CSWSH is still prevented, because cross-site requests carry Origin and no cookie.

### ADR-024 — Automatic 7-day order retention purge
- **Context:** Owner decision Q-04: delete orders after one week. Order text can contain customer phone numbers and addresses.
- **Decision:** A server job (`modules/maintenance/order-retention.ts`) runs at startup and every hour. It deletes orders with `status <> 'ACTIVE'` and `business_date < currentBusinessDate − ORDER_RETENTION_DAYS` (default 7), in batches of 500, with the injected `Clock`. Audit events go with them (`ON DELETE CASCADE`). `order_day_counters` rows are kept, because they hold no customer data and they guarantee that a number is never reused. Only counts are logged. Backups follow the same 7-day window.
- **Alternatives:** Manual purge command (easy to forget); anonymizing the text but keeping rows (the owner asked for deletion); a database cron extension (extra moving part).
- **Consequences:** History covers today plus the previous 7 business days. Active orders are never purged, however old. There is still no delete endpoint or delete button. The oldest backup can contain orders up to 14 days old (7-day orders + 7-day backups).

### ADR-025 — Local-network deployment until a domain exists (SUPERSEDED by ADR-026)
- **Context:** Owner decision Q-05: no domain yet; "run on local link for now". HTTPS certificates need a domain.
- **Decision:** Add a third overlay, `docker-compose.lan.yml` (`RKDS_PROXY_OVERLAY=lan`), for the restaurant PC running Docker Desktop. It publishes only `web` on `${RKDS_HTTP_PORT:-8080}` on the PC's network interfaces. `db` and `server` stay unpublished. The owner uses `http://localhost:8080/owner` on the PC; kitchen screens on the same Wi-Fi use `http://<PC-LAN-IP>:8080/kitchen`. `APP_ORIGIN` accepts a comma-separated list, so both origins pass the Origin check. `RKDS_INSECURE_LOCAL=1` (plain HTTP, no `__Host-`/Secure cookie) is accepted only when **every** `APP_ORIGIN` entry is loopback or a private IPv4 address (10/8, 172.16/12, 192.168/16). `TRUST_PROXY=1` (only the web nginx is in front).
- **Alternatives:** VPS with a bare IP and self-signed certificate (browser warnings on every device, and the owner asked for local); a free tunnel domain (sends customer data through a third party).
- **Consequences (accepted until a domain exists):** traffic on the Wi-Fi is unencrypted, so the restaurant Wi-Fi must not be shared with customers (use a separate guest network). Browsers treat plain-HTTP LAN addresses as insecure, so the kitchen screen gets no Wake Lock (set the screen timeout to "never") and the clipboard Paste button works only on the PC itself at `localhost`; other devices paste manually. The PC must stay on, with Docker Desktop started, during service. Moving to the VPS later is a backup → restore plus the existing overlays A/B (DEPLOYMENT §2–9).

### ADR-026 — Production is an online web app on the Hostinger VPS; Netlify rejected
- **Context:** The owner withdrew the local Wi-Fi option (supersedes ADR-025) and asked for a proper online web app on Hostinger or Netlify.
- **Decision:** Deploy the whole stack (web + server + db) on the existing Hostinger KVM 2 VPS with Docker Compose behind its existing HTTPS proxy (ADR-019 overlays A/B). The app is same-origin (ADR-011) and installable as a web app (manifest + icons, NFR-12).
- **Why not Netlify:** Netlify serves static files and short-lived serverless/edge functions. It cannot keep a long-running Node process with Socket.IO connections open, and it has no place for our PostgreSQL. Running there would mean a third-party realtime service plus an external database (more cost, and customer order text sent to more third parties), or splitting the SPA (Netlify) from the API (VPS), which brings back cross-site cookies and CORS. The VPS is already paid for.
- **Consequences:** A domain or subdomain pointing at the VPS is still required for HTTPS before go-live (Q-05). Everything up to P12 is built and tested locally first. The LAN overlay, Windows Task Scheduler backup and private-IP HTTP exemption from ADR-025 are removed from the plan.

### ADR-027 — Menu ordering and kitchen notes (owner request, 2026-10-30; amends EX-03 and EX-06)
- **Context:** The owner asked to build orders by tapping items from the real 91 Degree menu with + / − buttons, alongside Paste / Type, and to add free-text kitchen notes to any order. EX-03 (no menu) and EX-06 (no item-by-item entry or price fields) excluded this; the owner's explicit request is the decision to lift them (Q-07).
- **Decision:**
  - The menu is a versioned, reviewed data file (`apps/server/src/modules/menu/91-degree-menu.json`) transcribed from the printed menu and validated at server startup. There is no menu-editing screen and no menu table: changes are a JSON edit plus a normal deploy (docs/MENU.md).
  - `POST /api/orders` accepts `kind: "MENU"` with `{ itemId, variantId, quantity }` lines. The server resolves them against the menu, rejects unknown or inactive lines with `409 MENU_ITEM_UNAVAILABLE`, writes the kitchen text itself ("2 × Zinger Burger") and stores a snapshot of each line (name, size, quantity, unit price) in `orders.items` (JSONB). A body without `kind` is a text order, so existing clients keep working.
  - Both kinds share one pipeline: the same daily numbering, idempotency (the request hash covers the lines and notes; a text order without notes hashes exactly as before), timers, transitions, history, retention and socket events.
  - Optional `notes` (max 500 characters, ADR-020 normalization, blank → NULL) on both kinds, shown in a separate gold "KITCHEN NOTES" block on the kitchen card.
- **Alternatives:** Order lines in a child table (rejected: they are never queried on their own, and every read, including the `UPDATE … RETURNING` transitions, would need a join or an extra query). A database-backed menu with an editing screen (rejected for now: the owner asked for minimal menu management; it can follow as its own change). Client-built kitchen text (rejected: the browser could send anything; the server must own what the kitchen sees).
- **Consequences:** Still not a POS (EX-01 stands): prices are only a reference subtotal on the owner screen, never on the kitchen screen, and there is no billing, tax or payment. Menu price changes need a deploy. Items unreadable on the 859 px images are listed for owner verification (MENU.md §4).

### ADR-028 — Louder ~3.5 s new-order alert with per-screen settings (supersedes the two-tone chime)
- **Context:** The owner asked for a clearly audible 3–4 s alert instead of the short chime, with volume, on/off and a test button.
- **Decision:** A Web Audio synthesized bell sequence (B5 → E6 pairs ×3 with a G6 lift, ~3.5 s, through a compressor), so there is no audio file to license. One alert per order id (duplicate socket events are ignored). Orders arriving during an alert produce exactly one follow-up. Volume is 10–100 % (default 80 %); on/off and volume are remembered per screen. Only live `order:created` triggers it, never snapshot loads or reconnects. The bell in the kitchen header opens the settings (on/off, volume, Test sound) and shows whether sound is really audible. Audio errors never affect orders or sockets.
- **Consequences:** Browsers still require one tap per page load to allow sound (the "Tap to enable sound" banner stays). The device's own volume also applies and cannot be raised by the page. Orders that arrive while a screen is disconnected appear on reconnect without an alert (unchanged behaviour).
