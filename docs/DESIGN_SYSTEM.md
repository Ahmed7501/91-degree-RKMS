# Design System — 91 Degree RKDS

Visual identity: black, red, white and gold, taken from the 91 Degree menu boards (reference images are **not yet in the repo**; place them in `docs/assets/brand-reference/`). The UI is a dark operational tool, polished but not decorative.

Principles:
1. **Speed over ceremony.** On the owner screen, the textarea and the Send button own the screen.
2. **Read from across the kitchen.** On the kitchen display, the number, the timer and the text are large, with high contrast.
3. **Colour means state.** Red, amber and green are reserved for status, so brand red never means "overdue".
4. **Calm motion.** Animation explains change (arrive/leave) and never decorates.

Tokens live in `apps/web/src/styles/tokens.css` as CSS variables and are exposed to Tailwind v4 via `@theme`.

## 1. Colour

### Brand palette (fixed)
| Token | Hex | Use |
|---|---|---|
| `--c-red` | `#B5121B` | Primary buttons, brand accents, selected segment |
| `--c-red-deep` | `#8F0D16` | Primary hover/pressed, header accent bar |
| `--c-bg` | `#111111` | App background |
| `--c-surface` | `#1C1C1C` | Cards, panels, inputs |
| `--c-white` | `#FFFFFF` | Primary text |
| `--c-gold` | `#F5C542` | Brand "91°", focus ring, NEW highlight, key numerals on owner side |
| `--c-text-muted` | `#A7A7A7` | Secondary text, labels, metadata |
| `--c-success` | `#22C55E` | Live connection, completed status |
| `--c-warning` | `#F59E0B` | Timer ≤ 5 min, reconnecting |
| `--c-danger` | `#EF4444` | Overdue timer, errors, offline |

### Derived neutrals (needed for depth; derived from the palette)
| Token | Hex | Use |
|---|---|---|
| `--c-surface-2` | `#242424` | Hover surfaces, segmented-control track |
| `--c-border` | `#2E2E2E` | Card and input borders |
| `--c-border-strong` | `#3A3A3A` | Dividers on the kitchen display |
| `--c-warning-bg` | `#2A1F08` | Warning card tint |
| `--c-danger-bg` | `#2A0D10` | Overdue card tint, error alert background |
| `--c-success-bg` | `#0D2416` | Success toast background |

### Contrast (WCAG 2.2, computed)
| Pair | Ratio | Allowed for |
|---|---|---|
| White on `#111111` | 18.9 : 1 | all text |
| `#A7A7A7` on `#111111` | ≈ 7.8 : 1 | all text |
| `#F5C542` on `#111111` | ≈ 11.6 : 1 | all text |
| White on `#B5121B` | ≈ 6.8 : 1 | button labels |
| `#F5C542` on `#B5121B` | ≈ 4.2 : 1 | large text only (≥ 24 px or ≥ 18.7 px bold) |
| `#EF4444` on `#111111` | ≈ 5.0 : 1 | timer text, error text |
| `#B5121B` on `#111111` | ≈ 2.8 : 1 | **never** text or a sole state indicator. Fills only |
| White on `#EF4444` | ≈ 3.8 : 1 | large text only (kitchen overdue pill) |
| `#EF4444` on `#2A0D10` | ≈ 4.8 : 1 | owner overdue chip, error alerts |

State is never conveyed by colour alone: timers carry a `+` prefix and an "OVERDUE" label, and connection pills carry text.

## 2. Typography

Self-hosted via `@fontsource` (ADR-016).

| Role | Family | Weights |
|---|---|---|
| Display (brand, order numbers, section titles) | **Barlow Condensed** | 600, 700, 800 |
| UI and body, timers | **Inter Variable** with `font-feature-settings: "tnum"` for timers/clock | 400–700 |
| Arabic-script fallback (Urdu in orders) | **Noto Sans Arabic** | 400, 600 |

Stack: `"Inter Variable", "Noto Sans Arabic", system-ui, "Segoe UI", sans-serif` (emoji fall back to the system emoji font).

