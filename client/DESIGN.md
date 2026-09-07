# DESIGN.md — Student Attendance Tracker (client)

The project-once design contract: what the surface is made of, and which of its rules are actually
enforced. Written by `/design-brief` on 2026-09-07, and re-read before every slice.

**First slice landed 2026-09-07: variant A, "Tilikirja".** Three directions were built on the real
route and flipped between (`/prototype`, sub-shape A); the Owner chose A's layout, its education-teal
palette, and one table at every width. What that changed is recorded in each section below rather
than appended here. The full variant set is kept on the `proto/lasnaolot-variants` branch — it is
the primary source for the decision, and its code was never promoted.

**The scope source is not a brief.** This project predates Stage 0 and has no `PRODUCT-BRIEF.md`,
so §1 reconciles against `CONTEXT.md` plus the feature set actually in production, and §3's
empty/refused/error answers came from the code and from the Owner rather than being carried over
from product altitude. Where the code's answer is wrong, this file says so instead of quietly
re-deciding it. That difference from the template is deliberate and was the Owner's call.

**Deliberately small.** Three things live elsewhere and are only pointed at from here:

| Not in this file | Where it lives | Why not here |
|---|---|---|
| Palette values, type scale, spacing steps | `src/index.css` (HSL custom properties — education teal since 2026-09-07) and `tailwind.config.ts` (type scale, spacing, shadows, `Fira Sans`) | a token table here *plus* tokens in code is two implementations of one thing. §5's contrast table is measured **from** those files by a test, not transcribed |
| Aesthetic direction, wireframes, UI copy | the `frontend-design` skill, applied when the re-skin is built | that skill owns the format and the judgement. devkit adds one constraint: the values stay in code |
| Which layout wins | a `/prototype` UI run — N variants on the real route with real data | the mobile row's structure (§6) is the open one, and prose will not settle it |

The vocabulary is `CONTEXT.md`, and two of its rules bind this document directly: the app is **a
tally sheet, not an academic record**, so no surface may imply it decides a credit — no progress
bar, no badge, no "14/15" hint; and the UI says **Kurssi** where the API says `Class`, correct in
both registers.

---

## 1. Surface inventory

One teacher, one Kurssi, in production since November 2025. Every surface below is built.

| Surface | Serves | Slice | Status |
|---|---|---|---|
| `/auth` | getting the one teacher in, and nobody else — signup needs a 16-char registration code issued from the CLI | — | built |
| `/dashboard` | "the Kurssi she owns, and a way to make another" | — | built |
| `/class/:id` → *Kirjaa läsnäolo* | the core loop: record who turned up, 1–50 at a time, with name autocomplete | — | built |
| `/class/:id` → *Läsnäolot* | the tally per Student, the course-credit tick, and correcting mistakes (rename, merge, delete) | — | built |
| `/class/:id` → *Tilastot* | daily and monthly aggregates | — | built |
| `/settings` | change email, change password | — | built |
| `*` → 404 | the wrong address | — | built, and see below |
| `/` | not a surface — renders `null` and redirects by session (`Index.tsx`) | — | built |

- **Surfaces serving nothing:** the 404 is real but was never finished to the standard of the rest.
  It is the **only** file in the app written in English ("Oops! Page not found", "Return to Home")
  and the only one that bypasses the token system (`bg-gray-100`, `text-gray-600`,
  `text-blue-500`). Everywhere else the discipline holds: one stray `text-green-600` in
  `StudentLogs.tsx`, and nothing else.

- **Capabilities with no surface — five, and the last one matters most:**
  1. **No way to rename or delete a Kurssi.** `useUpdateClass` and `useDeleteClass` exist at
     `src/hooks/useClasses.ts:31,44` and no component calls either. Dead client code and a gap in
     the same breath.
  2. `POST /classes/{id}/students` has no caller. A Student comes into being only as a side effect
     of logging attendance, which matches `CONTEXT.md`'s per-Class row model and is fine — but it
     means there is no way to add a Student who has not yet attended.
  3. `GET /classes/{id}/attendance`, the raw record list, has no caller. The UI reads `/summary`.
  4. `GET /students/{id}` has no caller.
  5. **`Class.active` has no screen at all.** `CONTEXT.md` gives it real meaning — it blocks *new*
     attendance while keeping history editable — and nothing in the client reads or sets it. Flip
     it in the database today and logging starts failing with no screen anywhere explaining why.

---

## 2. Flows

- **Record attendance (the core loop):** open the app → `/auth` if the session is cold → dashboard
  → the Kurssi → *Kirjaa läsnäolo* → type a name, autocomplete offers previous Students by
  frequency → set a quantity 1–50 → the toast confirms and the field clears. Ends early when: the
  name is blank, or the API refuses, and the toast carries the reason.
