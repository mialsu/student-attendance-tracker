# DESIGN.md — Student Attendance Tracker (client)

The project-once design contract: what the surface is made of, and which of its rules are actually
enforced. Written by `/design-brief` on 2026-09-07, before the first re-skin slice, and re-read
before every one after.

**The scope source is not a brief.** This project predates Stage 0 and has no `PRODUCT-BRIEF.md`,
so §1 reconciles against `CONTEXT.md` plus the feature set actually in production, and §3's
empty/refused/error answers came from the code and from the Owner rather than being carried over
from product altitude. Where the code's answer is wrong, this file says so instead of quietly
re-deciding it. That difference from the template is deliberate and was the Owner's call.

**Deliberately small.** Three things live elsewhere and are only pointed at from here:

| Not in this file | Where it lives | Why not here |
|---|---|---|
| Palette values, type scale, spacing steps | `src/index.css` (HSL custom properties) and `tailwind.config.ts` (type scale, spacing, shadows, `Inter`) | a token table here *plus* tokens in code is two implementations of one thing. §5's contrast table is measured **from** those files by a test, not transcribed |
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

`StudentLogs` is **1100 lines** and renders two complete implementations of one surface — a
`DataTable` above the breakpoint and an `Accordion` below it, each with its own row actions, its own
edit affordance and its own dialogs. That is where the re-skin's cost lives, and where §6's open
question sits. Whether it should stay two implementations is a `/prototype` question, not a prose
one; the deletion test is the thing to apply, and "kept duplicated, deliberately" is a valid answer.

---

## 5. Accessibility — every line names its enforcer

Installed 2026-09-07 (ADR-0004). Before that date this repo had **no** accessibility enforcer and
every row here would have read `[review-only]`. Each gate below was proven by breaking it on
purpose and watching it go red.

| # | Must be true | Enforced by | Tag |
|---|---|---|---|
| A11Y-1 | Every interactive element is reachable *and* operable with the keyboard alone | `live:keyboard-walk` — the primary flow with the mouse unplugged, per `/verify-live` | `[live]` |
| A11Y-2 | Focus is always visible, and focus order follows reading order | `live:keyboard-walk` | `[live]` |
| A11Y-3 | Every control has an accessible name, and no `<img>` is unlabelled | `lint:gate:a11y` (jsx-a11y, ratchet at 0) + `test:surfaces.a11y.test.tsx` (axe, six states) | `[lint]` |
| A11Y-4 | Text clears 4.5:1, and a boundary that identifies a control clears 3:1 | `test:tokens-contrast.test.ts` — computed from `src/index.css`, not from intent | `[test]` |
| A11Y-5 | Nothing conveys meaning by colour alone | nothing — a human has to look. The *Suoritus* badge carries its word, which is why it passes today | `[review-only]` |
| A11Y-6 | `prefers-reduced-motion` is respected | nothing. `animate-fade-in`, `transition-smooth` and `active:scale-[0.98]` all ignore it | `[review-only]` |
| A11Y-7 | Content reflows at 320px with no two-directional scrolling (WCAG 1.4.10) | `live:` the keyboard walk re-run at a 320px viewport. axe's narrow-viewport state proves the *DOM* is sound there, never the layout | `[live]` |
| A11Y-8 | Text stays readable and nothing is cut off at 200% zoom (WCAG 1.4.4) | nothing | `[review-only]` |
| A11Y-9 | No control announces itself in the wrong language | nothing automated — axe reads a name's presence, never its language | `[review-only]` |

Contrast, measured from the real tokens by `src/__tests__/tokens-contrast.test.ts`. Seven failures,
each a shrink-only row in that test's `KNOWN_FAILING` and an entry in `REVIEW-DEBT.md`:

| Foreground on background | Ratio | Verdict |
|---|---|---|
| `foreground` on `background` / `card` | 17.94:1 | AA |
| `muted-foreground` on `background` / `card` | 4.76:1 | AA |
| `secondary-foreground` on `secondary` | 16.42:1 | AA |
| `primary-foreground` on `primary` (light) | **2.61:1** | **fails — below even the 3:1 large-text floor, on every default button in production** |
| `ring` on `background` (light) | **2.61:1** | **fails 1.4.11's 3:1 — the focus ring shares that cyan, across 23 components** |
| `input` on `background` | **1.25:1** light, **1.42:1** dark | **fails — a form field has no perceivable boundary** |
| `destructive-foreground` on `destructive` (light) | **3.78:1** | **fails AA; large text only** |
| `muted-foreground` on `muted` (light) | **4.36:1** | **fails by 0.14** |
| `primary-foreground` on `primary` (dark) | **2.12:1** | **fails** |

The accent has to move for AA, which makes it a constraint on the re-skin rather than a taste
question. `frontend-design` picks the replacement; this file does not.

---

## 6. What no gate here catches

The honest list, because §5's tags make the rest of this document look more enforced than it is.

- **The mobile menu is unreachable by assistive technology, today.** The per-Student menu button is
  a `<button>` inside Radix's `AccordionTrigger` `<button>` — `nested-interactive`, invalid HTML,
  and on a phone that menu is the *only* route to rename, credit or delete. It is gated as a
  shrink-only known violation in `surfaces.a11y.test.tsx` and confessed, not fixed: the fix moves
  the menu out of the trigger and reorders the row, which is a layout change the re-skin should make
  deliberately. **First item for the mobile pass.**
- **Whether a layout that technically reflows is usable.** `A11Y-7` is `[live]` precisely because
  nothing here can tell a table degraded into forty stacked rows from a design.
- **Screen-reader quality, as opposed to the presence of names.** Seven `sr-only` strings in
  `src/components/ui/**` announce in English — "Close", "More pages" — in an otherwise Finnish app,
  and two of them are on components in daily use. App code contains **no** `sr-only` text at all.
  `A11Y-9` exists to name this and has no enforcer.
- **A name that exists but is useless.** axe accepts a `title`-only name, so the search-clear button
  (`title="Tyhjennä haku"`) passes while giving a touch user nothing.
- **Contrast as rendered.** The token test proves the palette can clear AA, never that a screen
  achieves it: it says nothing about a disabled control at 50% opacity, text over the primary-tinted
  count pill, or any pair the app starts painting tomorrow.
- **Whether the flow makes sense, or an empty state invites action.** Both `[review-only]` in their
  entirety — and §3 has one empty state that actively misleads.
- **Whether the design survives real content.** A 60-character Finnish name, a Student with zero
  attendances, one row, or the ~14 rows this Kurssi actually holds. Nothing generates those.
- **Everything in §2 and §4.** Flows and component boundaries are `[review-only]` by nature.
- **Dark mode is defined and unreachable.** `tailwind.config.ts` sets `darkMode: ["class"]` and
  `index.css` carries a complete `.dark` token set, and the app has no theme provider and two
  `dark:` utilities in total. The token test measures it anyway, so the palette stays honest — but
  no viewer can select it, and its two failures are as unreachable as the mode itself.