### Owner scale (rem, root 16 px)
| Token | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Meta (request ID) |
| `text-sm` | 14 / 20 | Labels, list meta |
| `text-base` | 16 / 24 | Body, **textarea (≥ 16 px prevents iOS zoom)** |
| `text-lg` | 18 / 28 | List titles |
| `text-xl` | 20 / 28 | Section headers |
| `text-2xl` | 24 / 32 | Order numbers in lists |
| `display-lg` | 40 / 44 Barlow 800 | Success "#012" confirmation |

### Kitchen scale (fluid)
The kitchen root size is `font-size: clamp(16px, 0.55vw + 8px, 32px)` (≈ 18.6 px at 1920 w, ≈ 29 px at 3840 w). Density (Standard/Large) multiplies by 1 or 1.2, stored per device.

| Element | Size | Style |
|---|---|---|
| Order number | 2.75rem | Barlow Condensed 800, white, `#` in muted |
| Timer | 2.25rem | Inter 700 tnum |
| Order text | 1.3rem / 1.45 | Inter 500, `white-space: pre-wrap`, `overflow-wrap: anywhere`, `dir="auto"` |
| Header count | 1.75rem | Barlow 700 |
| Meta (received time, source) | 0.95rem | Inter 500 muted |

## 3. Spacing, radii, elevation

- Spacing scale (4 px base): `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- Radii: `sm 6`, `md 10`, `lg 14`, `xl 20`, `full`.
- Borders: 1 px `--c-border`. Kitchen cards have a 1 px border plus a 6 px state bar on the left edge.
- Shadows (dark UI, subtle):
  - `--shadow-1`: `0 1px 0 rgb(255 255 255 / 0.04) inset, 0 4px 12px rgb(0 0 0 / 0.45)`
  - `--shadow-2`: `0 1px 0 rgb(255 255 255 / 0.05) inset, 0 12px 32px rgb(0 0 0 / 0.55)` (dialogs)
  - `--glow-new`: `0 0 0 2px #F5C542, 0 0 24px rgb(245 197 66 / 0.35)`
- No gradients except a 2 px red → deep-red header accent bar.

## 4. Layout and breakpoints

| Name | Min width | Notes |
|---|---|---|
| `sm` | 640 | Large phones landscape |
| `md` | 768 | Tablets |
| `lg` | 1024 | Laptop: owner two-column layout starts |
| `xl` | 1280 | Desktop |
| `2xl` | 1536 | Wide |

### Owner panel (`/owner`)
```
┌──────────────────────────────────────────────────────────────────────┐
│ 91° DEGREE  BBQ | FAST FOOD | CHINESE   Thu 29 Oct · 18:43  ● Live  ⎋ │  header 64px
├──────────────────────────────────┬───────────────────────────────────┤
│  NEW ORDER                       │  ACTIVE (7)        [Recent|History]│
│ ┌──────────────────────────────┐ │ ┌───────────────────────────────┐ │
│ │ Paste or type the full order │ │ │ #007  WhatsApp     12:41  ✓  ✕ │ │
│ │ …                            │ │ │ 2x Chicken Tikka, 1x Zinger…  │ │
│ │                    (≥ 40vh)  │ │ └───────────────────────────────┘ │
│ └──────────────────────────────┘ │  …                                │
│ Source [WhatsApp|Foodpanda|Phone|Other]                              │
│ Target [15|20|25|30 min]         │                                   │
│ [ Paste ] [███ SEND TO KITCHEN ███] │                                │
│ ✓ Order #012 sent to kitchen     │                                   │
└──────────────────────────────────┴───────────────────────────────────┘
```
- Composer mode tabs (ADR-027): **Menu** | **Paste / Type** (full-width segmented tabs; the Menu tab shows a gold count of selected items). Unsent input in both modes is kept when switching.
- **Paste / Type** mode: **Paste** (secondary, clipboard icon) fills the textarea only; **Send to Kitchen** (primary) is disabled until the textarea has text. Pasting never sends (Q-02).
- **Menu** mode: search box; horizontally scrolling category chips (selected chip red; gold count badge); item cards (`--c-surface`, gold border + faint gold tint when selected) with name, gold note ("Serves 2 - 3"), 2-line muted description, and one row per size: label, muted price, and the quantity stepper (− secondary, quantity in Barlow gold when > 0, + primary red; 44 px targets). The list scrolls inside `max-h: min(60vh, 40rem)`. Below it, the **Order summary** panel (lines with smaller steppers and a bin button, red "No longer on the menu" flag, and "Reference total (menu prices, not a bill)" in gold).
- **Kitchen Notes / Special Instructions** (both modes): gold label with a sticky-note icon, 2-row textarea, counter "n / 500" once typed (red above 500, Send blocked).
- `< lg`: single column. The composer comes first and the active list below it. The primary button is sticky at the bottom on mobile (safe-area inset aware).
- Composer column: `minmax(380px, 5fr)`, list column `7fr`, gap 24, page padding 24 (16 on mobile).
- Settings (kitchen screens, account) open in a right-side sheet from the header menu.

