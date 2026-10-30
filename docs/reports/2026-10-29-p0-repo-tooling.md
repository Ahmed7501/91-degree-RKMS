# Report — Hosting decision update + P0 repository and tooling
Date: 2026-10-29 (Asia/Karachi) · Phase/step: Phase 2, P0 · Author: Claude Code

## 1. Summary
- **Owner decisions (second message):**
  - Do not run the system on the local Wi-Fi. Deploy it online on Hostinger or Netlify as a proper web app.
  - Menu images have been added.
  - Docker Desktop is now running.
  - I took "make a proper webapp of this system" as approval to start Phase 2.
- **Plan changes:**
  - ADR-025 (local network) is superseded by **ADR-026**: the whole stack runs on the Hostinger VPS.
  - Netlify was rejected because it can't run the Socket.IO server or host the database.
  - LAN-only items were removed from all documents.
  - New NFR-12: the app is installable on a phone or tablet home screen (manifest and icons).
  - The logo will be cropped from the menu images in P7.
- **P0 work:** set up the npm workspaces skeleton, strict TypeScript, ESLint with security bans, Prettier, the Vitest projects and coverage thresholds, the dev Postgres via Compose, the env template and a git repository (no commits).

## 2. Important files
- **Root:**
  - `package.json`: workspaces, all scripts, pinned devDependencies.
  - `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.dockerignore`, `.nvmrc`, `.env.example`, `vitest.config.ts`.
- **Workspaces:** `packages/shared`, `apps/server` and `apps/web`, each with `package.json`, `tsconfig.json` and a placeholder entry file.
- **Dev database:**
  - `docker-compose.dev.yml` (project `rkds-dev`, `postgres:17.11-alpine`, `127.0.0.1:55432`, volume `rkds_devdata`).
  - `database/init/01-create-test-db.sql` (non-superuser `rkds_app` owns `rkds_dev` and `rkds_test`).
- **Docs updated:**
  - DECISIONS (ADR-026), REQUIREMENTS (Q-05/Q-06, NFR-12), DEPLOYMENT, ENVIRONMENT_VARIABLES, BACKUP_AND_RECOVERY.
  - SECURITY, REALTIME_FLOW, API_CONTRACTS, ARCHITECTURE, FILE_STRUCTURE, IMPLEMENTATION_PLAN.
  - TESTING, UNIT_TESTING, TROUBLESHOOTING, PROJECT_PLAN, INDEX, SKILLS_AND_TOOLS, README, CLAUDE.md.

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| Clean install | `npm ci` | PASS | 0 vulnerabilities |
| G1 Typecheck | `npm run typecheck` | PASS | 3 workspaces |
| G2 Lint | `npm run lint` | PASS | 0 warnings |
| Format | `npx prettier --check .` | PASS | Markdown excluded by design |
| Lint bans work | eslint on a temporary probe file (deleted afterwards) | PASS | `dangerouslySetInnerHTML`, `$queryRawUnsafe` and server import of `tests/**` all reported as errors |
| Dev compose config | `docker compose -f docker-compose.dev.yml config -q` | PASS | |
| Dev DB | `npm run db:up` + psql checks | PASS | Healthy. `rkds_dev`/`rkds_test` owned by `rkds_app`. `rkds_app` has super/createdb/createrole = false and can create tables in `rkds_test`. Bound to 127.0.0.1 only |
| Owner's existing `postgres` container | `docker ps` | Unaffected | Still up on 5432. Never touched |
| Unit / integration / E2E / build | — | NOT RUN | No code or tests yet (P1+) |

## 4. Coverage
NOT RUN. There is no code yet.

## 5. Remaining limitations / open items
- **Version choices:**
  - TypeScript is pinned to 6.0.3 rather than 7.0, because typescript-eslint 8.72 supports only < 6.1.
  - `eslint-plugin-react` doesn't support ESLint 10, so the `dangerouslySetInnerHTML` ban uses `no-restricted-syntax`.
  - Prisma: npm's `latest` tag points to `8.0.0-rc.28`, a release candidate. P2 will pin the stable 7.10.1.
- **Scripts that don't work yet:** these refer to steps not built yet and will fail until then: `dev`, `build` (no build scripts yet), `db:migrate`, `owner:create`, `test:e2e`, `compose:check`, `check:security`.
- **No commits:** the git repository exists, but nothing has been committed.
- **Before go-live:** a domain or subdomain pointing at the VPS is needed (Q-05).

## 6. Deployment impact
None.

## 7. Database migrations / environment changes
- No migrations yet.
- `.env.example` created to match ENVIRONMENT_VARIABLES.md.
- Local dev DB credentials are throwaway values for the loopback-only container.

## 8. Skills and review
- **Used:** none. P0 is configuration, and I checked it with the tools themselves (see §3).
- **Subagents:** none.

## 9. Next steps
P1: shared contracts (`packages/shared`), written test-first. Then P2: database schema and migration with Prisma 7.10.1.
