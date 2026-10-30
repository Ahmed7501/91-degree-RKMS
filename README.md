# 91 Degree RKDS

**Restaurant Kitchen Display System** for *91 Degree BBQ | Fast Food | Chinese*.

The owner pastes an order from WhatsApp, Foodpanda or a phone call, **or picks items from the 91 Degree menu with + / −**, adds optional kitchen notes, and presses **Send**. The kitchen screen shows it instantly with a large order number, the complete order text and a 15-, 20-, 25- or 30-minute countdown. The owner marks the order completed or cancelled. History is kept for 7 days, then deleted automatically.

> **Project status:** built and verified locally (steps P0–P12; see [docs/reports/latest.md](docs/reports/latest.md)). Not yet deployed: going live needs a domain pointing at the VPS and the owner's go-ahead.

## What it is and isn't

| ✅ It does | ❌ It does not |
|---|---|
| Store the full pasted order text, unchanged | POS, billing, payments, inventory, menu editing, customers |
| Assign daily order numbers (001, 002, …) on the server | Import from WhatsApp/Foodpanda automatically |
| Show live countdown/overdue timers on a kitchen TV | Show prices to the kitchen or produce a bill (menu prices are an owner-side reference only) |
| Build orders from the real menu with + / −, plus kitchen notes on any order ([docs/MENU.md](docs/MENU.md)) | |
| Play a clear ~3.5 s alert per new order, with volume and test settings | |
| Prevent duplicate orders on retries | Ship demo data or default passwords |

## Architecture at a glance

React (Vite) SPA → nginx (`web`) → Node/Express + Socket.IO (`server`) → PostgreSQL (`db`), all in one Docker Compose project `rkds`. It runs online on the Hostinger VPS behind its existing HTTPS proxy, and can be installed to a phone or tablet home screen. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (local development)

Requirements: Node 24, Docker Desktop (running).

```bash
npm ci
cp .env.example .env  # then use the "Local development only" block at the bottom of .env
npm run db:up          # local Postgres on 127.0.0.1:55432
npm run db:migrate
npm run owner:create   # create your owner login (interactive)
npm run dev            # http://localhost:5173/owner  and  /kitchen
```

Checks: `npm run verify` (types, lint, unit, integration, build) · `npm run test:e2e` (Playwright; first time: `npx playwright install chromium firefox webkit`) · `npm run test:coverage`.

Owner accounts are created only with the CLI (`npm run owner:create` locally, `node dist/cli/create-owner.js` in the server container). Kitchen screens are paired from **Owner → Settings → Kitchen screens**.

## Production

Deployed to the existing Hostinger VPS **without touching n8n or Evolution API**. Start with the read-only inspection in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Backups: [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md).

## Documentation

Everything is indexed in [docs/INDEX.md](docs/INDEX.md). Contributors (human or Claude Code) follow [docs/CHANGE_WORKFLOW.md](docs/CHANGE_WORKFLOW.md). The latest verification report is [docs/reports/latest.md](docs/reports/latest.md).
