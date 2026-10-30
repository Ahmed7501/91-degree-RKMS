# Report — P1 Shared contracts (`packages/shared`)
Date: 2026-10-29 (Asia/Karachi) · Phase/step: Phase 2, P1 · Author: Claude Code

## 1. Summary
The shared package that server and web will both use is finished:
- constants
- Zod request and response schemas (orders, auth, kitchen pairing, socket events, error envelope)
- the error-code catalog with user-facing messages
- business-day and retention-date logic (06:00 cutoff, Asia/Karachi)
- the timer state function
- Karachi clock formatting
- order-text normalization (ADR-020)

Tests were written in the same step as the code; this was not strict red-green TDD.

## 2. Important files
- `packages/shared/src/`:
  - `constants.ts`, `index.ts`
  - `schemas/{common,order,auth,kitchen,socket}.ts`
  - `errors/{codes,messages}.ts`
  - `time/{business-date,timer,format}.ts`
  - `text/normalize-order-text.ts`
- Tests: `time/{timer,business-date,format}.test.ts`, `text/normalize-order-text.test.ts`, `schemas/{order,socket,kitchen}.test.ts`, `errors/codes.test.ts`.
- `vitest.config.ts`: forces `TZ=UTC` for tests.
- `package.json`: `test:coverage` now runs all projects (see §5).
- `docs/TESTING.md`: coverage note.

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| G1 Typecheck | `npm run typecheck` | PASS | |
| G2 Lint | `npm run lint` | PASS | 0 warnings |
| Format | `npx prettier --check .` | PASS | |
| G3 Unit | `npm run test:unit` | PASS | 8 files, 130 tests |
| G6 Coverage (shared) | `npm run test:coverage` | PASS | Statements 100% (117/117), branches 100% (36/36), functions 100% (20/20), lines 100% (115/115) |

## 4. Coverage
Copied from the tool output:
- Shared package: statements 100%, branches 100%, functions 100%, lines 100%.
- The time module target was ≥ 90%; it is fully covered.

## 5. Remaining limitations / open items
- **Coverage tool problem found and fixed:** with Vitest 5.0.5, adding `--project` to a coverage run makes the coverage globs match no files. The report then shows `Unknown% (0/0)`, and the run still exits 0, so the 80%/90% thresholds pass silently.
  - **Fix:** `test:coverage` now runs every project, which means the dev database must be up.
  - **Documented in:** `docs/TESTING.md`.
- **Pairing codes:** the format is checked by the server, so any malformed code returns `PAIRING_CODE_INVALID` rather than a validation error. Both share one helper (`isWellFormedPairingCode`).

## 6. Deployment impact
None.

## 7. Database migrations / environment changes
None.

## 8. Skills and review
No skills or subagents were used. The checks are the tests and gates listed above.

## 9. Next steps
P2: Prisma 7.10.1 schema and the first migration, including the hand-written CHECK constraints, the test-DB guard, and the `migrations.int` and `schema-constraints.int` suites.
