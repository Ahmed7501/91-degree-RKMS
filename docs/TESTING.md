# Testing Strategy — 91 Degree RKDS

Testing is a gate, not a phase. No feature is "done" until its applicable checks below have actually run and passed. Anything that could not run is reported as **BLOCKED** or **NOT RUN** with the reason.

Detailed guides: [UNIT_TESTING.md](UNIT_TESTING.md) · [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md) · [E2E_TESTING.md](E2E_TESTING.md) · [REGRESSION_TESTING.md](REGRESSION_TESTING.md) · [TEST_REPORT_TEMPLATE.md](TEST_REPORT_TEMPLATE.md)

## 1. Test pyramid and tools

| Level | Scope | Tools | Location | Command |
|---|---|---|---|---|
| Unit | Pure logic, components, hooks, middleware in isolation | Vitest, @testing-library/react, jsdom, fake timers | `**/*.test.ts(x)` next to source | `npm run test:unit` |
| Integration | HTTP + DB + sockets with a real PostgreSQL | Vitest, Supertest, socket.io-client, `rkds_test` DB | `apps/server/tests/integration/*.int.test.ts` | `npm run test:integration` |
| E2E | Browser workflows across owner + kitchen | Playwright (Chromium primary; Firefox + WebKit owner smoke) | `tests/e2e/*.spec.ts` | `npm run test:e2e` |
| Regression | Impact-based selection + bug-specific tests | All of the above | see REGRESSION_TESTING.md | `npm run test:regression` (= unit + integration + E2E smoke tag) |
| Static | Types, lint, format | tsc, ESLint, Prettier | — | `npm run typecheck`, `npm run lint`, `npm run format:check` |
| Build | Production bundles and images | Vite, tsc, Docker | — | `npm run build`, `docker compose … config -q`, `docker compose … build` |
| Security | Access matrix, CSRF, XSS, deps, secrets | Integration tests, `npm audit`, bundle secret scan, `/security-review` | — | `npm run check:security` |

## 2. Coverage targets (measured with `@vitest/coverage-v8`)

| Scope | Metric | Target | Enforced by |
|---|---|---|---|
| Backend business logic (`apps/server/src/**`, excl. `main.ts`, `cli/prompt.ts`) + `packages/shared/src/**` | statements | ≥ 80% | global threshold |
| `apps/server/src/modules/orders/**` (creation, numbering, idempotency, transitions) | statements + branches | ≥ 90% | glob threshold |
| `packages/shared/src/time/**` (timer, business date) | statements + branches | ≥ 90% | glob threshold |
| `apps/web/src/realtime/order-store.ts`, `features/owner/use-submit-order.ts` | statements | ≥ 90% | glob threshold |
| Other web UI | statements | tracked, no gate | report only |

Coverage is merged from unit + integration runs (`npm run test:coverage` runs **all** Vitest projects, so the dev DB must be up). Never add `--project` to a coverage run: with Vitest 5.0.5 the `coverage.include` globs then match no files, the report shows `Unknown% (0/0)` and the thresholds pass silently. Only numbers printed by the tool go into reports. **No percentage is ever estimated.**

Justified exclusions (listed in `vitest.config.ts` with comments): `main.ts` bootstrap (covered by E2E), `cli/**` (the scripts run as child processes in `cli.int`, so in-process coverage cannot see them), generated Prisma client, `index.ts` re-export files, `apps/web/src/main.tsx`.

## 3. Quality gates

| Gate | Command | Required before |
|---|---|---|
| G1 Types | `npm run typecheck` | every change |
| G2 Lint/format | `npm run lint && npm run format:check` | every change |
| G3 Unit | `npm run test:unit` | every change |
| G4 Integration | `npm run test:integration` | server/DB/realtime/contract changes; every release |
| G5 E2E | `npm run test:e2e` | user-facing workflow changes; every release |
| G6 Coverage | `npm run test:coverage` | every release; changes to orders/time modules |
| G7 Build | `npm run build` | every change merged |
| G8 Compose | `npm run compose:check`: runs `docker compose --env-file .env.compose-check -f docker-compose.yml -f docker-compose.proxy-<overlay>.yml config -q` for **both** overlays (`traefik`, `host`), plus `docker compose -f docker-compose.dev.yml config -q` | infra changes; every release |
| G9 Migrations | `npm run db:migrate:check` (deploy to a fresh `rkds_test`, then `prisma migrate diff` shows no drift) | schema changes; every release |
| G10 Security | `npm run check:security` (`npm audit --omit=dev` + bundle secret scan) + `/security-review` | auth/security changes; every release |

`npm run verify` = G1 + G2 + G3 + G4 + G7. `npm run verify:release` = all gates.

## 4. Environment prerequisites

- Node 24 (`.nvmrc`).
- Docker Desktop **running** for G4, G5, G8, G9. During Phase 1 it was installed but not running, so those gates would have been BLOCKED.
- Playwright browsers: `npx playwright install chromium firefox webkit`.
- Tests never use `rkds_dev` or production. The harness aborts unless the DB name ends with `_test`.

## 5. Determinism rules

- Server time comes from the injectable `Clock`, and tests use `fixedClock`.
- Web unit tests use `vi.useFakeTimers()` + `vi.setSystemTime()`. E2E uses Playwright `page.clock`.
- No `sleep`-based waits. Wait on events, responses or locators.
- Each integration test file truncates its tables in `beforeEach` (fast `TRUNCATE … RESTART IDENTITY CASCADE`). Files run serially against the single test DB (`fileParallelism: false` for the integration project).
- Random values (UUIDs, codes) are asserted by format, not value.

