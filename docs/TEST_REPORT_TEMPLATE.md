# Test Report Template — 91 Degree RKDS

Copy this into `docs/reports/YYYY-MM-DD-<short-slug>.md`, fill it in, then copy the same content to `docs/reports/latest.md`. Never overwrite or delete older dated reports.

Write for a non-technical reader: short sentences, no huge logs. Put long diagnostics in `docs/reports/logs/YYYY-MM-DD-<slug>.txt` (git-ignored if they contain anything sensitive) and link to them.

Status words: **PASS** · **FAIL** · **BLOCKED** (could not run because of an external reason, which must be stated) · **NOT RUN** (not attempted, with the reason).

---

```markdown
# Report — <title>
Date: YYYY-MM-DD (Asia/Karachi) · Phase/step: <e.g. P5 Orders API> · Author: Claude Code

## 1. Summary
<2–4 sentences: what changed and why, in plain language.>

## 2. Important files changed
- `path/to/file.ts` — <one line>
- …

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| Types | `npm run typecheck` | PASS | |
| Lint/format | `npm run lint && npm run format:check` | PASS | |
| Unit | `npm run test:unit` | PASS (123 passed) | |
| Integration | `npm run test:integration` | BLOCKED | Docker not running |
| E2E | `npm run test:e2e` | NOT RUN | UI unchanged |
| Build | `npm run build` | PASS | |
| Compose config | `docker compose … config -q` | NOT RUN | no infra change |
| Migrations | `npm run db:migrate:check` | NOT RUN | no schema change |
| Security | `npm run check:security` | PASS / findings: … | |
| Manual checks | <item> | PASS | |

## 4. Coverage (from tool output only)
| Scope | Statements | Branches | Target | Met? |
|---|---|---|---|---|
| Backend + shared overall | xx.x% | xx.x% | ≥ 80% stmts | yes/no |
| orders module | | | ≥ 90% | |
| time module | | | ≥ 90% | |
<If coverage was not measured: "Coverage: NOT RUN — reason".>

## 5. Remaining bugs / limitations
- <issue> — impact — planned fix

## 6. Deployment impact
<None / requires rebuild / requires migration / downtime expectation.>

## 7. Database migrations / environment changes
- Migrations: <none | name + backward-compatible? + backup required>
- Env vars: <none | added/changed + update /opt/rkds/.env>

## 8. Skills and review
- Skills/tools actually used: <e.g. tdd, e2e-testing-patterns, /security-review>
- Independent reviews completed: <reviewer/agent + scope>
- Important findings resolved: <list>
- Unavailable capabilities that limited verification: <e.g. no VPS access — live deployment NOT RUN>

## 9. Next steps
1. …
```
