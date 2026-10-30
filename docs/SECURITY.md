# Security — 91 Degree RKDS

Threat model: a small, internet-reachable web app. The valuable assets are customer order text (names, phones, addresses), the owner account, and the integrity of the order queue. It shares a VPS with n8n and Evolution API, which must not be weakened.

Related: [DECISIONS.md](DECISIONS.md) ADR-007/008/011/012/014 · [API_CONTRACTS.md](API_CONTRACTS.md) §4 access matrix · [DEPLOYMENT.md](DEPLOYMENT.md)

## 1. Authentication

| Item | Design |
|---|---|
| Owner accounts | Created only via CLI inside the server container (`create-owner`). No sign-up endpoint, no default user, no default password |
| Password policy | ≥ 12 chars, ≤ 200, checked against a small embedded list of the most common passwords. No composition rules |
| Hashing | Argon2id (`@node-rs/argon2`), m=19 MiB, t=2, p=1. Rehash on login if the parameters change |
| Login timing | Unknown users are verified against a dummy hash, giving equal timing and a single generic error |
| Brute force | 10 attempts / 15 min / IP, and 5 consecutive failures per **(username, IP)** pair → 15 min lock for that pair (in-memory, ADR-013). Keying on the pair means an anonymous attacker cannot lock the real owner out from another network. Combined with Argon2id cost and the ≥ 12-char password rule, that makes online guessing impractical |
| Disabled owners | Session resolution joins `users` and rejects sessions whose user has `disabled_at` set. `disable-owner` and `reset-owner-password` also revoke all of that user's sessions and disconnect their sockets |
| Kitchen | One-time pairing code from an owner (8 chars from a 31-char alphabet ≈ 8.5×10¹¹ combinations, 10 min TTL, single use, SHA-256 hashed, 10 attempts / 15 min / IP) |
| CLI | `create-owner`, `reset-owner-password`, `list-owners`, `disable-owner`. Passwords are entered via a hidden TTY prompt, never as command arguments (shell history) |

## 2. Sessions

- Token: 32 bytes from `crypto.randomBytes`, base64url in the cookie. The DB stores only the hex SHA-256 → a DB leak does not grant sessions.
- Cookie: production name `__Host-rkds_sid` (forces Secure, Path=/, no Domain). Flags: `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `Path=/`, `Max-Age` = absolute TTL.
- Idle time counts any request from the device, including the owner screen's background resync, so an open owner panel stays signed in until the 7-day absolute limit; the 24 h idle limit ends sessions of devices that were closed.
- TTLs: OWNER 7 d absolute / 24 h idle; KITCHEN 90 d absolute / 14 d idle (env-configurable, see ENVIRONMENT_VARIABLES.md).
- Login rotates the session (any presented session is revoked). Logout revokes server-side and disconnects sockets.
- Revocation is immediate for HTTP (checked on every request) and reaches sockets within 60 s (sweeper), or immediately for logout/revoke.

## 3. Authorization

- `requireRole(...)` guards on every route. See the access matrix in API_CONTRACTS.md §4.
- Kitchen is read-only: only `GET /api/orders/active` and the socket `orders` room.
- Socket: handshake auth plus the sweeper. No client→server events exist (ADR-009).
- Coverage: the table-driven `authorization.int.test.ts` hits every route with anonymous, KITCHEN and OWNER sessions.

## 4. CSRF and CORS

- Same-origin deployment (ADR-011), so CORS middleware is **not installed**. Cross-origin browsers cannot read responses.
- CSRF:
  1. `SameSite=Strict` cookie.
  2. `Origin` must equal `APP_ORIGIN` on POST/PUT/PATCH/DELETE (missing Origin → reject).
  3. Request bodies must be `application/json`, which blocks HTML form posts.
- Socket.IO `allowRequest` rejects a **present but foreign** Origin. A missing Origin is allowed, because browsers omit it on same-origin GET polling. Cross-site browser requests always send Origin, and every socket still needs a valid session cookie (`SameSite=Strict`, so it is never sent cross-site).

## 5. Input validation and output safety

- All inputs are validated with strict Zod schemas (unknown keys rejected) at the HTTP boundary. Parsed values are stored on `res.locals.input` (Express 5's `req.query` is a read-only getter). Handlers read only the parsed values, never raw `req.query`/`req.body`.
- Text normalization per ADR-020. `\u0000` is stripped before it reaches PostgreSQL.
- `express.json({ limit: '32kb' })`. URL-encoded parsing is not enabled.
- SQL: Prisma parameterizes everything. Raw SQL uses only tagged templates (`$queryRaw\`…${x}\``), never `$queryRawUnsafe` (enforced by an ESLint `no-restricted-properties` rule).
- Output: order text is rendered only as React text children with `white-space: pre-wrap`. `dangerouslySetInnerHTML` is banned by ESLint (`no-restricted-syntax` in `eslint.config.js`; `eslint-plugin-react` does not support ESLint 10). No markdown rendering, no auto-linking.
- `dir="auto"` on order text handles mixed English/Urdu safely. Bidi control characters are preserved as data and cannot execute.
- Menu orders (ADR-027): the client sends only item ids, size ids and quantities. The server resolves them against the validated menu and writes the kitchen text and prices itself, so a client cannot inject text or prices through a menu order (strict schemas reject extra keys). Kitchen notes are validated like order text (max 500) and rendered the same way (React text, `pre-wrap`). Notes and item names are never logged; the create log line carries only `kind`, a line count and `hasNotes`.
- `GET /api/menu` is owner-only (the kitchen never sees prices).

