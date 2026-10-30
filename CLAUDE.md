# CLAUDE.md — 91 Degree RKDS

Restaurant Kitchen Display System for **91 Degree BBQ | Fast Food | Chinese**. The owner pastes or types complete order text at `/owner`. The server saves it in PostgreSQL, assigns a daily number, and starts a deadline timer. The order appears live on `/kitchen`, and the owner completes or cancels it. **Not a POS.**

## Status
Phase 2 (P0–P12) is implemented and verified locally (see `docs/reports/latest.md`). Owner decisions are in REQUIREMENTS §7. **Live VPS deployment is NOT done**: it needs a domain, the read-only VPS inspection (DEPLOYMENT §2) and the owner's separate approval. Changes now follow `docs/CHANGE_WORKFLOW.md`.

## Stack
npm workspaces · `apps/web` React 19 + Vite + TS + React Router + Tailwind v4 + lucide-react + motion · `apps/server` Node 24 + Express 5 + Socket.IO 4 + Zod + Prisma · `packages/shared` Zod contracts, error codes, pure time/text logic · PostgreSQL 17 · Docker Compose (project `rkds`) on the Hostinger VPS behind its existing proxy (ADR-026; Netlify rejected) · Vitest, Supertest, Playwright.

## Critical business rules (never break)
1. Report success to the owner and emit socket events **only after the DB commit**.
2. Order numbers come only from the DB counter in the create transaction (daily, Asia/Karachi business day, cutoff `BUSINESS_DAY_CUTOFF_HOUR`). Never generate them in the browser, never reuse them.
3. Every create carries an `Idempotency-Key`. Retries reuse the key. Same key with different payload → 422. The Paste button only fills the textarea; sending is always a separate click (Q-02).
4. Transitions are only `ACTIVE→COMPLETED|CANCELLED`, guarded in SQL by `WHERE status='ACTIVE'`. The UI never removes a card before the server confirms. No delete endpoint: closed orders are removed only by the retention job after `ORDER_RETENTION_DAYS` (7, ADR-024).
5. Timers derive from the stored `deadlineAt` + server clock offset, never from a browser counter.
6. Preserve the order text (ADR-020 normalization only). Render it as a React text node with `pre-wrap`. Never use `dangerouslySetInnerHTML`. **Never log order text.**
7. Kitchen is read-only. Only OWNER mutates. Sockets are broadcast-only.
8. No seed/demo data in production. No default passwords. Owners are created via the CLI only.
9. PostgreSQL is never exposed publicly. Secrets never go in Git or the frontend.
10. Excluded: POS, inventory, menu editing screens, billing, customers, payments, WhatsApp/Foodpanda APIs. Menu ordering with + / − and kitchen notes are allowed (ADR-027): menu prices are a reference only and never appear on the kitchen screen; the server, not the browser, resolves items and writes the kitchen text.

## Module ownership
`modules/orders` (create/number/idempotency/transitions/audit) · `modules/menu` (menu data + validation, ADR-027, `docs/MENU.md`) · `modules/auth` (sessions, passwords, guards) · `modules/kitchen-devices` (pairing) · `realtime/*` (socket auth/broadcast) · `http/middleware/*` (cross-cutting) · `web/realtime` (store + merge) · `web/features/owner|kitchen` (owner menu mode in `features/owner/menu`) · `web/lib/sound` (new-order alert, ADR-028). Map: `docs/FILE_STRUCTURE.md`.

## How to work (keep context small)
- Follow `docs/CHANGE_WORKFLOW.md`. Read `docs/INDEX.md` to pick **only** the relevant docs.
- Do **not** reread the whole repo for small changes. Inspect the target files, their direct imports/importers, and their tests (Grep for call sites).
- Contract changes (API, socket, DB, auth, numbering, timers, deployment) require reading the cross-cutting docs listed in CHANGE_WORKFLOW §2.
- If a request conflicts with the docs or the exclusions, explain the conflict and propose a resolution. Don't silently change behaviour.
- Update affected docs and tests in the same change. Write `docs/reports/YYYY-MM-DD-<slug>.md` and copy it to `docs/reports/latest.md`.

## Conventions
TypeScript strict. Zod at every boundary, with schemas from `@rkds/shared`. Services throw `AppError(code)` with codes from `@rkds/shared/errors`. One central error handler. Inject `Clock` for time. Raw SQL only via tagged `$queryRaw`. Files are kebab-case `.ts`, components PascalCase `.tsx`. Unit tests are colocated `*.test.ts(x)`; integration tests are `apps/server/tests/integration/*.int.test.ts`; E2E tests are `tests/e2e/*.spec.ts`.

## Errors
Envelope `{error:{code,message,requestId,details?}}`. Never leak stacks/SQL/paths/secrets. Keep owner text on any failure. Details: `docs/ERROR_HANDLING.md`.

## Testing (mandatory)
Gates G1–G10 in `docs/TESTING.md`. Minimum per change: typecheck, lint, unit tests, build. Plus integration/E2E per the `docs/REGRESSION_TESTING.md` matrix. Coverage: ≥ 80% backend logic, ≥ 90% orders + time modules (from tool output only). Integration/E2E use `rkds_test` only (guarded). **Never claim a test passed unless it ran and passed. Use BLOCKED / NOT RUN with a reason.**

## Database
Migrations live in `database/migrations`, are forward-only and backward-compatible (expand/contract), and need hand-written CHECKs with tests (no partial/expression indexes: Prisma drift). Back up before production migrations. Never run `prisma migrate reset` or other destructive Prisma commands; tests recreate the guarded `_test` schema with plain SQL (`tests/helpers/test-db.ts`).

## Deployment safety (shared VPS with n8n + Evolution API)
Always use `-p rkds`. Never prune, never `down -v`, never touch other stacks, never assume ports or the proxy (inspect first), never publish db/server ports. Details: `docs/DEPLOYMENT.md` §0.

## Commands (available after P0)
`npm run dev` · `npm run db:up` · `npm run db:migrate` · `npm run owner:create` · `npm run typecheck` · `npm run lint` · `npm run test:unit` · `npm run test:integration` · `npm run test:e2e` · `npm run test:coverage` · `npm run build` · `npm run verify` · `npm run verify:release`