- **Catch up from paper:** the same flow with a quantity above 1 — 1–50 records sharing one
  timestamp, which is why bulk entry exists.
- **Correct a mistake:** *Läsnäolot* → find the Student (search is debounced 500ms) → rename in
  place, merge into a duplicate, delete a single record, or delete the Student. Ends early when:
  the new name already exists in this Kurssi, and the dialog offers a merge instead.
- **Decide a credit:** *Läsnäolot* → read the tally → tick *Suoritus* by hand. The teacher decides;
  around 14–15 attendances is her rule of thumb and **nothing in the app enforces or displays it**.
- **Get in / get out:** `/auth` → dashboard, and the user menu → logout. Signup additionally needs
  a registration code. Ends early when: the code is used, revoked, expired, or not for that email.

---

## 3. States

Every state is held to **320px** — the narrowest viewport this app supports, set by the Owner on
2026-09-07 and enforced as `A11Y-7`. That is the WCAG 1.4.10 reflow width, so the cheapest
accessibility check available here is also the width decision.

| Surface | Empty | Loading | Refused / error | Success |
|---|---|---|---|---|
| `/dashboard` | "Ei kursseja vielä. Luo ensimmäinen kurssisi yllä olevasta painikkeesta." | spinner in place of the list | **see the hole below** | the Kurssi list, each card a link |
| *Kirjaa läsnäolo* | n/a — the form is always the form | the submit button becomes "Kirjataan…" and disables | toast, `detail` from the API or "Läsnäolon kirjaaminen epäonnistui" | toast, and the field clears |
| *Läsnäolot* | "Ei opiskelijoita vielä" (desktop) / "Ei läsnäoloja kirjattu vielä tälle kurssille" (narrow); searching yields "Ei hakutuloksia haulla …" | Card header stays, body becomes a spinner | **see the hole below** | rows, tally, and the *Suoritus* tick |
| *Tilastot* | "Ei läsnäoloja näytettäväksi" + "Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot." | "Ladataan tilastoja…" | **see the hole below** | the daily and monthly aggregates |
| `/settings` | n/a | button disables | toast with the API's `detail` | toast |
| `/auth` | n/a | button disables | toast: "Väärä sähköposti tai salasana" / "Rekisteröinti epäonnistui" | redirect to the dashboard |
| `/class/:id` | n/a | full-surface spinner | redirect to `/dashboard`, silently | the three tabs |
| 404 | n/a | n/a | n/a | English copy, untokenized colours |

**The hole, and it is one bug in three places.** None of the three read surfaces consults its
query's `error` — `StudentLogs.tsx:120`, `TeacherDashboard.tsx:19` and `ClassStatistics.tsx:27` all
destructure `data` and `isLoading` and stop. So a **failed** request renders the **empty** state:

- the dashboard tells a teacher who owns a Kurssi that she has none, and invites her to create one;
- *Läsnäolot* says "no Students yet" about a register that has thirty;
- *Tilastot* tells someone with two hundred records to go and record some attendance.

Each of those sentences is false and actionable in the wrong direction, which is worse than an
error message. `ANTI-PATTERNS` calls a labelled honest empty state the bar; this is an empty state
lying about an error. Fixing it is the first item of the re-skin, not a later polish pass: an error
state is one of the four states, and the re-skin cannot reconcile a state that does not exist.

**Loading is the one state design owns outright** — no product decision sits behind it. Decided
here, and each of these is a change the current code does not yet make:

- **Nothing shows a spinner before 300ms.** The API sits on a Hetzner VM and most of these calls
  return in well under that; a spinner that appears and vanishes reads as a flicker, not as
  progress. Today every one of them spins immediately.
- **The frame never waits for the data.** A Card's title and description render at once and only
  the body region resolves. *Läsnäolot* already does this; `/class/:id` does not — it blanks the
  whole surface, tabs included, behind one spinner.
- **A mutation never blanks anything.** It disables its own control and says what it is doing
  ("Kirjataan…"). That is already the pattern and it stays.

---

## 4. Components

- **`TeacherLayout`** — the signed-in frame: header, breadcrumbs, main region — used by: dashboard,
  `/class/:id`, `/settings`
- **`AppHeader` / `AppLogo` / `UserMenu` / `Breadcrumbs`** — the parts of that frame — used by:
  `TeacherLayout`
- **`ProtectedRoute`** — refuses a surface until the session is known — used by: dashboard,
  `/class/:id`, `/settings`
- **`DataTable`** (`src/components/ui/data-table.tsx`) — the desktop table: columns, row actions,
  expansion, pagination — used by: *Läsnäolot*
- **`PublicNav`** — the signed-out header — used by: `/auth`
- **`AttendanceTracking` / `StudentLogs` / `ClassStatistics`** — the three tabs of `/class/:id`

