# Documentation Index — 91 Degree RKDS

Start here, then read **only** the docs your task needs. Workflow: [CHANGE_WORKFLOW.md](CHANGE_WORKFLOW.md).

## By task

| I need to… | Read | Then check tests in |
|---|---|---|
| Understand the product and scope | [REQUIREMENTS.md](REQUIREMENTS.md), [PROJECT_PLAN.md](PROJECT_PLAN.md) | — |
| Find where code lives / which module owns it | [FILE_STRUCTURE.md](FILE_STRUCTURE.md), [ARCHITECTURE.md](ARCHITECTURE.md) §3 | the file's colocated test |
| Change the owner or kitchen UI | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), feature folder | [UNIT_TESTING.md](UNIT_TESTING.md) web, [E2E_TESTING.md](E2E_TESTING.md) |
| Add/change an endpoint | [API_CONTRACTS.md](API_CONTRACTS.md), [ERROR_HANDLING.md](ERROR_HANDLING.md), [SECURITY.md](SECURITY.md) §3 | [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md) |
| Change order creation, numbering, idempotency, statuses | [DATABASE.md](DATABASE.md) §3–4, [DECISIONS.md](DECISIONS.md) ADR-004/005/006 | `orders.*.int`, `numbering.concurrency.int`, `idempotency.int` |
| Change the menu (prices, items) or menu ordering | [MENU.md](MENU.md), [DECISIONS.md](DECISIONS.md) ADR-027 | `menu-catalog.test`, `orders.menu.int`, `menu-and-notes.spec` |
| Change the kitchen alert sound | [REALTIME_FLOW.md](REALTIME_FLOW.md) §6, ADR-028 | `sound.test`, `menu-and-notes.spec` |
| Change timers | [ARCHITECTURE.md](ARCHITECTURE.md) §7, [REALTIME_FLOW.md](REALTIME_FLOW.md) §5 | `timer.test`, `timer.spec` |
| Change real-time sync | [REALTIME_FLOW.md](REALTIME_FLOW.md) | `order-store.test`, `socket.*.int`, `resilience.spec` |
| Change the DB schema | [DATABASE.md](DATABASE.md) §5, [DEPLOYMENT.md](DEPLOYMENT.md) §8 | `migrations.int`, `schema-constraints.int` |
| Change auth, sessions, pairing, headers | [SECURITY.md](SECURITY.md) | `auth.int`, `authorization.int`, `pairing.int` |
| Handle a new error case | [ERROR_HANDLING.md](ERROR_HANDLING.md) | `error-handler.test`, `errors.int` |
| Add/change an env var | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | `env.test` |
| Deploy, update, roll back | [DEPLOYMENT.md](DEPLOYMENT.md) | release checklist in [REGRESSION_TESTING.md](REGRESSION_TESTING.md) §3 |
| Back up / restore | [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | restore drill |
| Diagnose a problem | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | — |
| Know why something was decided | [DECISIONS.md](DECISIONS.md) | — |
| Plan the next build step | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | its step gates |
| Choose skills/agents/tools | [SKILLS_AND_TOOLS.md](SKILLS_AND_TOOLS.md) | — |
| Decide what to test after a change | [REGRESSION_TESTING.md](REGRESSION_TESTING.md) §2 matrix, [TESTING.md](TESTING.md) §3 gates | — |
| Write the report | [TEST_REPORT_TEMPLATE.md](TEST_REPORT_TEMPLATE.md), [reports/README.md](reports/README.md) | — |

## All documents

| Doc | One-line purpose |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Goals, phases, approval gates, risks, assumptions |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Functional and non-functional requirements with IDs, exclusions, open questions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data flows, auth boundaries, lifecycle, invariants |
| [FILE_STRUCTURE.md](FILE_STRUCTURE.md) | Planned tree, and per-file purpose/deps/docs/tests |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Palette, type, layout, components, states, motion, accessibility |
| [DATABASE.md](DATABASE.md) | Schema, constraints, indexes, numbering, transactions, migrations, retention |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Every endpoint with auth, schemas, errors, side effects, tests |
| [REALTIME_FLOW.md](REALTIME_FLOW.md) | Socket auth, events, client state machine, merge, clock sync |
| [ERROR_HANDLING.md](ERROR_HANDLING.md) | Error codes, middleware, frontend handling, scenario playbook |
| [SECURITY.md](SECURITY.md) | Auth, sessions, CSRF, headers, rate limits, secrets, isolation, security tests |
| [TESTING.md](TESTING.md) | Strategy, tools, coverage targets, quality gates, traceability |
| [UNIT_TESTING.md](UNIT_TESTING.md) | Required unit tests per file |
| [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md) | Harness and required integration suites |
| [E2E_TESTING.md](E2E_TESTING.md) | Playwright stack fixture and specs |
| [REGRESSION_TESTING.md](REGRESSION_TESTING.md) | Procedure, impact matrix, release checklist |
| [TEST_REPORT_TEMPLATE.md](TEST_REPORT_TEMPLATE.md) | Report format (incl. skills and review section) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Local dev, VPS inspection, overlays, deploy, update, rollback |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | Every variable, defaults, rules |
| [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | Backups, drills, restore, rebuild |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Ordered steps P0–P12 with acceptance criteria and gates |
| [DECISIONS.md](DECISIONS.md) | ADR-001…028 |
| [MENU.md](MENU.md) | The digital menu: source, data file, how to change it, owner verification checklist |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptoms → causes → fixes |
| [CHANGE_WORKFLOW.md](CHANGE_WORKFLOW.md) | The mandatory 14-step change procedure |
| [SKILLS_AND_TOOLS.md](SKILLS_AND_TOOLS.md) | Verified skills/tools/agents and when to use them |
| [reports/README.md](reports/README.md) | Report conventions; `reports/latest.md` is the newest report |
