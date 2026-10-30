# Report — Preparation targets 15 and 30 minutes (Q-08)
Date: 2026-10-30 (Asia/Karachi) · Type: requirement change (owner decision Q-08) · Author: Claude Code

The previous report is [2026-10-30-menu-notes-alert.md](2026-10-30-menu-notes-alert.md) (P13).

## 1. Change
The owner's Target selector now offers **15, 20, 25 and 30 min**. 20 stays the default.

- **Shared:** `PREP_MINUTES = [15, 20, 25, 30]`, and the `PrepMinutes` schema is derived from it. The web selector reads the same constant.
- **Database:** migration `20261030140000_prep_minutes_15_30` widens `orders_prep_minutes_chk` to `IN (15, 20, 25, 30)`.
  - Only the CHECK changes; existing rows (20 or 25) stay valid.
  - The `deadline_at = created_at + prep_minutes` CHECK is unchanged.
  - Applied to `rkds_test` (G9 drift check: no drift) and to `rkds_dev` with `migrate deploy`.
- **Web:** a restored draft now accepts any valid target. Anything else falls back to 20.
- **Docs:** REQUIREMENTS (FR-OWN-04, Q-08), API_CONTRACTS, DATABASE, DESIGN_SYSTEM, UNIT_TESTING, FILE_STRUCTURE, README.

## 2. Tests
New cases:
- Schema accepts 15/20/25/30 and rejects 0/10/19/22/35/45.
- DB accepts 15 and 30 and rejects 35.
- API: 15 and 30 get the right deadlines; 35 → 400.
- A restored draft keeps 15/30 and falls back to 20 otherwise.
- The composer shows four options with 20 preselected and sends 30.

One existing case that asserted "30 is rejected" now uses 35. Under the new requirement 30 is valid; 35 checks the same rule.

`npm run verify:release` ran in this session and **exited 0**:

| Gate | Result |
|---|---|
| Typecheck, lint, build | PASS |
| Unit | PASS: 33 files, 390 tests |
| Integration (real PostgreSQL) | PASS: 23 files, 234 tests |
| Coverage (gates enforced) | PASS: 624 tests; `modules/orders` 98.18 % statements / 94.68 % branches |
| E2E (Chromium + Firefox/WebKit smoke) | PASS: 35 |
| Compose config, `npm audit`, bundle secrets | PASS (0 vulnerabilities) |
| Latency (reported) | median 109 ms, p95 134 ms |

## 3. Remaining
Unchanged from the P13 report:
- The owner verifies the menu (MENU.md §4).
- Create the owner account.
- Domain and approval for going live.