`StudentLogs` was **1100 lines** and rendered two complete implementations of one surface — a
`DataTable` above the breakpoint and an `Accordion` below it, each with its own row actions, edit
affordance and dialogs. **Resolved 2026-09-07: there is one.** Variant A won on the real route, so
the accordion branch, the mobile-only pagination and the mobile-only edit dialog are deleted; the
file is **853 lines** and the table scrolls sideways inside its own container below ~544px.

Two things fell out of that deletion rather than being fixed on their own terms: the
`nested-interactive` defect (§6 used to lead with it — there is no accordion trigger left to nest a
button inside), and the question of which implementation a change belongs in. This is the one place
prose could not have settled it: both implementations looked fine read separately.

---

## 5. Accessibility — every line names its enforcer

Installed 2026-09-07 (ADR-0004). Before that date this repo had **no** accessibility enforcer and
every row here would have read `[review-only]`. Each gate below was proven by breaking it on
purpose and watching it go red.

**Re-tagged the same day**, when the browser walk landed (ADR-0005). Four rows moved off
`live:keyboard-walk` — a real enforcer that ran when someone remembered — and onto `e2e/`, which
runs in `npm run check` and as a job `deploy` needs. One row moved the other way, from `[live]` to
`[review-only]`, because pretending a human check is automated is worse than admitting it is not.

| # | Must be true | Enforced by | Tag |
|---|---|---|---|
| A11Y-1 | Every interactive element is reachable *and* operable with the keyboard alone | `test:e2e/core-loop.spec.ts` — the core loop with no mouse at both viewports: Tab reaches every control of the logging form, Escape dismisses the suggestions, Enter submits, and the POST body is asserted. Proven by `tabIndex={-1}` on the quantity field, watched red | `[test]` |
| A11Y-2a | Focus **order** follows reading order | `test:e2e/core-loop.spec.ts` — the forward tab sequence taken once, then asserted: name after date, quantity after name, submit last. A press *count* cannot do this job, because Tab wraps at the end of the document | `[test]` |
| A11Y-2b | Focus is always **visible** | nothing. ADR-0005 rejected a screenshot baseline for it — genuinely stronger, and it buys committed PNGs and their churn in front of every `git status`. Split from A11Y-2a on 2026-09-07 rather than left `[live]`, because one row cannot carry two enforcers | `[review-only]` |
| A11Y-3 | Every control has an accessible name, and no `<img>` is unlabelled | `lint:gate:a11y` (jsx-a11y, ratchet at 0) + `test:surfaces.a11y.test.tsx` (axe, six states, jsdom) + `test:e2e/states.spec.ts` (axe, fourteen states, real browser). The third one is the only one that could catch what it caught: `AppLogo` and `UserMenu` both hid their only text with `hidden sm:inline`, so below 640px each was a nameless control on every signed-in surface. jsx-a11y reads the span in the JSX; jsdom applies no media query | `[lint]` |
| A11Y-4 | Text clears 4.5:1, and a boundary that identifies a control clears 3:1 | `test:tokens-contrast.test.ts` — ten token pairs computed from `src/index.css`, not from intent — **and** `test:e2e/states.spec.ts`, axe with `color-contrast` enabled over fourteen rendered states. The second half is not a duplicate: the token test proves the palette and has no way to express a composite like `bg-primary/10`, which is where the two open failures live | `[test]` |
| A11Y-5 | Nothing conveys meaning by colour alone | nothing — a human has to look. The *Suoritus* badge carries its word, which is why it passes today | `[review-only]` |
| A11Y-6 | `prefers-reduced-motion` is respected | nothing. `animate-fade-in`, `transition-smooth` and `active:scale-[0.98]` all ignore it | `[review-only]` |
| A11Y-7 | Content reflows at 320px with no two-directional scrolling (WCAG 1.4.10) | `test:e2e/states.spec.ts` — `documentElement.scrollWidth <= clientWidth` in every one of the fourteen states at 320px, measured after `document.fonts.ready` so the widths are Fira Sans's and not system-ui's. It **passes on all fourteen**, and it caught one real failure on the way in: the *Tilastot* charts forced the page to 760px. An inner container that scrolls is deliberate and allowed; the document scrolling is not | `[test]` |
| A11Y-8 | Text stays readable and nothing is cut off at 200% zoom (WCAG 1.4.4) | nothing | `[review-only]` |
| A11Y-9 | No control announces itself in the wrong language | nothing automated — axe reads a name's presence, never its language | `[review-only]` |

Contrast, measured from the real tokens by `src/__tests__/tokens-contrast.test.ts` — ten pairs in
each theme, and **every one clears** since variant A's palette landed. That test's `KNOWN_FAILING`
list is empty for the first time.

