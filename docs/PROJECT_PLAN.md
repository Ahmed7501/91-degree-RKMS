# Project Plan — 91 Degree RKDS

## 1. Goal

Replace verbal and paper order handover with a reliable kitchen screen. The owner pastes any incoming order once, the kitchen sees it instantly with a countdown, and nothing gets lost or duplicated. It runs as an online web app on the owner's existing Hostinger VPS at no extra hosting cost (a domain is the only new purchase, if none exists).

## 2. Success measures

| Measure | Target |
|---|---|
| Time from paste to kitchen card | < 1 s on a normal connection |
| Owner effort per order | Paste, glance at the text, 1 click Send (optionally choose source/target) |
| Lost or duplicated orders | Zero (enforced by persistence-before-success + idempotency) |
| Kitchen readability | Number, timer and full text readable at 2–3 m on a 1080p TV |
| Additional monthly cost | None beyond a domain (existing VPS, free TLS) |

## 3. Scope

In scope and out of scope: see [REQUIREMENTS.md](REQUIREMENTS.md) §2 (exclusions) and §4 (functional requirements).

Added on 2026-10-30 at the owner's request (Q-07, step P13): menu ordering with + / − next to Paste / Type, kitchen notes on every order, and a louder ~3.5 s kitchen alert with settings (ADR-027, ADR-028). It is still not a POS.

## 4. Phases and approval gates

| Phase | Content | Exit gate |
|---|---|---|
| **1 — Planning (current)** | This documentation package. No application code | **Owner approval of the documents + answers to open questions** |
| 2 — Implementation | Steps P0–P11 in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), each with tests and a report | All step acceptance criteria verified |
| 3 — Verification and release prep | P12: full gates, coverage, security review, independent review, final report | Owner reviews the final report |
| 4 — Live deployment (separate approval) | Domain → VPS inspection → overlay choice → deploy → verify → backup cron | Owner confirms the smoke test on the real kitchen screen |

## 5. Roles

| Who | Responsibility |
|---|---|
| Owner | Approves the plan, answers open questions, provides the domain/logo, runs or authorizes VPS commands, does acceptance testing in the restaurant |
| Claude Code (primary agent) | Design, implementation, tests, reports, integration of any reviewer findings |
| Subagents (optional) | Independent reviews and parallel analysis, scoped and read-mostly |

## 6. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Disturbing n8n / Evolution API during deployment | Medium | High | Read-only inspection first; separate compose project; no prune/down -v; proxy reload only after a config test (DEPLOYMENT §0) |
| Unknown reverse-proxy setup | High | Medium | Two overlays; decide from inspection output |
| Clipboard API differences across browsers | High | Low | Explicit-click read with Ctrl+V fallback (FR-OWN-06) |
| Kitchen TV browser quirks (autoplay, sleep) | Medium | Medium | Explicit sound unlock; Wake Lock; recommend a Chromium-based browser and disabling TV power saving |
| Flaky restaurant Wi-Fi/4G | High | High | Idempotent retries, deadline-based timers, resync on reconnect, visible connection state |
| VPS resource pressure | Low | Medium | Memory limits, small images, log rotation |
| Data loss | Low | High | Daily dumps, pre-update dumps, restore drills, recommended off-server copy |
| Late-night day boundary confusion | Medium | Low | Cutoff 06:00 (Q-01) + "Yesterday" badge |

## 7. Assumptions

1. A single restaurant and a single location, with one or two kitchen screens and one or a few owner logins.
2. Volume is well below 1,000 orders per day.
3. The kitchen screen runs a current Chromium-based browser (TV browser, mini-PC or Android TV box).
4. The VPS runs Docker with Compose v2+ (to be confirmed by inspection).
5. The owner will create a DNS record (A record) for an RKDS subdomain.
6. English UI. Pasted order text may contain Urdu, Roman Urdu and emoji, and is displayed as-is.

## 8. Open questions

All six were answered by the owner on 2026-10-29 (see [REQUIREMENTS.md](REQUIREMENTS.md) §7). Q-05 was later changed to an online Hostinger deployment (ADR-026), which needs a domain before go-live.