## 6. Requirement traceability

| Requirement | Unit | Integration | E2E |
|---|---|---|---|
| FR-OWN-01/11 header (brand, Karachi clock, pill, count, logout) | `OwnerHeader.test.tsx` | — | `owner-to-kitchen.spec.ts` |
| FR-OWN-03/04 source + target selectors, remembered source | `OrderComposer.test.tsx` | `orders.create.int` (stored values) | `owner-to-kitchen.spec.ts` |
| FR-OWN-05/06 Paste-then-review, clipboard fallback | `clipboard.test.ts`, `OrderComposer.test.tsx` | — | `clipboard.spec.ts` |
| FR-OWN-07/08/09/16 submission safety | `use-submit-order.test.ts`, `normalize-order-text.test.ts` | `orders.create.int`, `idempotency.int` | `owner-to-kitchen.spec.ts`, `resilience.spec.ts` |
| FR-OWN-12/13 history/search | — | `orders.history.int` | `lifecycle.spec.ts` |
| FR-OWN-14 complete/cancel UX | `ActiveOrdersList.test.tsx` | `orders.transitions.int` | `lifecycle.spec.ts` |
| FR-OWN-15 / FR-AUTH-04/05 pairing | — | `pairing.int` | `auth.spec.ts` |
| FR-KIT-01/09/11/12 header, full-screen, wake lock, cursor hide, density | `KitchenHeader.test.tsx`, `wake-lock.test.ts`, `KitchenPage.test.tsx` | — | `owner-to-kitchen.spec.ts` (header visible) |
| FR-KIT-07/08 read-only, pairing screen | — | `authorization.int` | `auth.spec.ts` |
| FR-KIT-10 Yesterday badge | `KitchenOrderCard.test.tsx` | — | — |
| FR-KIT-02/03/04 ordering, full text | `OrderBoard.test.tsx`, `KitchenOrderCard.test.tsx` | `orders.active.int` | `owner-to-kitchen.spec.ts` |
| FR-KIT-05/06 animation, alert sound (ADR-028) | `sound.test.ts` | — | `menu-and-notes.spec.ts` (sound settings) |
| FR-KIT-13/14 menu lines, kitchen notes on the card | `KitchenOrderCard.test.tsx` | `socket.events.int` (payload) | `menu-and-notes.spec.ts` |
| FR-MENU-01–06 menu ordering | `cart.test.ts`, `OrderComposer.menu.test.tsx`, `use-submit-order.test.ts`, `menu-catalog.test.ts`, `menu.test.ts`, `order.test.ts` | `orders.menu.int`, `authorization.int`, `schema-constraints.int`, `migrations.upgrade.int` | `menu-and-notes.spec.ts` |
| FR-NOTE-01/02 kitchen notes | `order.test.ts`, `use-submit-order.test.ts`, `OrderComposer.menu.test.tsx` | `orders.menu.int`, `schema-constraints.int` | `menu-and-notes.spec.ts` |
| FR-ORD-04/05 transitions | `transitions.test.ts` | `orders.transitions.int` | `lifecycle.spec.ts` |
| FR-ORD-06–09 timers | `timer.test.ts`, `use-now.test.ts`, `clock-sync.test.ts` | — | `timer.spec.ts`, `resilience.spec.ts` |
| FR-ORD-10/11/12 numbering | `business-date.test.ts`, `format.test.ts` | `numbering.concurrency.int` | — |
| FR-ORD-14 audit | — | `orders.transitions.int` (incl. `GET /api/orders/:id` events) | — |
| FR-ORD-15 no delete endpoint | — | `authorization.int` (`DELETE /api/orders/:id` → 404 ROUTE_NOT_FOUND for every role) | — |
| FR-ORD-16 7-day retention purge | `business-date.test.ts` (retention date) | `order-retention.int` | — |
| FR-AUTH-05 list/revoke screens | — | `pairing.int` (`GET /api/kitchen/devices`, revoke) | `auth.spec.ts` |
| FR-RT-01–05 realtime | `order-store.test.ts` | `socket.auth.int`, `socket.events.int` | `resilience.spec.ts` |
| FR-AUTH-01–03 auth | `password.test.ts`, `session.service.test.ts` | `auth.int`, `authorization.int`, `cli.int` | `auth.spec.ts` |
| NFR-01 no lost orders | — | `idempotency.int`, `health.int` | `resilience.spec.ts` |
| NFR-02 latency | — | — | `latency.spec.ts` (median/p95 of 20 orders, reported) |
| NFR-03 security (rate limits, headers, DB role) | — | `rate-limit.int`, `security.int`, `migrations.int` (app role not superuser) | — |
| NFR-06 footprint | — | — | P11 manual: `docker stats --no-stream` on the prod-like stack, recorded in the report |
| Maintenance: session/pairing cleanup | — | `session-cleanup.int` | — |
| NFR-10 no order text in logs | `logger.test.ts` | `logging.int` (captures logs during create) | — |
| NFR-11 empty production | — | `migrations.int` (fresh deploy has 0 rows) | — |

## 7. Skills used for testing

`tdd` / `test-driven-development` (red-green on orders, time and store modules), `e2e-testing-patterns` (Playwright structure, flake avoidance), `frontend-testing-best-practices` (behavioural component tests), `verification-before-completion` (evidence before claims), `systematic-debugging` (failures). See [SKILLS_AND_TOOLS.md](SKILLS_AND_TOOLS.md).