## 6. HTTP security headers

**Server (helmet), API responses:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`, and a deny-all `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (API responses are JSON only). HSTS is left to the HTTPS proxy. `x-powered-by` is disabled.

**Web nginx, HTML/static:**
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Permissions-Policy: clipboard-read=(self), clipboard-write=(self), screen-wake-lock=(self), fullscreen=(self), camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   (only if the owner confirms every subdomain is HTTPS; otherwise omit includeSubDomains)
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```
If a library needs inline styles in markup, verify it in Phase 2 and add `'unsafe-inline'` to `style-src` only with a DECISIONS.md entry. (React/motion set styles through the CSSOM, which CSP does not block.)

## 7. Rate limits (express-rate-limit, memory store)

| Scope | Limit |
|---|---|
| `POST /api/auth/login` | 10 / 15 min / IP + (username, IP) lock after 5 failures |
| `POST /api/kitchen/pair` | 10 / 15 min / IP |
| `POST /api/kitchen/pairing-codes` | 10 / h / owner |
| `POST /api/orders` | 30 / min / session |
| All `/api/*` | 600 / 5 min / IP |

`app.set('trust proxy', TRUST_PROXY)` with an exact hop count (2 in prod: host proxy → web nginx). Never `true`, so that `X-Forwarded-For` cannot be spoofed.

Limits are defined in one config object passed to the app factory. `RATE_LIMIT_MULTIPLIER` (default 1) scales every throughput limit for the integration/E2E servers (never the 5-failure (username, IP) login lock, which is a security threshold), which create many sessions and orders legitimately. **The server refuses to start in `production` with a multiplier ≠ 1.** `rate-limit.int` always runs with multiplier 1.

## 8. Secrets and configuration

- Secrets live in `/opt/rkds/.env` on the VPS (`chmod 600`, owned by the deploy user), and are never committed. `.env.example` contains placeholders only.
- The frontend bundle contains **no** environment secrets. `apps/web` uses no `VITE_*` secret variables. A CI-able check (`npm run check:bundle-secrets`) greps `dist/` for `DATABASE_URL`, `POSTGRES_PASSWORD` and `postgresql://`.
- Env is validated at startup with Zod. Error output lists variable **names** only.
- **Least-privilege DB role.** In the official postgres image, `POSTGRES_USER` is a superuser, and a superuser app connection would allow e.g. `COPY … PROGRAM` (code execution in the db container). So:
  - `POSTGRES_USER` (superuser, e.g. `rkds_admin`) is used **only** for admin work via `docker compose exec db` (backups, restores, drills).
  - The init script `database/init-prod/10-create-app-role.sh` runs on first volume initialization and creates `rkds_app` (`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`) as **owner of the `rkds` database**. As DB owner it can run migrations (DDL) inside that database only.
  - `migrate` and `server` connect as `rkds_app` (`DATABASE_URL`). Passwords are separate: `POSTGRES_PASSWORD` and `RKDS_DB_APP_PASSWORD`, each generated with `openssl rand -base64 32 | tr -d '/+='`.
  - Verified by `migrations.int` against a local container initialized the same way (`select rolsuper from pg_roles where rolname = current_user` → false).

## 9. Infrastructure isolation

- PostgreSQL: no `ports:`, reachable only on `rkds_internal`.
- `server`: no `ports:`. `web`: no `ports:` in the base file. Exposure only through the chosen overlay (Traefik network, or `127.0.0.1` bind).
- Containers run as non-root (`node` user, nginx-unprivileged uid 101), `read_only: true` root filesystem where possible with `tmpfs` for `/tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`.
- Images: pinned versions. Base images are rebuilt on updates. `npm audit --omit=dev` is part of the release gates.
- The RKDS stack never touches other compose projects, networks or volumes (DEPLOYMENT.md §Safety rules).

## 10. HTTPS

TLS terminates at the existing host reverse proxy (Traefik ACME or nginx + certbot, whichever exists) with a free Let's Encrypt certificate. HTTP redirects to HTTPS at that proxy. Clipboard read and Wake Lock require a secure context, and so does the `__Host-` cookie. Local development uses `localhost`, which counts as a secure context.

**Local-network deployment (ADR-025, until a domain exists):** plain HTTP on the staff Wi-Fi with `RKDS_INSECURE_LOCAL=1`, accepted only for loopback/private-IPv4 origins. Accepted risk: someone on the same Wi-Fi could read traffic, including session cookies. Mitigations: kitchen devices and the PC on the staff Wi-Fi only (guests on a separate network), WPA2/WPA3 password, firewall rule limited to the Private profile, only `web` published, owner sessions still expire (24 h idle). Moving to the VPS with a domain removes this risk.

## 11. Privacy

- Order text is never logged. The primary control is a code rule: **never pass request bodies, `OrderDto`s or order rows to the logger**. Log only explicit fields (`orderId`, `orderNumber`). Pino redaction of explicit paths is a second line of defence, and `logging.int` checks both.
- Draft text in the owner's `localStorage` is removed on successful send and on logout.
- No third-party analytics, fonts or CDNs at runtime.

## 12. Security testing

| Check | How | Phase |
|---|---|---|
| Access matrix | `authorization.int.test.ts` | P5 |
| CSRF (missing/foreign Origin, form content-type) | `security.int.test.ts` | P3 |
| Session: expiry, idle, revoke, rotation, cookie flags | `auth.int.test.ts`, `session.service.test.ts` | P4 |
| Socket auth: no cookie, revoked, foreign Origin | `socket.auth.int.test.ts` | P6 |
| XSS: `<script>`, `<img onerror>` in order text render as literal text | `KitchenOrderCard.test.tsx`, E2E `owner-to-kitchen.spec.ts` | P8/P9/P10 |
| SQL injection strings stored verbatim | `orders.create.int.test.ts` | P5 |
| Rate limits | `rate-limit.int.test.ts` | P3 |
| Headers/CSP | `curl -I` checks in the release checklist + E2E: no CSP violations logged | P11 |
| Dependencies | `npm audit --omit=dev` (report results; do not hide findings) | P12 |
| Secret leakage | `check:bundle-secrets`, `git grep` for secrets | P12 |
| Review | `/security-review` skill on the branch | P12 |
