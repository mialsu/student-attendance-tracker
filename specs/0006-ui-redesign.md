# 0006 — UI redesign ("Läsnä")

Status: ready-for-agent
Created: 2026-09-10
Prototype: `prototype/` (branch `prototype/new-ui`) — `index.html` + `DESIGN_SYSTEM.md` are the visual source of truth.

## Problem Statement

The app works, but its interface is the default teal/amber scaffold it shipped with. For the
teacher who uses it (and any colleague she shares it with), the primary loop — open a class,
type a name, log attendance — is functional but visually undifferentiated and slightly dated,
and the login screen reads like a product being sold rather than a private classroom utility.
There is no dark mode. The teacher wants the tool to feel calm, fast, and legible during and
right after a lesson, and to look like it was designed for her, not for a sales page.

## Solution

Reskin the existing React app with a new, self-consistent design system ("Läsnä"): one confident
indigo accent on quiet neutrals, flat surfaces, generous whitespace, tabular numerals for all
counts, a persistent sidebar shell, and a full dark mode. Every screen — auth, the course
dashboard, the class view (attendance logging, student logs, statistics), and settings — adopts
the same tokens and components. The login panel drops the marketing copy for a plain description
of what the app does. Finnish localisation is preserved throughout.

This is a **presentation change, not a rebuild**: component logic, hooks, the `src/api` layer,
routing, and all behaviour stay as they are. What changes is the token layer, the layout shell,
and the styling of the components on top of shadcn/ui + Tailwind.

## User Stories

1. As a teacher, I want the whole app to share one coherent visual style, so that it feels like a finished product rather than a template.
2. As a teacher, I want the login screen to plainly describe what the app does, so that it feels like a personal utility and not a sales pitch.
3. As a teacher, I want a dark mode I can toggle, so that I can use the app comfortably in a dim classroom or in the evening.
4. As a teacher, I want the app to remember my light/dark choice, so that I don't re-pick it every visit.
5. As a teacher, I want the app to respect my operating system's light/dark preference on first load, so that it looks right before I touch anything.
6. As a teacher, I want a persistent sidebar listing my courses, so that I can jump between classes without going back to the dashboard.
7. As a teacher, I want my current location highlighted in the navigation, so that I always know which class and tab I'm in.
8. As a teacher, I want the course dashboard to show each class as a clear card with student and attendance counts, so that I can pick the right class at a glance.
9. As a teacher, I want a plain empty state when I have no courses yet, so that I know how to create my first one.
10. As a teacher, I want to create a course from a simple dialog, so that I can start tracking a new group quickly.
11. As a teacher, I want the attendance-logging form to stay the fast path — pick a date, type a name, set a quantity, submit — so that I can log during a lesson without friction.
12. As a teacher, I want name suggestions as I type, showing each student's attendance count, so that I pick the right existing student instead of creating a duplicate.
13. As a teacher, I want to drive the name suggestions from the keyboard (arrow keys, Enter, Escape), so that I never have to reach for the mouse mid-flow.
14. As a teacher, I want a clear signal when my typed name matches no one, so that I understand a new student will be created.
15. As a teacher, I want the student-logs table to show each student's attendance with a visual bar and an exact number, so that I can compare participation at a glance.
16. As a teacher, I want course-credit status shown as a labelled, coloured badge with an icon, so that I can tell credited from uncredited students without relying on colour alone.
17. As a teacher, I want to mark a course credit directly from the table, so that I don't need a separate screen.
18. As a teacher, I want to edit or delete a student from the table with clearly separated actions, so that I don't delete someone by accident.
19. As a teacher, I want a confirmation before a destructive delete that names the student and warns that their attendance history goes with them, so that I delete deliberately.
20. As a teacher, I want to search and page through students, so that a large class stays manageable.
21. As a teacher, I want to reveal or hide legacy students (first attendance over five years old) with a toggle, so that old names don't clutter the list by default.
22. As a teacher, I want the statistics tab to show totals and a day/month bar chart, so that I can see participation trends over time.
23. As a teacher, I want a plain "no data yet" state on statistics before any attendance exists, so that I'm not shown an empty chart frame.
24. As a teacher, I want to change my email and password from a clean settings screen, so that I can keep my account current.
25. As a teacher on a phone, I want the layout to collapse to one column with an off-canvas menu, so that the app is usable on a small screen.
26. As a teacher on a phone, I want no horizontal page scrolling and comfortable tap targets, so that the app doesn't feel cramped or mis-tap.
27. As a teacher using the keyboard, I want a visible focus ring on every control, so that I always know where I am.
28. As a teacher who prefers reduced motion, I want animations to respect that setting, so that the interface doesn't distract or disorient me.
29. As a teacher using a screen reader, I want status, tabs, dialogs, and navigation to announce their state correctly, so that I can operate the app non-visually.
30. As a teacher, I want error and success feedback as unobtrusive toasts that don't steal focus, so that I stay in my flow.
31. As a teacher, I want the not-found and loading states styled like the rest of the app, so that nothing looks broken or half-finished.
32. As the maintainer, I want the new colour pairs proven to meet contrast at build time, so that a future token edit can't silently ship an unreadable combination.
33. As the maintainer, I want the redesign to leave existing behaviour tests passing unchanged, so that I know the reskin didn't break functionality.

