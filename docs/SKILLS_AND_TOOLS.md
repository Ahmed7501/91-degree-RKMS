# Skills and Tools — 91 Degree RKDS

This inventory was verified by inspecting the actual Claude Code environment on **2026-10-29** (skill list in the session, `~/.claude/skills/*/SKILL.md` headers, `~/.claude/settings.json`, CLI version checks). Re-verify it in a new environment, because skills and tools differ between machines.

## 1. Environment facts (verified)

| Item | Status |
|---|---|
| OS | Windows 11 Pro; shells: Git Bash + PowerShell |
| Node / npm / pnpm | v24.18.0 / 11.16.0 / 11.18.0 |
| Docker / Compose | 29.6.2 / v5.3.1 installed. Daemon running since 2026-10-29 (P0). The owner also runs an unrelated `postgres` container on host port 5432; RKDS never touches it and uses 55432 for dev |
| `psql` | Not installed locally (use `docker compose exec db psql`) |
| Git | 2.55. Repository initialised in P0 (branch `main`). No commits are made without the owner asking |
| Custom agents/commands dirs | `~/.claude/agents`, `~/.claude/commands`: none |
| Hooks | No user hooks besides enabled plugins (`claude-mem`, `remotion`) |
| VPS access | **None from this session.** No SSH configured or verified. All VPS work is NOT RUN until the owner provides access or runs commands |
| MCP | `claude-vscode` diagnostics available; `claude.ai n8n` requires authorization (not needed and not to be used); Claude Docs connector available (not used: project docs belong in the repo) |
| Subagent types | `general-purpose`, `Explore`, `Plan`, `claude`, `claude-code-guide` |
| Project tooling (pinned in `package.json`) | TypeScript 6.0.3 (typescript-eslint 8.72 supports < 6.1, so not TS 7), ESLint 10.13 + typescript-eslint 8.72.1 + react-hooks 7.1.1, Prettier 3.9.10, Vitest 5.0.5 + coverage-v8. Playwright and axe arrive in P10. These are project dependencies, not Claude tools |

## 2. Capability map by area

Only skills that appeared in this session's skill list are named. "Phase" refers to IMPLEMENTATION_PLAN.md steps.

### Architecture and planning
| Skill/tool | Purpose | Use in | Input → output |
|---|---|---|---|
| `writing-plans` / `executing-plans` | Turn specs into executable step plans; run them with checkpoints | P0 kickoff, each step | IMPLEMENTATION_PLAN → step checklist |
| `codebase-design` | Deep-module vocabulary, seams, testability | P1/P3/P5 module boundaries | module sketch → interface review |
| `domain-modeling` | Ubiquitous language, ADR discipline | DECISIONS updates | decision → ADR |
| `Plan` subagent | Independent architecture plan review | Optional before P5/P6 | docs → critique |
| `grilling` | Stress-test a plan with the owner | Optional, only if the owner wants it | plan → questions |

