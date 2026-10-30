# Change Workflow — 91 Degree RKDS

This is the mandatory procedure for every change after Phase 1. Its purpose is correct, tested and documented changes **without rereading the whole project**.

## 1. The 14 steps

1. **Read `CLAUDE.md`** (always loaded).
2. **Read `docs/INDEX.md`** and find the task type.
3. **Identify the feature and owning module** using [FILE_STRUCTURE.md](FILE_STRUCTURE.md) §2 and [ARCHITECTURE.md](ARCHITECTURE.md) §3.
4. **Read only the relevant docs** (INDEX.md tells you which).
5. **Inspect the relevant source files, their direct imports/importers, and their tests.** Use Grep/Glob for call sites. Do not open unrelated modules.
6. **Identify contract changes and regression risks.** Does this touch an API schema, a socket payload, the DB schema, auth, numbering, timers or deployment? If yes, read the cross-cutting docs (§2).
7. **Add or update tests first** where practical (a failing test for bugs).
8. **Implement the smallest suitable change.** No drive-by refactors, and no regenerating architecture for a UI tweak.
9. **Run targeted tests.**
10. **Run the regression set** from the [REGRESSION_TESTING.md](REGRESSION_TESTING.md) matrix.
11. **Run typecheck, lint and build** as applicable.
12. **Update affected docs** (the doc owning the changed behaviour + FILE_STRUCTURE if files moved + DECISIONS if a decision changed).
13. **Review the final diff** for unrelated edits, debug output, secrets, order text in logs, and `dangerouslySetInnerHTML`.
14. **Write the short report** (`docs/reports/YYYY-MM-DD-<slug>.md` + `latest.md`) using [TEST_REPORT_TEMPLATE.md](TEST_REPORT_TEMPLATE.md).

## 2. Cross-cutting triggers

| If the change touches… | Also read | Also update |
|---|---|---|
| DB schema / migrations | DATABASE, DEPLOYMENT §8, BACKUP_AND_RECOVERY | DATABASE, migration + `migrations.int` |
| API request/response shape | API_CONTRACTS, ERROR_HANDLING | API_CONTRACTS, shared schemas, both apps |
| Auth, sessions, roles, headers | SECURITY | SECURITY, `authorization.int` |
| Order numbering / business day | DATABASE §4, DECISIONS ADR-004/005 | Same + `numbering.concurrency.int` |
| Socket events / sync logic | REALTIME_FLOW | REALTIME_FLOW, `order-store.test` |
| Timers | ARCHITECTURE §7, DESIGN_SYSTEM | `timer.test`, `timer.spec` |
| Docker / compose / nginx / env | DEPLOYMENT, ENVIRONMENT_VARIABLES, SECURITY §9 | Same docs + `.env.example` |
| Visual design | DESIGN_SYSTEM | DESIGN_SYSTEM if tokens/components change |
| Menu data or menu ordering | MENU, DECISIONS ADR-027 | MENU (bump `menuVersion`; update the checklist and `menu-catalog.test` counts) |

## 3. Size guide

| Change type | Typical reading | Typical gates |
|---|---|---|
| Copy/text or colour tweak | DESIGN_SYSTEM section + the component + its test | G1, G2, G3, G7 |
| New UI behaviour | DESIGN_SYSTEM + the feature folder + the store/hooks it uses | G1–G3, G7, related E2E |
| New/changed endpoint | API_CONTRACTS, ERROR_HANDLING, SECURITY §3, the module | G1–G4, authorization test, related E2E |
| Schema change | DATABASE, DEPLOYMENT §8–9 | Full (`verify:release`) |
| Dependency bump | DECISIONS (if major) | Full + `npm audit` |

## 4. Conflicts and scope

- If a request conflicts with documented behaviour or an exclusion (REQUIREMENTS §2), **stop and explain the conflict**, propose a resolution, and wait for a decision. Never silently change established behaviour.
- Record decisions in DECISIONS.md as a new ADR (supersede, do not rewrite).

## 5. Honesty rules

- Never claim a test passed unless it ran in this session and the output showed it passing.
- If a gate cannot run, the report says **BLOCKED** or **NOT RUN** and why.
- Never invent coverage numbers, deployment results or infrastructure details.