## Implementation Decisions

- **Reskin, not rebuild.** Keep the component logic, the query hooks (`useClasses`,
  `useStudents`, `useAttendance`, `useAuth`), the `src/api` layer, React Router structure, and
  every existing interaction. Only presentation — the theme token layer, the layout shell, and
  component styling — changes.
- **Token layer is the seam of the change.** Re-map the theme's shadcn/ui CSS custom properties
  (the `--background` / `--card` / `--primary` / `--secondary` / `--muted` / `--border` /
  `--input` / `--ring` / `--destructive` family, all HSL) from the current teal/amber values to
  the new indigo system, defined once for light and again for dark. Every component inherits the
  change; almost no component markup needs per-element colour edits. Keep the existing split
  between a divider border and a stronger control-boundary colour (`--input`) so control outlines
  clear WCAG 1.4.11's 3:1 — the current theme already does this deliberately.
- **New palette (from the prototype `DESIGN_SYSTEM.md`; the decision, not decoration).** Primary
  indigo `#5A4FF3` (light) / `#8B83FF` (dark); semantic success/warning/danger/info each with a
  low-saturation "soft" background; neutral surface + ink ramps; the control-boundary token kept
  distinct from the divider. The prototype file carries the full table and both themes; treat it
  as the reference when writing the token values.
- **Dark mode is new.** Introduce a complete dark palette (defined independently, not inverted)
  plus a theme toggle in the shell. Initial theme follows `prefers-color-scheme`; an explicit
  choice is persisted in `localStorage` and wins on later visits. Guard reads/writes so a blocked
  storage doesn't break first paint.
- **Typography.** Adopt Plus Jakarta Sans with a system fallback stack, self-hosted as woff2
  subsets with `unicode-range` and `font-display`, mirroring exactly how Fira Sans is handled
  today — not a runtime CDN fetch, so the hermetic test walk that awaits `document.fonts.ready`
  stays honest. (See Open Questions — keeping Fira Sans is a cheaper alternative.) Use tabular
  numerals for all counts, table figures, and stat values.
- **Layout shell.** Introduce a persistent left sidebar (brand, course list with counts,
  settings, user chip) that collapses to an off-canvas drawer below ~940px, replacing the current
  header-only `TeacherLayout`. Keep breadcrumbs. Current location is marked in the nav.
- **Components restyled to the token set:** buttons (one primary CTA per view), inputs with a
  3px focus ring, cards, segmented tabs, the student table (inline attendance bar + tabular
  count + icon row-actions + pagination), status badges (colour **plus** icon/label), stat cards,
  the autocomplete menu (min 2 chars, keyboard nav, attendance count, explicit "new student"
  empty state), the legacy toggle switch, the create-class and delete-confirm dialogs, toasts
  (non-focus-stealing), course cards with a dashed "new course" affordance and empty state, and
  the auth split-screen.
- **Charts stay on Recharts.** The prototype's pure-CSS bar chart exists only to stay
  dependency-free; the shipped statistics keep the existing Recharts `BarChart`, restyled to the
  new tokens (subtle gridlines, accessible bar colour, tooltip). Day/month toggle preserved.
- **Copy.** The auth aside drops the "in seconds / at a glance / fast" selling for a plain
  description of the app's three functions. All Finnish strings preserved; no English leaks in.
- **Icons stay Lucide**, one consistent stroke weight; no emoji as structural icons.
- **Screens in scope:** Auth, Dashboard, ClassView (attendance / logs / statistics tabs),
  Settings, the 404 and loading states, and the shared shell.

## Testing Decisions

- **What a good test is here.** A reskin must be verified through behaviour and semantics, not
  appearance. Tests assert roles, labels, ARIA state, keyboard operation, and the two things that
  are genuinely visual-but-checkable (contrast pairs and theme state) — never class names, hex
  values, or pixel snapshots, which are brittle and would break on every polish pass.
- **The seam is the existing one:** the `src/api/*` module boundary. Render the page/component
  with the shared `test-utils` providers (QueryClient + Router + AuthProvider) and mock
  `@/api/*`, `useNavigate`, `useToast`, and the query hooks. No test may reach the network —
  `src/test/setup.ts` refuses XHR/fetch and re-throws after the test. This is the highest seam and
  the only one; no new seam is introduced.
- **Prior art to copy:**
  - `src/__tests__/integration/auth-flow.test.tsx` — renders a page, mocks the api seam +
    navigate + toast, drives it with `userEvent`. The pattern for any behaviour test.
  - `src/components/__tests__/surfaces.a11y.test.tsx` — accessibility assertions across surfaces
    with hooks mocked. Extend it to cover the new shell and restyled components.
  - `src/__tests__/tokens-contrast.test.ts` — pins each foreground/background pair to its
    required ratio. **Update it to the new pairs for both light and dark, and keep it a gate.**