| Foreground on background | Light | Dark |
|---|---|---|
| `foreground` on `background` / `card` | 9.12:1 / 9.47:1 | 16.14:1 / 14.80:1 |
| `muted-foreground` on `background` / `card` | 7.14:1 / 7.42:1 | 9.01:1 / 8.26:1 |
| `muted-foreground` on `muted` | 6.42:1 | 6.97:1 |
| `primary-foreground` on `primary` | 5.18:1 | 9.29:1 |
| `secondary-foreground` on `secondary` | 9.57:1 | 12.49:1 |
| `destructive-foreground` on `destructive` | 4.80:1 | 4.70:1 |
| `ring` on `background` (needs 3:1) | 3.51:1 | 9.29:1 |
| `input` on `background` (needs 3:1) | 3.66:1 | 5.95:1 |

What that replaced, kept here because the number is the argument for measuring rather than
intending: the previous cyan accent measured **2.61:1** for white text — below AA and below even the
3:1 large-text floor — on every default button in production, with the focus ring sharing the same
token across 23 components and a form field's border at 1.25:1. Seven pairs failed. The palette that
fixed them came from `ui-ux-pro-max`'s corpus, and its border value failed the 3:1 control-boundary
check as shipped, so `--input` is darkened away from `--border` here.

---

## 6. What no gate here catches

The honest list, because §5's tags make the rest of this document look more enforced than it is.

- **Whether the one table is actually usable at 320px.** Still the sharpest thing no gate here
  catches, and **narrower than it was this morning**. `A11Y-7` moved to `[test]` when the browser
  walk landed, so the layout claim is now measured rather than asserted: the page does not scroll
  sideways in any of the fourteen states at 320px, with the register's own box scrolling inside
  itself by design. What that does *not* touch is whether a sideways-scrolling register is
  pleasant to read on a phone — a measured reflow and a usable one are different claims, and no
  gate can tell them apart. **Walk it on a real phone before trusting this decision.** (The entry
  it replaced, `nested-interactive`, is gone for good: deleted along with the accordion rather
  than patched.)
- **Whether the two open contrast failures matter to a real reader.** The rendered sweep found the
  register's badge at **3.25:1** (`bg-primary/10 text-primary`, i.e. `#0d968b` on `#e7f5f3`) and
  the 404's link at **3.34:1**. Both are listed in `e2e/states.spec.ts`'s `KNOWN_VIOLATIONS`,
  shrink-only, and confessed in `REVIEW-DEBT.md`. Neither is a gate failing to catch something —
  the gate caught them; they are open because the fix is a palette decision and, for the 404, a
  translation. The token test cannot see either: its maths takes two solid tokens and neither of
  these pairs is solid.
- **Whether axe is measuring the screen or the animation.** It caught the walk out once, on the
  first run: `/settings`' tab trigger reported 4.43:1 against 4.5, at 320px and not at 1280px,
  because `animate-fade-in` was still running and axe composites what is painted. The walk now
  waits for every finite animation. A CSS transition begun *after* an assertion would still be
  missed, and `A11Y-6` having no enforcer is a second reason to give it one: an app that honoured
  `prefers-reduced-motion` would have had no animation to wait for.
- **Screen-reader quality, as opposed to the presence of names.** Seven `sr-only` strings in
  `src/components/ui/**` announce in English — "Close", "More pages" — in an otherwise Finnish app,
  and two of them are on components in daily use. App code contains **no** `sr-only` text at all.
  `A11Y-9` exists to name this and has no enforcer.
- **A name that exists but is useless.** axe accepts a `title`-only name, so the search-clear button
  (`title="Tyhjennä haku"`) passes while giving a touch user nothing.
- **Contrast as rendered.** The token test proves the palette can clear AA, never that a screen
  achieves it: it says nothing about a disabled control at 50% opacity, text over a primary-tinted
  surface, or any pair the app starts painting tomorrow. It also cannot see that `--border` at
  1.42:1 is deliberately below 3:1 — legitimate for a divider under WCAG 1.4.11, wrong the moment a
  control is identified by that border alone, and nothing checks which one a given border is doing.
- **Whether the flow makes sense, or an empty state invites action.** Both `[review-only]` in their
  entirety — and §3 has one empty state that actively misleads.
- **Whether the design survives real content.** A 60-character Finnish name, a Student with zero
  attendances, one row, or the ~14 rows this Kurssi actually holds. Nothing generates those.
- **Everything in §2 and §4.** Flows and component boundaries are `[review-only]` by nature.
- **Dark mode is defined and unreachable.** `tailwind.config.ts` sets `darkMode: ["class"]` and
  `index.css` carries a complete `.dark` token set, and the app has no theme provider and two
  `dark:` utilities in total. The token test measures it anyway, so the palette stays honest — but
  no viewer can select it, and its two failures are as unreachable as the mode itself.
