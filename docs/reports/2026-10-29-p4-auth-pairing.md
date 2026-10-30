# Report — P4 Auth, sessions, kitchen pairing and owner CLI
Date: 2026-10-29 (Asia/Karachi) · Phase/step: Phase 2, P4 · Author: Claude Code

## 1. Summary
Owner sign-in, server-side sessions, kitchen-screen pairing and the owner CLI are built and tested:
- **Passwords:** Argon2id (m=19 MiB, t=2, p=1); unknown usernames are checked against a dummy hash so timing is equal.
- **Login lock:** after 5 failures per (username, IP) pair, held in memory.
- **Sessions:**
  - Rotation on login; sessions are stored only as SHA-256 hashes.
  - Owners: 7-day absolute and 24-hour idle expiry. Kitchen screens: 90 days and 14 days.
  - The last-seen time is written at most every 5 minutes.
  - Disabled owners lose their sessions.
- **Pairing codes:** 8 characters from a 31-character alphabet, valid 10 minutes, single use (atomic `UPDATE … RETURNING`), stored hashed.
- **Kitchen devices:** a list of active screens and per-screen revocation.
- **Rate limits:** login, pair and pairing-code limits.
- **Session cleanup:** at startup, then every 24 hours.
- **CLI:** `create-owner`, `reset-owner-password`, `list-owners`, `disable-owner`. Passwords are typed into a hidden prompt, never passed as arguments.

## 2. Important files
- **Auth module** (`apps/server/src/modules/auth/`): `password.ts`, `session.service.ts`, `auth.service.ts` (with `LoginLock`), `auth.routes.ts`, `cookies.ts`, `require-role.ts`.
- **Kitchen devices** (`modules/kitchen-devices/`): `pairing.service.ts`, `kitchen-devices.routes.ts`.
- **Maintenance:** `modules/maintenance/session-cleanup.ts`.
- **Wiring:** `services.ts`, plus changes to `app.ts` and `main.ts`.
- **CLI:** `cli/{prompt,cli-context,create-owner,reset-owner-password,list-owners,disable-owner}.ts`.
- **Tests:**
  - unit: `password.test.ts`, `session.service.test.ts` (session state, touch interval, DTO, `LoginLock`)
  - helpers: `tests/helpers/factories.ts`
  - integration: `{auth,pairing,cli,session-cleanup}.int.test.ts`, plus new cases in `rate-limit.int`
- **Docs:** SECURITY §7 (the lock is never scaled), FILE_STRUCTURE.

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| G1 Typecheck | `npm run typecheck` | PASS | |
| G2 Lint | `npm run lint` | PASS | |
| G3 Unit (server) | `npx vitest run --project server-unit` | PASS | 7 files, 65 tests |
| G4 Integration | `npx vitest run --project server-int` | PASS | 10 files, 85 tests |
| Build | `npm run build` | PASS | `dist/main.js` and `dist/cli/*.js` |
| Built CLI on dev DB | `node dist/cli/list-owners.js` | PASS | "No owners yet": the dev database has no default user |

Acceptance criteria and where each is verified:
| Criterion | Verified by |
|---|---|
| Cookie flags (HttpOnly, SameSite=Strict, Path=/, Max-Age) | `auth.int` |
| Identical 401 for a wrong password and an unknown user | `auth.int` |
| Lock for one (username, IP) pair doesn't block the same owner on another IP | `auth.int`, unit |
| Rotation, logout revocation, idle and absolute expiry, touch throttling | `auth.int` |
| Disabled owners lose access | `auth.int` |
| Pairing codes: single use, expiry, hashed storage, code never in logs | `pairing.int` |
| Device list and revocation | `pairing.int` |
| CLI hashes passwords, rejects duplicate, weak, common and mismatched passwords; reset/disable revoke sessions | `cli.int` |
| Cleanup deletes only sessions ended > 30 days ago and codes > 1 day old | `session-cleanup.int` |
| Login, pair and pairing-code limits trigger at multiplier 1 | `rate-limit.int` |
| No default user after migrating | `migrations.int` |

## 4. Coverage
NOT RUN for this step. G6 runs after P5, when the orders module exists.

## 5. Remaining limitations / open items
- **Bug found and fixed by the tests:** the test-only rate-limit multiplier also scaled the (username, IP) lock threshold. A test server would then have locked after 500 failures instead of 5. The lock is now never scaled, as documented in SECURITY §7. Production was never affected, since it always uses multiplier 1.
- **CLI and live sockets:** `disable-owner` and `reset-owner-password` revoke sessions in the database. Because the CLI runs outside the server process, connected sockets are dropped by the 60-second sweeper (P6), not instantly.
- **Login lock storage:** the lock is per process, in memory (ADR-013), and resets when the server restarts.
- **Argon2 enum:** `@node-rs/argon2`'s `Algorithm` is a const enum, so its numeric value is used (`2` = Argon2id). A unit test asserts the `$argon2id$` hash prefix.

## 6. Deployment impact
None.

## 7. Database migrations / environment changes
None. The existing tables are used.

## 8. Skills and review
- Used the `auth-implementation-patterns` skill as a checklist: hashed passwords, httpOnly/SameSite cookies, server-side revocable sessions, rate limiting, CSRF, and logging of security events. The plan already met each item.
- No subagents.

## 9. Next steps
P5: the orders API:
- repository with counter upsert, conditional transitions, keyset history and retention delete
- idempotency and transitions
- service, routes and audit events
- the order rate limit and the 7-day retention job
- integration suites for create, idempotency, numbering under concurrency, transitions, history, authorization and logging
