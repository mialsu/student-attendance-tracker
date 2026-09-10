# Läsnä — Design System Proposal

A proposed visual and interaction system for the Student Attendance Tracker, derived
directly from the prototype in [`index.html`](./index.html). Open that file in a browser
to see every token and pattern below in use, in both light and dark mode.

> **Status:** proposal / exploration. Nothing here is wired into the shipping `client/`
> app. It deliberately does **not** preserve the current teal + amber scheme — the brief
> was a clean-sheet redesign. Adopting it would mean re-mapping the shadcn/ui CSS
> variables in `client/src/index.css` to the tokens documented here.

---

## 1. Design principles

The product is a **teacher's working tool**, used quickly and repeatedly during or right
after a lesson. The system optimises for that context:

1. **Speed over decoration.** The primary loop — type a name, confirm, log — must feel
   instant. Flat surfaces, minimal shadow, fast (160 ms) transitions.
2. **Calm, legible neutrals with one confident accent.** A single indigo carries brand,
   focus, and primary action so the eye always knows where to go. Everything else is
   quiet grey.
3. **Data is the hero.** Tabular numbers, inline progress bars, and honest empty states
   instead of chrome. Charts stay flat and readable.
4. **Accessible by construction.** Every foreground/background pair targets WCAG AA
   (4.5:1 text, 3:1 UI boundaries); focus is always visible; colour never carries meaning
   alone (a ✓ icon accompanies "Suoritettu", not just green).
5. **Bilingual-ready, Finnish-first.** All copy is Finnish, matching the live app. Layout
   tolerates the longer compound words Finnish produces.

**Foundations chosen by `ui-ux-pro-max`:** Flat Design style · "Education" palette family
(re-hued to indigo) · Plus Jakarta Sans type · flat, low-shadow effects.

---

## 2. Color tokens

All colours are exposed as CSS custom properties on `:root`, with a full `[data-theme="dark"]`
override. Components reference **semantic** tokens only — never raw hex.

### Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#5A4FF3` | `#8B83FF` | Primary actions, active nav, focus ring |
| `--primary-hover` | `#4A3FE0` | `#9A93FF` | Hover state |
| `--primary-press` | `#3D33C9` | `#7A72F5` | Active/pressed |
| `--primary-soft` | `#ECEBFE` | `#24243F` | Tinted backgrounds (active nav, badges) |
| `--on-primary` | `#FFFFFF` | `#12122A` | Text/icons on primary |

### Semantic status

| Role | Token | Light | Soft bg | Meaning |
|---|---|---|---|---|
| Success | `--success` | `#0F9D58` | `--success-soft` | Course credit granted, positive toast |
| Warning | `--warning` | `#B45C00` | `--warning-soft` | Legacy / attention |
| Danger | `--danger` | `#D92454` | `--danger-soft` | Destructive actions, errors |
| Info | `--info` | `#2563EB` | `--info-soft` | Helper notes |

Each status colour is paired with a low-saturation "soft" background for badges and banners
so the strong hue is reserved for text and icons.

### Neutral surfaces & text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F6FB` | `#0D0E18` | App canvas |
| `--surface` | `#FFFFFF` | `#16172A` | Cards, sidebar, inputs |
| `--surface-2` | `#F0F2F9` | `#1E2036` | Muted fills, table header, tab track |
| `--surface-3` | `#E7EAF4` | `#282B45` | Progress track, avatars |
| `--ink` | `#171A2E` | `#EDEEF7` | Primary text |
| `--ink-2` | `#545974` | `#A8ADC8` | Secondary text |
| `--ink-3` | `#868BAB` | `#767B9B` | Tertiary / placeholder |
| `--border` | `#E3E6F1` | `#282A42` | Dividers, card borders |
| `--border-strong` | `#C4C9DB` | `#3C3F5C` | **Control boundaries** (inputs) — clears 3:1 |

> The split between `--border` (decorative divider) and `--border-strong` (a boundary that
> *identifies a control*) mirrors the real app's own note in `client/src/index.css`: WCAG
> 1.4.11 wants 3:1 for the outline of an input, but a hairline divider may be softer.

---

## 3. Typography

- **Family:** `Plus Jakarta Sans` (Google Fonts), system-ui fallback stack. Friendly,
  modern, geometric — reads well at small sizes and in dense tables.
- **Numerals:** `font-variant-numeric: tabular-nums` on all counts, stats, and table
  figures so columns and changing values never shift width.

| Role | Size | Weight | Line height |
|---|---|---|---|
| Page title | 30px (25px mobile) | 800 | 1.2 |
| Card / section title | 17–19px | 700 | 1.2 |
| Body | 14–15px | 400 | 1.55 |
| Label | 13px | 600 | — |
| Hint / meta | 12–12.5px | 400–600 | — |
| Overline (nav labels) | 11px | 700, uppercase, `.06em` tracking | — |
| Stat value | 28px | 800, tabular | — |

Body stays ≥14px; inputs are 14.5px (≥16px equivalent weight to avoid iOS zoom concerns in
production, tune as needed).

---

## 4. Spacing, radius, elevation, motion

- **Spacing** — 4pt scale exposed as `--s1`…`--s16` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- **Radius** — `--r-sm` 8 · `--r-md` 12 · `--r-lg` 16 · `--r-xl` 22 · `--r-full` 999.
  Inputs/buttons use `md`; cards use `lg`; pills/badges use `full`.
- **Elevation** — three flat tiers: `--shadow-sm` (cards at rest), `--shadow-md` (hover
  lift), `--shadow-lg` (dialogs, popovers, toasts). No shadow does structural work that a
  border could not.
