# E2E Testing — 91 Degree RKDS

Playwright tests run against a locally started stack: server built from source, the test DB `rkds_test`, and the Vite **preview** build of the web app (production bundle). Chromium is the primary project. Firefox and WebKit run the owner smoke subset (`@smoke`).

Command: `npm run test:e2e` (`-- --project=chromium`, `-- --grep @smoke`, `-- --ui` for debugging).

## 1. Setup and fixtures (as implemented in P10)

- `playwright.config.ts` starts two `webServer`s, then runs the specs with **one worker** (the specs share one database):
  - `tests/e2e/start-server.mjs`: refuses any database not ending in `_test`; drops and recreates the `rkds_test` schema; runs `prisma migrate deploy`; creates the `e2e-owner` with the **built** CLI (`dist/cli/create-owner.js`, piped input); then runs the **built** server (`dist/main.js`, `NODE_ENV=test`, `RATE_LIMIT_MULTIPLIER=100`) on port 3100.
  - `vite preview` of the built web app on port 4173, proxying `/api` and `/socket.io` to port 3100 (`RKDS_API_TARGET`): same origin, like production.
- `npm run test:e2e` builds first (`npm run build && playwright test`).
- `tests/e2e/fixtures.ts`: `loginOwner`, `pairKitchen` (the owner issues a code in the UI and a second browser context pairs at 1920×1080), `sendOrder`, `clearOrders` (truncates orders between specs; users and sessions stay) and `insertBackdatedOrder` (an ACTIVE order created N minutes ago, for timer specs; real clocks, no fast-forward).
- The E2E owner password is a fixed test-only value: the database is the disposable `rkds_test`.
- **External stack mode:** `E2E_BASE_URL` points the run at an already running stack and starts no servers; `E2E_COMPOSE_ARGS` lets `clearOrders` truncate through `docker compose exec db`. This is used for the `@smoke` subset against the prod-like Docker run (DEPLOYMENT §1).
- **Not implemented:** an automated server-restart fixture. Restart safety is covered by `numbering.concurrency.int` (numbering survives a new client), `resilience.spec.ts` (offline → catch-up) and the prod-like run (services restarted during the restore drill with data intact).
- Clipboard permissions are granted only in `clipboard.spec.ts`.

## 2. Specs

| Spec | Scenario | Key assertions |
|---|---|---|
| `owner-to-kitchen.spec.ts` @smoke | Owner types a multi-line order (with Urdu + `<b>x</b>`) and sends | Owner sees "Order #001 sent"; textarea cleared; kitchen card #001 appears **without reload** within 2 s; text identical incl. line breaks; HTML shown literally; timer shows ~20:00 |
| | 3 orders | Kitchen order is oldest first; active count = 3 on both screens |
| | Sound | "Enable sound" control unlocks (AudioContext state `running`); preference survives reload, which shows the "Tap to enable sound" banner |
| `clipboard.spec.ts` | Paste with clipboard granted | Clipboard text appears in the textarea; **no request is sent** and no kitchen card appears; owner edits a line, clicks Send → edited text arrives on the kitchen |
| | Paste over existing text | Text replaced; Undo restores the previous text |
| | Clipboard denied | Textarea focused; paste hint shown; nothing sent |
| | Empty clipboard / whitespace | Textarea unchanged; Send stays disabled |
| `timer.spec.ts` | Backdated orders via `fixtures/db.ts` (real clocks, no fast-forward, which would trigger resyncs/ping timeouts and fight the clock-offset correction) | Order created 4:59 ago (20-min) shows ≈ 15:01 normal; created 15:01 ago shows ≈ 4:59 warning style; created 20:05 ago shows `+00:05` overdue style + "OVERDUE"; 25-min order created just now shows ≈ 25:00; a card crosses into overdue live (order created 19:57 ago, wait ≤ 5 s) |
| | Device clock skewed +10 min (`page.clock.setSystemTime` before load, Date only, timers not faked) | Timer still matches the server-derived remaining time (±2 s); clock-skew note visible |
| `lifecycle.spec.ts` @smoke | Complete (two-step) | Card leaves the kitchen with animation; history lists it as COMPLETED |
| | Cancel (dialog) | "Keep order" leaves it; "Cancel order" removes it; history shows CANCELLED |
| | Search | Search number 2 for today returns order #002 |
| `auth.spec.ts` | Unauthenticated `/owner` | Redirect to login; wrong password message; success lands on `/owner` |
| | Unpaired `/kitchen` | Pairing screen; invalid code message; valid code shows the board |
| | Kitchen cannot mutate | No complete/cancel controls; direct `fetch` POST from the kitchen context → 403 |
| | Logout | Owner logout → kitchen unaffected; owner socket disconnected; back button doesn't reveal data |
| | Revoke device | Owner revokes the kitchen → kitchen redirected to the pairing screen within 60 s |
| `resilience.spec.ts` | Refresh | Kitchen reload keeps the same cards and timers (±1 s) |
| | Server restart | `stack.restartServer()` → kitchen pill Reconnecting → Live; cards and timers intact; an order sent after restart appears |
| | Missed events | Kitchen offline (`context.setOffline(true)`), owner creates + completes orders, kitchen back online → board matches the server snapshot |
| | Submit during server down | Owner sends while the server is stopped → "Not confirmed — Retry", text kept → start server → Retry → exactly one order |
| | Double-click | Rapid double click on Send → exactly one order (checked via API) |
| `menu-and-notes.spec.ts` @smoke (first test) | Owner: Menu tab → Burgers → + + Zinger, search "masala" → + Large, notes on two lines, Send | Summary "(3 items)" and "Rs 1,120"; "#001 sent"; summary and notes cleared; kitchen card lists "2×Zinger Burger", "1×Masala Fries Large" and a KITCHEN NOTES block with the line break; no prices on the kitchen; notes still there after a kitchen reload |
| | Text order with notes, then one without | Notes only on the right card; owner active list shows the notes once |
| | Unsent menu selection + typed text, then reload | Both survive the reload and mode switches |
| | Kitchen sound settings (ADR-028) | Bell opens the dialog; "Turn sound on" → "Sound is on"; volume 50 %; Test sound shows no blocked message; bell reads "Sound on" |
| `latency.spec.ts` | 20 sequential orders | Measures click → kitchen card visible. Reports median and p95 in the test output (copied to the report). Fails only if p95 > 2 s on the local stack. The 1 s target is reported, not gated |

## 3. Stability rules

- Use role/label locators (`getByRole`, `getByLabel`). Add `data-testid` only for cards (`order-card-<displayNumber>`).
- No fixed sleeps. Use `expect.poll` or locator auto-waiting.
- Each test gets a fresh DB state. The fixture truncates tables directly through the test DB connection. The server exposes **no** test-only endpoints.
- Traces, screenshots and videos are kept on failure only (`retain-on-failure`). `retries: 1` locally, and any flaky pass is recorded in the report as a flake to fix.
- Reduced-motion project variant: one run of `owner-to-kitchen` with `reducedMotion: 'reduce'`.

## 4. Visual and accessibility checks

- `@axe-core/playwright` scan on `/owner/login`, `/owner`, `/kitchen/pair`, `/kitchen` (empty and populated). Serious/critical violations fail the test.
- Screenshot review (not pixel-diff gating) at 1920×1080 (kitchen) and 390×844 / 1440×900 (owner), attached to the release report for human review.