### Kitchen display (`/kitchen`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 91° DEGREE          7 ACTIVE            ● Live   18:43   🔔   ⛶              │ header 72px
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────────┤
│▌#003   14:02 │▌#004   09:15 │▌#005  +02:10 │▌#006   19:40 │▌#007   20:00 NEW │
│ WhatsApp     │ Foodpanda    │ Phone OVERDUE│ WhatsApp     │ WhatsApp         │
│ 2x Tikka     │ 1x Chow Mein │ 3x Zinger    │ …            │ …                │
│ 1x Naan      │ less spicy   │ extra fries  │              │                  │
│ …full text…  │              │              │              │                  │
│ Recv 18:21   │ Recv 18:25   │ Recv 18:01   │              │                  │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────────┘
                                                        ▼ 3 more below
```
- Grid: `grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr))`, `align-items: start`, gap `1rem`, padding `1rem`. At 1920 px wide the root size is ≈ 18.6 px, so 19rem ≈ 353 px. Five columns need 5×353 + 6×18.6 ≈ 1,876 px ≤ 1,920, giving 5 columns × 2 rows ≈ 10 short cards. At Large density, or below ~1,880 px, it becomes 4 columns. This is to be confirmed by the P9 screenshot. Long orders grow the card and are never clipped. The board scrolls vertically.
- Reading order is left→right, top→bottom, oldest first.
- Cursor auto-hides after 3 s of inactivity.

## 5. Components

| Component | Spec |
|---|---|
| **Button (primary)** | Fill `--c-red`, white 600 text, radius md, height 56 (composer) / 44 (default), hover `--c-red-deep`, active scale .98 (no scale with reduced motion), disabled 50% opacity + `cursor: not-allowed`, loading = spinner + label |
| **Button (secondary)** | `--c-surface-2` fill, white text, 1 px border |
| **Button (danger-ghost)** | Transparent, `--c-danger` text + border on hover. Used for Cancel |
| **Segmented control** | Track `--c-surface-2`, selected segment `--c-red` with white text. Radio-group semantics (`role="radiogroup"`), arrow-key navigation |
| **Textarea** | `--c-surface`, 1 px `--c-border`, radius lg, padding 16, 16 px Inter, `dir="auto"`, `spellcheck=false`, `autocomplete=off`. Live character counter shows only above 4,000 chars (amber) / 5,000 (red) |
| **Focus** | `outline: 2px solid --c-gold; outline-offset: 2px` on `:focus-visible` everywhere |
| **Order card (kitchen)** | `--c-surface`, radius lg, 6 px left state bar, padding 1rem. Header row: number left, timer right. Source badge + "Yesterday" badge. Body: full text, or for menu orders one line per item (gold Barlow "2×", name, size tag on `--c-surface-2`). Then the **Kitchen notes** block when present. Footer: "Received 18:21 · 20 min" muted. Never any price |
| **Kitchen notes** | 4 px gold left border on `gold/10`, heading "KITCHEN NOTES" (gold, extra-bold, letter-spaced, sticky-note icon), white semibold pre-wrap text (1.2rem on the kitchen). Compact variant in the owner lists. Hidden when there are no notes |
| **Quantity stepper** | − (secondary) / quantity / + (primary red); − disabled at 0, + at 99; accessible names "Add one {item, size}" / "Remove one …" |
| **Sound settings (kitchen)** | Dialog from the header bell: status text, "Turn sound on/off" (primary when off), volume slider 10–100 % (gold accent), "Test sound" (secondary), Close. The bell icon is `Bell` only when sound is actually audible |
| **Order row (owner)** | Number (Barlow 700 24 px), source badge, timer chip, 2-line text preview (expand on click), Complete (✓, success) and Cancel (✕, danger-ghost) as 44 px icon buttons with labels for screen readers |
| **Timer badge** | Inter 700 tnum. `normal`: white on surface. `warning`: amber text + `--c-warning-bg`. `overdue` on the **kitchen** (≥ 2rem bold = large text): white on a `--c-danger` pill (≈ 3.8:1, passes AA large) with an "OVERDUE" label. `overdue` on the **owner** chip (small text): `--c-danger` text on `--c-danger-bg` (≈ 4.8:1) + bold `+` prefix |
| **Source badge** | Small caps 12/14 px, muted text, 1 px border, icon (lucide: `MessageCircle` WhatsApp, `Bike` Foodpanda, `Phone`, `Tag` Other). No third-party logos |
| **Status badge** | ACTIVE (gold outline), COMPLETED (green), CANCELLED (muted, strikethrough number) |
| **Connection pill** | Dot + text: Live (green), Connecting/Reconnecting (amber, spinner), Offline (red) |
| **Toast** | Bottom-centre (mobile) / bottom-right (desktop), auto-dismiss 5 s, `aria-live` |
| **Dialog** | Cancel confirmation: "Cancel order #007?" with "Keep order" (default focus) and "Cancel order" (danger). Esc closes |
| **Brand mark** | Uses `apps/web/public/brand/logo.(svg\|png)` once it exists: cropped or traced from the owner's menu image (Q-06), never redrawn or restyled. Otherwise typographic: "91" Barlow 800 white + "°" gold + "DEGREE" Barlow 700 letter-spaced, subline "BBQ \| FAST FOOD \| CHINESE" muted 12 px. No invented logo artwork |

## 6. States

| State | Owner | Kitchen |
|---|---|---|
| Loading | Skeleton rows (3) in the list. Composer always usable | Centered brand + "Loading orders…" |
| Empty | "No active orders. New orders will appear here." | Large calm message "No active orders" + clock. Nothing else |
| Success | Green toast + large "#012" confirmation in the composer area (2 s) | NEW glow on the card |
| Warning | Amber timer | Amber state bar + timer |
| Error | Inline alert (composer) / toast (actions) | Non-blocking top banner |
| Offline | Pill + banner "Offline — orders can't be sent until connection returns" | Pill + "Showing last known orders" |

## 7. Motion

| Token | Value |
|---|---|
| `--dur-fast` | 120 ms |
| `--dur-base` | 200 ms |
| `--dur-slow` | 320 ms |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` |