- **Motion** — one shared token: `--dur: 160ms` with `--ease: cubic-bezier(.2,.7,.3,1)`.
  Bars animate height over 600 ms. Everything respects
  `@media (prefers-reduced-motion: reduce)`.

---

## 5. Components

Each is implemented in the prototype; class names in parentheses.

- **Buttons** (`.btn` + `-primary` / `-outline` / `-ghost` / `-danger`, `-sm`, `-block`) —
  42px tall (34px `sm`), 8px icon gap, press translate of 1px. One primary CTA per view.
- **Inputs** (`.input`, `.textarea`, `.select`, `.field`, `.label`, `.hint`, `.field-error`)
  — 44px tall, `border-strong` boundary, 3px `primary-soft` focus ring. Password fields get
  a show/hide toggle (`.input-group .trailing`).
- **Cards** (`.card`, `.card-head`, `.card-pad`) — the primary container.
- **Course card** (`.course-card`) — icon tile, status badge, description, meta footer;
  lifts and borders-indigo on hover. Includes a dashed "new course" affordance and an
  empty state (`.empty`).
- **Badges & chips** (`.badge` + variants) — status = colour **plus** icon/text.
- **Tabs** (`.tabs`, `.tab`, `role="tablist"`) — segmented control on a muted track;
  used for class sections and chart granularity.
- **Data table** (`table.data`, `.stu-name`, `.attend-pill`, `.row-actions`, `.pager`) —
  sticky-styled header, hover rows, inline attendance progress bar, tabular counts,
  icon row-actions, and pagination. Horizontally scrollable inside its card.
- **Stat cards** (`.stat`) — label + tabular value + optional delta.
- **Chart** (`.chart`, `.bar`, `.bar-col`) — pure-CSS flat bar chart with hover value
  tooltip; no charting dependency in the prototype (production would keep Recharts).
- **Autocomplete** (`.ac-wrap`, `.ac-menu`, `.ac-item`) — the name-entry pattern that
  drives fast logging: min 2 chars, keyboard nav (↑/↓/Enter/Esc), shows attendance count,
  and an explicit "creates a new student" empty state.
- **Toggle / switch** (`.toggle`, `role="switch"`) — for the legacy-students filter.
- **Dialog** (`.overlay`, `.dialog`) — modal with head/body/foot, backdrop dismiss, scale-in.
- **Toast** (`.toast`, `.toast-region`) — bottom-right, success/error variants, auto-dismiss
  ~3.5s, left accent bar.
- **App shell** — 264px sidebar (brand, course nav with counts, settings, user chip) +
  scrollable main; collapses to an off-canvas drawer under 940px.
- **Auth split-screen** — branded gradient aside + focused form; single column on mobile.

---

## 6. Screens in the prototype

| Screen | Covers real app route |
|---|---|
| **Kirjautuminen** | `pages/Auth.tsx` — login/signup toggle, registration code, password reveal |
| **Kurssit (Dashboard)** | `pages/TeacherDashboard.tsx` — course cards, create-class dialog, empty state |
| **Kurssinäkymä** | `pages/ClassView.tsx` — three tabs below |
| → Läsnäolon kirjaus | `components/AttendanceTracking.tsx` — date, autocomplete, quantity 1–50 |
| → Läsnäolot | `components/StudentLogs.tsx` — summary table, credit toggle, edit/delete, legacy filter, pagination |
| → Tilastot | `pages/ClassStatistics.tsx` — stat cards + day/month bar chart |
| **Asetukset** | `pages/Settings.tsx` — email + password change |

The prototype navigator (top bar) switches between the logged-out and logged-in states and
toggles light/dark.

---

## 7. Accessibility checklist (met in prototype)

- [x] Text contrast ≥ 4.5:1; UI boundaries ≥ 3:1 (`--border-strong`, focus ring) — both themes
- [x] Visible focus ring on every interactive element (`:focus-visible`)
- [x] Colour never the sole signal — status badges pair hue with icon + label
- [x] Keyboard support in autocomplete (↑ ↓ Enter Esc) and native controls throughout
- [x] `role` / `aria-*` on tabs, switch, dialog, nav (`aria-current`), toggle buttons
- [x] `prefers-reduced-motion` disables transitions/animations
- [x] Touch targets ≥ 38–44px; adequate spacing between row actions
- [x] Responsive at 375px, off-canvas nav, no horizontal page scroll (tables scroll locally)
- [x] Dark mode defined independently, not inverted

---

## 8. Adoption notes

This is a **static prototype**, not production code. To take it further:

1. Map these tokens onto the shadcn/ui HSL variables in `client/src/index.css`
   (`--primary`, `--background`, `--border`, `--input`, `--ring`, …). The existing
   `src/__tests__/tokens-contrast.test.ts` gate would need its expected pairs updated and
   re-proven — do not hand-edit token values without running it.
2. Keep Recharts for statistics; the CSS bar chart here is only to stay dependency-free.
3. The autocomplete, table, dialog, and toast behaviours already exist in the React app —
   this changes their *skin* and layout, not their logic.
4. Validate Plus Jakarta Sans self-hosting the same way Fira Sans is handled today
   (woff2 subsets, `unicode-range`, `font-display`) before shipping, to keep the hermetic
   test walk honest.

---

*Generated as a design exploration with the `ui-ux-pro-max` skill. Tokens and components
are the single source of truth in [`index.html`](./index.html); this document describes them.*