### UI/UX and frontend
| Skill | Purpose | Use in |
|---|---|---|
| `ui-ux-pro-max` | UX guidelines, palettes, typography, accessibility review | P7–P9 design review against DESIGN_SYSTEM |
| `ui-styling` | Tailwind tokens and accessible components | P7 tokens and primitives |
| `emil-design-eng` | Polish and interaction details | P8/P9 polish pass |
| `improve-animations` / `find-animation-opportunities` | Motion audit (read-only plans) | P9 after board animations. (`review-animations` exists in `~/.claude/skills` but was **not** in this session's skill list, so it is not relied on) |
| `frontend-testing-best-practices` | Behavioural component tests | P7–P9 tests |
| `run` | Launch the app and see the change working | P8/P9/P11 manual verification |
| Not used: `design`, `banner-design`, `brand`, `slides`, `design-system` (presentation focus), `apple-design` | Not needed for this product. Logo generation is forbidden (no invented logo) | — |

### Backend and database
| Skill | Purpose | Use in |
|---|---|---|
| `prisma-cli` | Prisma init/generate/migrate commands | P2, every schema change |
| `auth-implementation-patterns` | Session/RBAC patterns | P4 |
| Not used: `prisma-postgres`, `prisma-postgres-setup`, `netlify-database`, `supabase-server` | Managed DB/platforms are **excluded** by requirements | — |

### Security
| Skill/tool | Purpose | Use in |
|---|---|---|
| `security-review` | Review pending branch changes for vulnerabilities | P4, P5, P12 |
| `auth-implementation-patterns` | Auth design check | P4 |
| `npm audit` (CLI) | Dependency vulnerabilities | P12 (G10) |
| `git-guardrails-claude-code` | Hooks to block destructive git commands | P0 (optional, with owner approval) |

### Testing and QA
| Skill | Purpose | Use in |
|---|---|---|
| `tdd` / `test-driven-development` | Red-green-refactor | P1, P5, P7 store, every bug fix |
| `e2e-testing-patterns` | Playwright structure and flake avoidance | P10 |
| `verification-before-completion` | Evidence before claims | Every step's completion |
| `systematic-debugging` / `diagnosing-bugs` | Root-cause failures | Whenever a test fails unexpectedly |
| `qa` | Conversational bug intake → GitHub issues | Only if a GitHub repo exists and the owner wants issues |

### Review
| Skill/agent | Purpose | Use in |
|---|---|---|
| `requesting-code-review` / `receiving-code-review` | Structured review requests and rigorous handling of feedback | End of P5, P9, P12 |
| `code-review` | Standards + spec review of a branch (needs git) | P12 |
| `simplify` | Quality cleanup of changed code | After P9, before P12 |
| `general-purpose` subagent | Independent cross-document/consistency and security review | Phase 1 (done once, see §4) and P12 |
| `dispatching-parallel-agents` / `subagent-driven-development` | Parallel independent tasks | P12 reviews (architecture, security, UX, QA) only. Never concurrent edits to the same files |

### DevOps and deployment
| Tool | Purpose | Use in |
|---|---|---|
| Docker / Compose CLI | Build, `config -q` validation, prod-like local run | P11 |
| `scripts/vps-inspect.sh` (to be written) | Read-only VPS inventory | Deployment step 1 |
| `setup-pre-commit` | Husky + lint-staged | P0 (optional) |
| `finishing-a-development-branch` | Integration choices once work is complete | P12 (if git/GitHub is used) |
| No VPS/SSH tool is available to Claude | — | Live deployment is run by the owner, or with access they explicitly grant |

### Documentation and reporting
| Skill | Purpose | Use in |
|---|---|---|
| `humanizer` | Make reports plain and readable | Final report (optional) |
| `research` | Primary-source checks (e.g. current Prisma/Playwright APIs) | When a version-specific API is uncertain in P0/P2 |

## 3. Rules for capability use

1. Read a skill's SKILL.md before applying it. Skills never bypass the approval gate or the testing gates.
2. A skill's suggested plan or test is never a substitute for running the real tests.
3. No skill or agent receives production credentials or real customer order text.
4. Subagent findings are recommendations until they are checked against the code and the requirements. The primary agent integrates them, resolves conflicts, runs the tests and writes the reports.
5. Never install additional skills, MCP servers or global tools without the owner's approval and a demonstrated need.
6. **Fallbacks:** if a skill is unavailable, follow the corresponding doc in `docs/` directly (they are self-contained) and note the limitation in the report only if it affected verification.

## 4. Capability usage in Phase 1

| Used | How |
|---|---|
| Environment inspection (Bash) | Toolchain versions, skill directory headers, settings |
| One `general-purpose` subagent (completed) | Independent read-only cross-document consistency, correctness and security review of this package. It reported 36 findings; the primary agent checked each against the docs and applied fixes. Summary in [reports/2026-10-29-phase-1-planning.md](reports/2026-10-29-phase-1-planning.md) |
| Not used in Phase 1 | Design/testing/security skills. Their value is in implementation and review of real code, so they are mapped to Phase 2 steps above |
| Phase 2 (P2, P4) | `prisma-cli` (Prisma 7 config, `migrate diff`, no destructive commands) and `auth-implementation-patterns` (checklist) |
| Phase 2 (P12) | One `general-purpose` subagent: independent read-only security/correctness review of the code. 9 findings (1 high, 1 medium, 7 low), all checked against the code by the primary agent and fixed; see `reports/2026-10-30-p12-release.md` |

## 5. Limitations that affect verification

- **No VPS access:** proxy type, ports, resources and live HTTPS are unverified (DEPLOYMENT §11).
- **No git remote and no commits yet:** `code-review` needs a base commit. Commits are made only when the owner asks.
- **Brand assets:** menu images were added on 2026-10-29 (`docs/assets/brand-reference/`). The logo is cropped from them in P7.
