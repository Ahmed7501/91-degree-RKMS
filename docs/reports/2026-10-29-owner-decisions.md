# Report — Owner decisions applied to the plan
Date: 2026-10-29 (Asia/Karachi) · Phase/step: Phase 1 (documentation only) · Author: Claude Code

## 1. Summary
The owner answered the six open questions. The planning documents now follow those answers. **No application code was written.** Phase 2 still needs the owner's explicit approval.

| Q | Owner's answer | What the plan now says |
|---|---|---|
| Q-01 | Open 5 pm – 3 am | The business day starts at **06:00**, so a whole evening shift, including after-midnight orders, uses one number sequence (FR-ORD-11, ADR-005) |
| Q-02 | Paste, review, then click Send | **Paste** only fills the box; **Send to Kitchen** is a separate click. Undo if a paste replaces text (FR-OWN-05/06) |
| Q-03 | "Do what's best" | The kitchen screen stays **view-only**; only the owner completes or cancels (ADR-021) |
| Q-04 | Delete after 1 week | Closed orders are **deleted automatically after 7 days** (hourly job); backups are kept 7 days too (FR-ORD-16, ADR-024) |
| Q-05 | No domain; run locally | Runs on the **restaurant PC** in Docker; kitchen screens connect over the staff Wi-Fi. The VPS comes later, once there is a domain (ADR-025, DEPLOYMENT §1b) |
| Q-06 | Take the logo from the menu | The menu image isn't in the project yet. Folder `docs/assets/brand-reference/` was created for it; the logo is cropped or traced from it, not redesigned |

## 2. Files changed
- `docs/REQUIREMENTS.md`: FR-OWN-05/06, FR-ORD-11, FR-ORD-15, new FR-ORD-16; §7 changed from open questions to decisions.
- `docs/DECISIONS.md`: ADR-005, -006 and -021 updated; new ADR-024 (retention purge) and ADR-025 (local-network deployment).
- `docs/DATABASE.md`, `docs/API_CONTRACTS.md`: purge SQL, history limited to the retention window, Origin list.
- `docs/ENVIRONMENT_VARIABLES.md`: cutoff default 6; new `ORDER_RETENTION_DAYS`, `RKDS_HOME`, `RKDS_BACKUP_DIR`; `APP_ORIGIN` can be a list; insecure-HTTP exemption widened to private LAN addresses; `.env.example` set up for the LAN.
- `docs/DEPLOYMENT.md`: new §1b (restaurant-PC steps, firewall, verification, later move to the VPS).
- `docs/BACKUP_AND_RECOVERY.md`: 7-day retention (keeps the newest 3), Windows Task Scheduler backup, `$RKDS_HOME`, VPS cron moved to 03:30 PKT.
- `docs/SECURITY.md`: Origin list; accepted risk and mitigations for plain HTTP on the staff Wi-Fi.
- Testing docs (`TESTING`, `UNIT_TESTING`, `INTEGRATION_TESTING`, `E2E_TESTING`): new `order-retention.int`, paste-never-sends cases, env rules for LAN origins, three-overlay compose check.
- `DESIGN_SYSTEM`, `ERROR_HANDLING`, `FILE_STRUCTURE`, `IMPLEMENTATION_PLAN`, `TROUBLESHOOTING` (new LAN section), `ARCHITECTURE`, `REALTIME_FLOW`, `PROJECT_PLAN`, `INDEX`, `README.md`, `CLAUDE.md`.
- New: `docs/assets/brand-reference/README.md`.

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| Code gates (types, lint, unit, integration, E2E, build, compose) | — | NOT RUN | No code exists yet |
| Relative Markdown links | node link check over all 31 `.md` files | PASS | 0 broken |
| ADR references defined | same script | PASS | ADR-001…025 all defined |
| Stale-term sweep | grep for old defaults ("Paste & Send", cutoff 4, 14-day, "both overlays") | PASS | Remaining hits are intentional (the Q-02 question text) |

## 4. Coverage
NOT RUN. There is no code.

## 5. Remaining limitations / open items
- **Explicit approval to start Phase 2 has not been given yet.**
- The menu image is still missing. The logo waits for it.
- **Accepted risk:** over plain HTTP on the Wi-Fi, someone on the same network could read traffic. Keep guests on a separate Wi-Fi (ADR-025).
- **Limits of plain HTTP on other devices:** the clipboard Paste button works only on the PC itself at `localhost`, and kitchen screens can't keep themselves awake. Phones paste manually, and the screen timeout must be set to "never".
- The PC must be on, with Docker Desktop running, during service. If the PC's disk fails, the backups on it are lost too, so a weekly USB copy is recommended.

## 6. Deployment impact
Nothing has been deployed. The target is now the restaurant PC (LAN). The VPS plan is unchanged and deferred.

## 7. Database migrations / environment changes
These are planned only; none exist yet:
- New variables: `ORDER_RETENTION_DAYS`, `RKDS_HOME`, `RKDS_BACKUP_DIR`.
- `BUSINESS_DAY_CUTOFF_HOUR` default is now 6.
- `APP_ORIGIN` accepts a list.

## 8. Skills and review
- Skills/tools used: none beyond file edits and local consistency scripts. No subagent was used, because the change applies the owner's answers to an already-reviewed plan.
- Unavailable capabilities: Docker daemon not checked again; no VPS access (not needed now).

## 9. Next steps
1. Owner replies **"approved"** (or asks for changes) to start Phase 2, step P0.
2. Owner puts the menu image in `docs/assets/brand-reference/` (any time before step P7).
3. Before integration tests: start Docker Desktop on this PC.
