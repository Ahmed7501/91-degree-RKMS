# Reports

Short, plain-language records of what changed and what was **actually** verified.

## Conventions

- One report per meaningful change or implementation step: `YYYY-MM-DD-<short-slug>.md` (Asia/Karachi date). Add `-2`, `-3` for several reports on one day.
- `latest.md` is always a copy of the newest report, so the owner can open one file to see the current state.
- Never delete or rewrite old reports. If a report was wrong, add a new one that corrects it.
- Format: [../TEST_REPORT_TEMPLATE.md](../TEST_REPORT_TEMPLATE.md). Results use PASS / FAIL / BLOCKED / NOT RUN only.
- Long logs go in `logs/` (create it when needed) and are linked from the report, never pasted in full. Logs must not contain secrets or order text.
- Coverage numbers are copied from tool output only.

## Index

| Date | Report | Summary |
|---|---|---|
| 2026-10-29 | [2026-10-29-phase-1-planning.md](2026-10-29-phase-1-planning.md) | Phase 1 documentation package; no code, no tests run |
| 2026-10-29 | [2026-10-29-owner-decisions.md](2026-10-29-owner-decisions.md) | Owner answers Q-01…Q-06 applied (06:00 cutoff, paste-then-send, 7-day retention, restaurant-PC LAN deployment, logo from menu); no code |
| 2026-10-29 | [2026-10-29-p0-repo-tooling.md](2026-10-29-p0-repo-tooling.md) | Hosting back to Hostinger VPS (ADR-026, Netlify rejected); P0 skeleton, tooling, dev DB; typecheck/lint PASS |
| 2026-10-29 | [2026-10-29-p1-shared-contracts.md](2026-10-29-p1-shared-contracts.md) | Shared schemas, errors, time/text logic; 130 unit tests PASS; shared coverage 100% |
| 2026-10-29 | [2026-10-29-p2-database.md](2026-10-29-p2-database.md) | Prisma 7.10.1 schema + init migration with 15 CHECKs; 28 integration tests PASS; drift check PASS (negative control fails as expected) |
| 2026-10-29 | [2026-10-29-p3-server-foundation.md](2026-10-29-p3-server-foundation.md) | Express 5 foundation, middleware chain, errors, health, build; 173 unit + 47 integration tests PASS |
| 2026-10-29 | [2026-10-29-p4-auth-pairing.md](2026-10-29-p4-auth-pairing.md) | Argon2id auth, sessions, pairing, CLI, cleanup; 65 server unit + 85 integration tests PASS; fixed lock-scaling bug |
| 2026-10-29 | [2026-10-29-p5-orders-api.md](2026-10-29-p5-orders-api.md) | Orders API, idempotency, numbering, transitions, retention; 384 tests PASS; orders coverage 99.3%/96.1% |
| 2026-10-29 | [2026-10-29-p6-realtime.md](2026-10-29-p6-realtime.md) | Socket.IO handshake auth, broadcast after commit, revocation + sweeper; 401 tests PASS |
| 2026-10-30 | [2026-10-30-p7-p10-web-and-e2e.md](2026-10-30-p7-p10-web-and-e2e.md) | Web app (owner + kitchen), 75 web unit tests, 23 Chromium E2E PASS; latency p95 203 ms; 2 UI bugs found and fixed |
| 2026-10-30 | [2026-10-30-p11-docker-ops.md](2026-10-30-p11-docker-ops.md) | Docker images, prod compose + overlays, ops scripts; prod-like run healthy; backup/verify/restore drill PASS; smoke on 3 engines |
| 2026-10-30 | [2026-10-30-p12-release.md](2026-10-30-p12-release.md) | Release verification: 482 tests + 29 E2E PASS, audit clean, independent review (1 high, 1 medium, 7 low) all fixed; Docker Desktop fault blocks final container re-run |
| 2026-10-30 | [2026-10-30-dev-script-fix.md](2026-10-30-dev-script-fix.md) | `npm run dev` server hang fixed (node --watch); owner:create hidden-prompt fix (Windows \r\n); Docker data moved to D:; VC++ runtime reinstalled |
| 2026-10-30 | [2026-10-30-menu-notes-alert.md](2026-10-30-menu-notes-alert.md) | P13: menu ordering (12 categories / 88 items), kitchen notes, ~3.5 s alert; migration 20261030120000; verify:release PASS (383 unit, 228 int, 35 E2E) |
| 2026-10-30 | [2026-10-30-prep-targets-15-30.md](2026-10-30-prep-targets-15-30.md) | Q-08: prep targets 15/20/25/30 min; migration 20261030140000; verify:release PASS (390 unit, 234 int, 35 E2E) |