- Card enter: opacity 0→1, `scale .96→1`, `y 8→0`, 320 ms ease-out, plus the gold glow fading over 8 s.
- Card exit: opacity →0, `scale →.96`, 200 ms ease-in. Siblings reflow with a layout animation of 250 ms.
- Overdue: one 600 ms attention pulse of the state bar when the card **enters** overdue, then static red. No continuous blinking.
- `prefers-reduced-motion: reduce`: no scale/translate/pulse. Opacity fades ≤ 120 ms. Layout changes are instant.
- Only `transform` and `opacity` are animated (GPU-friendly on TV hardware).

## 8. Accessibility

- WCAG 2.2 AA on the owner panel: contrast above, 44 × 44 px targets, full keyboard flow (Tab order: textarea → source → target → send → list), visible focus.
- Shortcuts: `Ctrl/Cmd+Enter` sends. `Esc` closes dialogs.
- Live regions: submission status (`polite`), errors (`assertive`). Kitchen announces "New order 007" politely.
- Every icon-only button has an `aria-label`. Timers have `aria-label="12 minutes 41 seconds remaining"` updated at most every 30 s for screen readers (no per-second announcements).
- `lang="en"` on the root, and `dir="auto"` on user-provided text.
- Zoom to 200% works without loss of content (owner).

## 9. Skills to apply in Phase 2

`ui-ux-pro-max` (review against UX guidelines), `emil-design-eng` (polish/motion details), `improve-animations` (motion audit), `ui-styling` (Tailwind tokens). See [SKILLS_AND_TOOLS.md](SKILLS_AND_TOOLS.md).