- **What this feature adds to the suite:**
  - The contrast test re-pinned to the new light **and** dark pairs (AA: 4.5:1 text, 3:1 UI
    boundaries).
  - Theme toggle behaviour: toggling flips the theme, the choice persists, and first load honours
    `prefers-color-scheme`; a blocked `localStorage` degrades without throwing.
  - The off-canvas nav opens and closes at small width (`useMediaQuery` mocked, as in the a11y
    suite).
  - Existing behaviour tests continue to pass **unchanged** — the proof the reskin didn't alter
    function. Autocomplete keyboard nav, credit toggle, delete confirmation, search/pagination,
    and legacy toggle are behaviour and stay covered.

## Out of Scope

- Any backend, API, schema, or endpoint change. This is frontend presentation only.
- New features or flows: no new statistics, no bulk student edit, no UI for the statistics
  `exclude_dates` (still hard-coded as today), no new settings beyond email/password.
- Changing auth strategy, routing structure, the data model, or the domain rules (INV-1 etc.).
- Swapping the component library — stay on shadcn/ui + Tailwind.
- Shipping anything from the prototype directly: its mock data and CSS bar chart are throwaway.
  The prototype is a reference, not a source to copy files from.

## Acceptance Criteria

*(devkit addition — each criterion is falsifiable and names how it's proven. `/verify-live` fills
verdicts.)*

| # | Criterion | Proven by | Serves |
|---|---|---|---|
| AC1 | Every documented foreground/background pair meets AA in **both** light and dark | `tokens-contrast.test.ts` (extended) | 16, 32 |
| AC2 | Toggling theme flips it, persists the choice, and first load honours `prefers-color-scheme`; blocked storage doesn't throw | new theme test | 3, 4, 5 |
| AC3 | All existing client behaviour tests pass unchanged after the reskin | full `npm run test:run` | 33 |
| AC4 | Autocomplete is fully keyboard-operable and signals "no match → new student" | behaviour test (extends auth-flow pattern) | 12, 13, 14 |
| AC5 | Deleting a student requires a confirmation naming the student and its history loss | behaviour test | 18, 19 |
| AC6 | At ≤400px: one column, off-canvas nav opens/closes, no horizontal page scroll | a11y/responsive test + `/verify-live` | 25, 26 |
| AC7 | Every interactive control has a visible focus ring; status uses colour **and** icon/label; reduced-motion respected | `surfaces.a11y.test.tsx` (extended) + `/verify-live` | 16, 27, 28, 29 |
| AC8 | The auth aside contains no sales copy; all UI strings remain Finnish | `/verify-live` (visual read) | 2 |
| AC9 | Statistics render via Recharts in both themes with a day/month toggle and a "no data" state | behaviour test + `/verify-live` | 22, 23 |

## Tracer Slices

Thin vertical slices, each shippable and gate-green, blockers first:

1. **Token layer + dark mode + contrast gate.** Re-map the theme variables (light + dark), add
   the theme toggle + persistence, re-pin `tokens-contrast.test.ts`. Thinnest end-to-end change:
   every screen inherits the new look at once. (Blocks all others.)
2. **App shell.** Sidebar + course nav + off-canvas drawer + breadcrumbs + active state; theme
   toggle lives here.
3. **Auth split-screen** with the de-selled copy — one full screen, top to bottom.
4. **Dashboard** — course cards, counts, empty state, create-class dialog.
5. **ClassView tabs** — attendance form + autocomplete; logs table + badges/actions/pagination/
   legacy toggle; statistics restyled on Recharts.
6. **Settings** — email + password.
7. **Polish + typography + a11y sweep** — self-host the font (or confirm Fira Sans stays),
   404/loading states, extend `surfaces.a11y.test.tsx`, run `/verify-live` across AC6–AC9.

## Open Questions

*(Ambiguity is recorded here, not assumed away.)*

1. **Font.** Commit to self-hosted Plus Jakarta Sans (design-system recommendation, new woff2
   subsetting work), or keep the already-self-hosted, already-passing Fira Sans and take only the
   new layout/colour? Fira is the cheaper, lower-risk choice; PJS is the stronger look.
2. **Dark mode now or later?** The prototype includes it and the contrast gate can cover both, but
   it roughly doubles the token and testing surface. Ship in slice 1, or defer to a follow-up?
3. **Sidebar shell.** Adopt the persistent course-list sidebar (a real navigation change, adds the
   "jump between classes" story), or keep the simpler current header layout and apply only the new
   styling? The sidebar is the bigger change and the bigger win.
4. **Prototype's four-course dashboard vs. real data.** The prototype shows an "Arkistoitu"
   (archived) course badge; the real model has `Class.active`. Confirm whether the dashboard should
   surface active/archived state now or leave it out of this reskin.

## Further Notes

- `prototype/index.html` and `prototype/DESIGN_SYSTEM.md` are the visual reference; §8 of the
  design system doc already sketches the token-mapping migration.
- Suggested build order is the tracer slices above: token layer first (so the contrast gate is
  green before anything else moves), then the shell, then screen by screen.
- Respect the existing deliberate token decision: `--input` is intentionally darker than `--border`
  for the 3:1 control-boundary rule. Carry that split into the new palette.
