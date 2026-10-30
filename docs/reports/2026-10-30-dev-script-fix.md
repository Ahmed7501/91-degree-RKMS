# Report — Windows fixes: `npm run dev` hang, owner password prompt; local environment repair
Date: 2026-10-30 (Asia/Karachi) · Type: dev tooling fix (no app or contract change) · Author: Claude Code

Project status is unchanged. The full verification record is [2026-10-30-p12-release.md](2026-10-30-p12-release.md).

## 1. Problem
`npm run dev` started the web app, but the API server never started. It printed nothing, and every `/api` call failed with `ECONNREFUSED 127.0.0.1:3000`.

## 2. Cause
- `concurrently` gives each child process a stdin pipe that stays open.
- Under `tsx watch` (4.23.15), the server does not start while stdin is an open pipe.
- Reproduced in isolation:
  - `tsx watch` under `concurrently` hangs.
  - The same command with stdin closed starts, and so does plain `tsx` (no watch).
- This affects any terminal, not only automated runs.

## 3. Fix
In `apps/server/package.json`, the `dev` script changed from `tsx watch src/main.ts` to `node --watch --import tsx src/main.ts`. This uses Node 24's built-in watch mode with the tsx loader. The production build and `start` are unchanged.

## 4. Verification
| Check | Result |
|---|---|
| Full `npm run dev` | PASS: server logs "server listening", Vite ready |
| `GET /api/health/ready` through the Vite proxy | PASS: `{"status":"ok","db":"ok"}` |
| `/owner`, `/kitchen` | PASS: HTTP 200 |
| Auto-restart after editing a server file | PASS: "Restarting 'src/main.ts'", listening again |
| Typecheck, lint, unit tests, build | NOT RUN. Only a dev npm script changed; no source, config or dependency changes |

## 5. Local environment repairs (this PC, not the project)
- **Docker data moved to D:.** The WSL disk now lives at `D:\docker data\DockerDesktopWSL`. C: had filled up and corrupted Docker's state. Docker Desktop's built-in move fails on this PC: it treats robocopy exit code 1 ("copied") as an error. The move was done by hand: copied with Docker stopped, checksums matched, then `CustomWslDistroDir` was set. All containers and volumes are present.
  - The old copy at `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx` (16.3 GB) is kept until the owner confirms their other containers are fine.
- **Visual C++ runtime reinstalled.** `vcruntime140.dll`/`msvcp140.dll` were missing from System32, probably removed while freeing space on C:. Without them, `@node-rs/argon2` (password hashing) cannot load. It was reinstalled with `winget install Microsoft.VCRedist.2015+.x64`.

## 6. Owner CLI: hidden password prompt failed on Windows
- **Symptom (owner, PowerShell):** `npm run owner:create` failed with "Passwords do not match", and on a second try with "Password must be at least 12 characters".
- **Cause:** the hidden prompt (`apps/server/src/cli/prompt.ts`) ended on either `\r` or `\n`. A Windows terminal can deliver the `\n` of an Enter's `\r\n` after the previous prompt has finished. The next prompt then received an empty answer immediately.
- **Fix:** keystroke handling moved into the pure `applyHiddenKeys`. In raw mode only `\r` submits, and a lone `\n` is ignored.
- **Tests:** new `prompt.test.ts` (6 cases: stray newline, `\r\n` in one chunk, both backspace codes, Ctrl+C, pasted text).
- **Verification:** `prompt.test.ts` 6/6 PASS · `npm run typecheck` PASS · eslint and prettier on the changed files PASS · `npm run test:unit` 28 files / 294 tests PASS · `npm run build` PASS. An interactive run in the owner's PowerShell is pending: the owner runs `npm run owner:create` again.

## 7. Still open (unchanged from P12)
- Re-run `npm run test:e2e` and the prod-like Docker smoke run. They were not re-run after the P12 review fixes because Docker was down.
- Live VPS deployment needs a domain, the VPS inspection and the owner's approval.
