# Regression Testing — 91 Degree RKDS

Run regression testing after **every** feature, bug fix, refactor, dependency update, migration or deployment-config change. A change that looks small is not a reason to skip it.

## 1. Procedure

1. **Identify impact.** List the files changed and look up their areas in the matrix below.
2. **Add/update tests.** For a bug, first write a test that fails on the old code. Name it `regression: <short description>` and put a `// Regression: <report file or date>` comment on it.
3. **Run targeted tests:** `npx vitest run <paths>` / `npx playwright test <spec>`.
4. **Run the area's regression set** (matrix).
5. **Run broader gates** when the matrix says "full", or when more than one area is touched.
6. **Review the diff:** `git diff` (unintended changes, debug code, secrets, order-text logging).
7. **Update the docs** listed for the area.
8. **Write the report** ([TEST_REPORT_TEMPLATE.md](TEST_REPORT_TEMPLATE.md)) with real results.

## 2. Impact matrix

| Area changed | Must run | Docs to check |
|---|---|---|
| `packages/shared/time/*` | shared unit, web `use-now`/`TimerBadge`, E2E `timer.spec` | ARCHITECTURE §7, DESIGN_SYSTEM timer |
| `packages/shared/schemas/*` or `errors/*` | **full** (contracts affect both apps) | API_CONTRACTS, ERROR_HANDLING |
| `packages/shared/text/*` | shared unit, `orders.create.int`, E2E `owner-to-kitchen` | DECISIONS ADR-020 |
| `modules/orders/*` | server unit, all `orders.*.int`, `idempotency.int`, `numbering.concurrency.int`, `socket.events.int`, coverage (≥ 90%), E2E `lifecycle` + `owner-to-kitchen` | DATABASE, API_CONTRACTS |
| `modules/auth/*`, `kitchen-devices/*` | server unit, `auth.int`, `authorization.int`, `pairing.int`, `socket.auth.int`, E2E `auth.spec` | SECURITY |
| `http/middleware/*` | server unit, `errors.int`, `security.int`, `rate-limit.int`, `logging.int` | ERROR_HANDLING, SECURITY |
| `realtime/*` (server) | `socket.*.int`, E2E `resilience` | REALTIME_FLOW |
| `apps/web/src/realtime/*` | web unit (`order-store` ≥ 90%), E2E `resilience` + `owner-to-kitchen` | REALTIME_FLOW |
| `features/owner/*` | web unit, E2E `owner-to-kitchen`, `clipboard`, `lifecycle`, `menu-and-notes`, axe | DESIGN_SYSTEM, ERROR_HANDLING §6 |
| `modules/menu/*` or the menu JSON | server unit (`menu-catalog.test` validates the real file), `orders.menu.int`, `authorization.int`, E2E `menu-and-notes` | MENU.md, ADR-027 |
| `lib/sound.ts`, `features/kitchen/SoundSettings.tsx` | web unit (`sound.test`), E2E `menu-and-notes` (sound settings) | REALTIME_FLOW §6, ADR-028 |
| `features/kitchen/*`, `components/*` | web unit, E2E `owner-to-kitchen`, `timer`, axe, screenshot review | DESIGN_SYSTEM |
| `styles/tokens.css` | web unit, axe, screenshot review | DESIGN_SYSTEM |
| `database/schema.prisma` / migrations | G9 migration check, `migrations.int`, `schema-constraints.int`, **full** | DATABASE, DEPLOYMENT §8 |
| Dependencies (`package.json`/lockfile) | **full** + `npm audit --omit=dev` + build | DECISIONS (if major) |
| Dockerfiles, compose, nginx | G8 compose config, prod-like local run + health checks, E2E smoke against it | DEPLOYMENT, SECURITY §6/9 |
| `config/env.ts` | `env.test.ts`, integration, prod-like run | ENVIRONMENT_VARIABLES |
| Backup/restore scripts | Local drill: backup → verify → restore into a scratch DB | BACKUP_AND_RECOVERY |

"Full" = `npm run verify:release`.

## 3. Release regression checklist (manual, prod-like stack)

Record each item as PASS/FAIL/NOT RUN in the report.
- [ ] Send → kitchen card appears; numbers continue after a container restart.
- [ ] Kitchen reload: timers unchanged.
- [ ] Stop `db` → owner error with text kept → start `db` → retry → one order.
- [ ] Complete + cancel → kitchen removes the card; history correct.
- [ ] Logout; kitchen revoke.
- [ ] CSP: no violations in the browser console on owner and kitchen.
- [ ] 1920×1080 kitchen screenshot reviewed; mobile owner screenshot reviewed.
- [ ] Backup + verify script on the local stack.

## 4. Flaky tests

A flaky test is a bug. Record it in the report, quarantine it only with an owner-visible note, and fix it before the next release. Never delete a failing test to make a run green.
