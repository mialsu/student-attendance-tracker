# DESIGN.md — Student Attendance Tracker (client)

The project-once design contract: what the surface is made of, and which of its rules are actually
enforced. Written by `/design-brief` on 2026-09-07, and re-read before every slice.

**First slice landed 2026-09-07: variant A, "Tilikirja".** Three directions were built on the real
route and flipped between (`/prototype`, sub-shape A); the Owner chose A's layout, its education-teal
palette, and one table at every width. What that changed is recorded in each section below rather
than appended here. The full variant set is kept on the `proto/lasnaolot-variants` branch — it is
the primary source for the decision, and its code was never promoted.

**The palette is now "Läsnä" indigo — spec 0006 slice 2, 2026-09-10.** A's *layout* decisions all
stand, including one table at every width; only the hues changed. Two of the new values were
measured rather than adopted: `--input` is far darker than the design system's `--border-strong`,
whose own documentation claims it "clears 3:1" while measuring 1.53:1, and `--primary` was darkened
a step so the *Suoritus* badge does not depend on what sits behind it. The badge also stopped being
an alpha composite, which moved it from the browser walk's exemption list into the token test.
**Dark mode was declined** — `.dark` is re-mapped in step and stays unreachable (§6).

**The frame is a persistent sidebar — spec 0006 slice 3, 2026-09-11.** The header is gone on every
width: the brand and the account menu moved into the sidebar, the breadcrumbs to the top of the
main region, and below 940px the whole sidebar becomes an off-canvas drawer. §1, §2 and §4 are
rewritten below rather than appended to. Two things the build taught, both now in §6: a
`hover:opacity-80` carried over from `AppLogo` took 11.2px muted text to **4.28:1**, and the shell
made `main` a flex item, which broke `A11Y-7` in three states until `min-w-0` let it shrink again.

**A note on the numbers in §5 and §6.** They used to be spelled out — "seventeen states", "ten
pairs" — and on 2026-09-11 two of them disagreed inside one section ("thirteen token pairs" in the
`A11Y-4` row against "ten pairs" four lines below it). `CLAUDE.md`'s *Why this file quotes no test
counts* is the rule that applies: **name the command, not the count.**

**The conversion is finished as of slice 4**, and finishing it was not tidiness. Slice 3 converted
the swept-state counts and left `A11Y-4`'s "thirteen token pairs" standing beside a sentence that
already said to run the test — a disclosed contradiction rather than a resolved one. Slice 4 then
added a fourteenth pair, so the stale number became a *wrong* number the same day it was left
alone. That is the whole argument for the rule, demonstrated at a cost of one commit.

**The scope source is not a brief.** This project predates Stage 0 and has no `PRODUCT-BRIEF.md`,
so §1 reconciles against `CONTEXT.md` plus the feature set actually in production, and §3's
empty/refused/error answers came from the code and from the Owner rather than being carried over
from product altitude. Where the code's answer is wrong, this file says so instead of quietly
re-deciding it. That difference from the template is deliberate and was the Owner's call.

**Deliberately small.** Three things live elsewhere and are only pointed at from here:

| Not in this file | Where it lives | Why not here |
|---|---|---|
| Palette values, type scale, spacing steps | `src/index.css` (HSL custom properties — "Läsnä" indigo since 2026-09-10, education teal before that) and `tailwind.config.ts` (type scale, spacing, shadows, `Fira Sans`) | a token table here *plus* tokens in code is two implementations of one thing. §5's contrast table is measured **from** those files by a test, not transcribed |
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
| `/auth` | getting the one teacher in, and nobody else — signup needs a 16-char registration code issued from the CLI. A split-screen since slice 4: an indigo aside naming the app's three functions, and the form | 4 | built |
| `/dashboard` | "the Kurssi she owns, and a way to make another" — since slice 5 each course is a **link** carrying its Student and attendance counts, and a dashed card in the grid opens the create dialog | 0006/5 | built |
| `/class/:id` → *Kirjaa läsnäolo* | the core loop: record who turned up, 1–50 at a time, with name autocomplete | — | built |
| `/class/:id` → *Läsnäolot* | the tally per Student, the course-credit tick, and correcting mistakes (rename, merge, delete) | — | built |
| `/class/:id` → *Tilastot* | four totals, the per-day table, and **one** bar chart carrying a day/month toggle | 0006/6 | built |
| `/settings` | change email, change password | — | built |
| `*` → 404 | the wrong address | — | built, and see below |
| `/` | not a surface — renders `null` and redirects by session (`Index.tsx`) | — | built |
| the shell | not a route: the frame every signed-in surface renders inside — brand, the Kurssi list, settings, the account menu. A drawer below 940px | 0006/3 | built |

- **Surfaces serving nothing:** the 404 is real but was never finished to the standard of the rest.
  It is the only file in the app written in English ("Oops! Page not found", "Return to Home")
  and the only one that bypasses the token system (`bg-gray-100`, `text-gray-600`,
  `text-blue-500`). Everywhere else the discipline holds: one stray `text-green-600` in
  `StudentLogs.tsx`, and nothing else.

  **That sentence said "the **only** file" until slice 5, and it was wrong.** The root breadcrumb
  read **"Dashboard"** — English, on screen, on every signed-in surface, because all three callers
  passed the same literal (`TeacherDashboard.tsx`, `Settings.tsx`, `ClassView.tsx`). It is
  "Kurssit" now, at all three, fixed together rather than only on the surface slice 5 owns. Worth
  keeping as a record of how the claim survived: the word was never in a *page*, so every read of
  this file went looking for an English screen and found only the 404. `AppShell.test.tsx` had
  even been passing `Kurssit` as its fixture since slice 3, which is as close to the answer as a
  test can get without asserting it.

- **Capabilities with no surface — five, and the last one matters most:**
  1. **No way to rename or delete a Kurssi.** `useUpdateClass` and `useDeleteClass` exist at
     `src/hooks/useClasses.ts:31,44` and no component calls either. Dead client code and a gap in
     the same breath. **The sidebar makes this more visible, not less** (slice 3): the course list
     is now on screen at all times with no affordance to manage what it lists. The Owner adopted
     the sidebar knowing that; it is its own spec, and archiving is explicitly out of 0006's scope.
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
- **Switch Kurssi (new, slice 3 — US-6):** from any signed-in surface, the sidebar's course list →
  the Kurssi. No trip back to the dashboard. Below 940px the same list is one tap further away,
  behind *Avaa valikko*, and the drawer closes itself on the way out so the surface it opened is
  not left underneath it. Where you are is marked with `aria-current="page"` — the Kurssi in the
  sidebar, the tab in the breadcrumbs, which is why the breadcrumbs are no longer hidden on a
  phone. Ends early when: the course list failed to load, and the sidebar says so instead of
  showing an empty list (§3).
- **Catch up from paper:** the same flow with a quantity above 1 — 1–50 records sharing one
  timestamp, which is why bulk entry exists.
- **Correct a mistake:** *Läsnäolot* → find the Student (search is debounced 500ms) → rename in
  place, merge into a duplicate, delete a single record, or delete the Student. Ends early when:
  the new name already exists in this Kurssi, and the dialog offers a merge instead.
- **Decide a credit:** *Läsnäolot* → read the tally → tick *Suoritus* by hand. The teacher decides;
  around 14–15 attendances is her rule of thumb and **nothing in the app enforces or displays it**.
- **Get in / get out:** `/auth` → dashboard, and the account chip at the foot of the sidebar →
  logout. Signup additionally needs a registration code. Ends early when: the code is used,
  revoked, expired, or not for that email.
  **The prototype would have broken this half.** Its sidebar chip opens Settings and carries no
  logout at all (`prototype/index.html:556`), so following the visual source of truth literally
  would have deleted the only way out of the app. The chip keeps the dropdown the header owned.

---

## 3. States

Every state is held to **320px** — the narrowest viewport this app supports, set by the Owner on
2026-09-07 and enforced as `A11Y-7`. That is the WCAG 1.4.10 reflow width, so the cheapest
accessibility check available here is also the width decision.

| Surface | Empty | Loading | Refused / error | Success |
|---|---|---|---|---|
| `/dashboard` | "Ei kursseja vielä" as the heading, "Luo ensimmäinen kurssisi yllä olevasta painikkeesta." under it — the shipped sentence, split, and still pointing at the header button rather than carrying a second one | spinner in place of the list | "Kurssien lataaminen epäonnistui" + the retry | the Kurssi list, each card a link naming its two counts, and a dashed card that opens the dialog |
| `/dashboard` — luo uusi kurssi | n/a | the submit becomes "Luodaan..." and disables | toast, `detail` from the API or "Kurssin luominen epäonnistui"; a blank name is refused before the request with "Kurssin nimi on pakollinen" | toast "Kurssi luotu", the dialog closes, the fields clear |
| *Kirjaa läsnäolo* | n/a — the form is always the form | the submit button becomes "Kirjataan…" and disables | toast, `detail` from the API or "Läsnäolon kirjaaminen epäonnistui" | toast, and the field clears |
| *Läsnäolot* | "Ei opiskelijoita vielä" (desktop) / "Ei läsnäoloja kirjattu vielä tälle kurssille" (narrow); searching yields "Ei hakutuloksia haulla …" | Card header stays, body becomes a spinner | "Opiskelijoiden lataaminen epäonnistui" + the retry | rows, tally, and the *Suoritus* tick |
| *Tilastot* | "Ei läsnäoloja näytettäväksi" + "Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot." — the empty branch owns the whole surface, so there is no chart frame and no toggle to press | "Ladataan tilastoja…" | "Tilastojen lataaminen epäonnistui" + the retry | four totals, the per-day table, and one chart whose granularity the *Kaavion jakso* toggle sets — **Päivät** by default, **Kuukaudet** the other. Both granularities are swept, because each draws a different dataset and `A11Y-7` has to hold for both |
| `/settings` | n/a | button disables | toast with the API's `detail` | toast |
| `/auth` — kirjautuminen | n/a | button disables | toast: "Väärä sähköposti tai salasana" | redirect to the dashboard |
| `/auth` — rekisteröityminen | n/a | button disables | toast: "Rekisteröinti epäonnistui"; the two client-side refusals are inline — "Sähköpostin tulee olla oikeassa muodossa", "Salasanat eivät täsmää" | redirect to the dashboard |
| `/class/:id` | n/a | full-surface spinner | redirect to `/dashboard`, silently | the three tabs |
| 404 | n/a | n/a | n/a | English copy, untokenized colours |
| the shell's course list | "Ei kursseja" | one `SidebarMenuSkeleton` row | "Kursseja ei voitu ladata" — muted, and deliberately **not** `role="alert"` | the Kurssi list, each row a link with its Student count |

**The hole is CLOSED — 2026-09-10, spec 0006 slice 1.** For the record of what it was: none of the
three read surfaces consulted its query's `error`. `StudentLogs.tsx`, `TeacherDashboard.tsx` and
`ClassStatistics.tsx` each destructured `data` and `isLoading` and stopped, so a **failed** request
rendered the **empty** state — the dashboard told a teacher who owns a Kurssi that she had none and
invited her to create one, *Läsnäolot* said "no Students yet" about a register holding thirty, and
*Tilastot* told someone with two hundred records to go and record some attendance. Each sentence was
false and actionable in the wrong direction, which is worse than an error message: `ANTI-PATTERNS`
calls a labelled honest empty state the bar, and this was an empty state lying about an error.

It was fixed **before** any restyling, because an error state is one of the four states and a reskin
cannot reconcile a state that does not exist. Three things now hold it shut:

- **One component, three surfaces.** `QueryErrorState.tsx` renders the message, the
  `Tarkista verkkoyhteys ja yritä uudelleen.` hint and a `Yritä uudelleen` button wired to the
  query's own `refetch`. Each surface wraps it in the frame its loading branch already used, and
  each passes its own noun — `Kurssien` / `Opiskelijoiden` / `Tilastojen` `lataaminen epäonnistui` —
  matching the twelve `… epäonnistui` strings the app already had.
- **`src/__tests__/error-states.test.tsx`**, which asserts the error state appears *and* that the
  empty sentence is gone. The second assertion is the one the old code would have survived; each of
  the three `error` branches was neutered individually and exactly its own three tests watched go
  red.
- **Three `— refused` states in `e2e/states.spec.ts`**, through axe with contrast on and past the
  320px reflow measurement at both viewports. Neutering the dashboard branch was watched red there
  too.

**One thing the fix does not change, and it is worth knowing before anyone calls it slow.** `App.tsx:15`
builds a bare `new QueryClient()`, so a failing query retries three times with 1s/2s/4s backoff
before `error` is ever set. The teacher therefore sees the **loading** state for about seven seconds
and only then the error. That is the library's default and it is left alone deliberately: a
transient blip self-heals inside those seven seconds and she never sees a failure at all. If the
delay is ever judged too long, `retry` is the dial and it is a product decision, not a bug.

**The shell's three states are short on purpose, and one of them is a decision.** The failure line
says *"Kursseja ei voitu ladata"* rather than reusing the `… lataaminen epäonnistui` sentence the
surface behind it is already showing, and it carries no `role="alert"`. Two reasons: one failure
should be announced once, not twice, and a second live region would make `getByRole('alert')`
ambiguous in the walk's three `— refused` states, which assert against exactly one. What it does
**not** do is fall through to "Ei kursseja" — that is the quiet form of the defect slice 1 closed,
and `AppShell.test.tsx` asserts the empty sentence is absent, which is the half that holds it.

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

- **`TeacherLayout`** — the signed-in frame: sidebar, then breadcrumbs and the main region beside
  it — used by: dashboard, `/class/:id`, `/settings`
- **`AppSidebar`** — brand, the Kurssi list with counts, settings, the account chip — used by:
  `TeacherLayout`
- **`UserMenu`** — the account chip and its dropdown, and the only route to logging out — used by:
  `AppSidebar`
- **`Breadcrumbs`** — used by: `TeacherLayout`, at the top of the main region and at every width
- **`ui/sidebar.tsx`** — shadcn's shell primitive, reused rather than rebuilt, with three
  deliberate edits: no `sidebar:state` cookie, no `Cmd/Ctrl+B` (it slid the nav off-screen with no
  way back), and an `sr-only` `SheetTitle` so the drawer is not an unnamed dialog

**`AppHeader` and `AppLogo` are deleted, not kept unused** (slice 3). The prototype has no header
at any width, so everything they carried has a new home, and `A11Y-3`'s row below no longer cites
them. The `hidden sm:inline` defect they were the record of is worth keeping in mind rather than in
a file: the drawer is 18rem wide at a 320px viewport, so a `sm:`-gated label inside it is invisible
to *everyone*, and `UserMenu`'s header trigger would have reproduced the bug exactly.
- **`ProtectedRoute`** — refuses a surface until the session is known — used by: dashboard,
  `/class/:id`, `/settings`
- **`DataTable`** (`src/components/ui/data-table.tsx`) — the desktop table: columns, row actions,
  expansion, pagination — used by: *Läsnäolot*
- **`PublicNav`** — the signed-out header — used by: `/auth`, and only `/auth`. It stays above the
  split-screen rather than being dropped for a full-bleed panel the way the prototype draws it,
  which is why the aside carries **no brand of its own**: the wordmark is already on the page, and
  a second one would be the "two words for one thing" the drift gate exists to catch.
- **the auth aside** (`src/pages/Auth.tsx`) — one element, two shapes. Above `shell` it is the
  indigo gradient panel: a display line, the lede, and the three functions. Below `shell` the
  gradient, the display line and the functions all go and the **lede stays**, as muted text above
  the form. The lede is a single DOM node in both shapes — not two behind `hidden` — because the
  same string twice is the duplicate-text trap slice 3 hit in `e2e/auth.spec.ts`.
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
| A11Y-3 | Every control has an accessible name, and no `<img>` is unlabelled | `lint:gate:a11y` (jsx-a11y, ratchet at 0) + `test:surfaces.a11y.test.tsx` (axe, six states, jsdom) + `test:e2e/states.spec.ts` (axe, every state in `e2e/states.spec.ts`'s table, real browser). The third one is the only one that could catch what it caught: `AppLogo` and `UserMenu` both hid their only text with `hidden sm:inline`, so below 640px each was a nameless control on every signed-in surface. jsx-a11y reads the span in the JSX; jsdom applies no media query | `[lint]` |
| A11Y-4 | Text clears 4.5:1, and a boundary that identifies a control clears 3:1 | `test:tokens-contrast.test.ts` — every pair in its `PAIRS` table computed from `src/index.css`, not from intent, in both `:root` and `.dark`; run it for the count — **and** `test:e2e/states.spec.ts`, axe with `color-contrast` enabled over every rendered state in `e2e/states.spec.ts`'s table. The second half is not a duplicate: the token test proves the palette and cannot express an alpha composite. Three pairs were added on 2026-09-10 by making the badge solid and by asserting `--input` against `--card` as well as the page, which is why only the 404 is still exempt. Slice 4 added the first **gradient** pair: the auth aside runs `--primary` → `--auth-aside-to` under `--primary-foreground` text, and gating the two endpoints gates the span because every channel moves monotonically between them. The prototype's own third stop measured **3.28:1** there and no gate could see it — axe returns `color-contrast` as *incomplete* over a gradient and `e2e/assertions.ts:111` reads only `violations` | `[test]` |
| A11Y-5 | Nothing conveys meaning by colour alone | nothing — a human has to look. The *Suoritus* badge carries its word, which is why it passes today | `[review-only]` |
| A11Y-6 | `prefers-reduced-motion` is respected | nothing. `animate-fade-in`, `transition-smooth` and `active:scale-[0.98]` all ignore it | `[review-only]` |
| A11Y-7 | Content reflows at 320px with no two-directional scrolling (WCAG 1.4.10) | `test:e2e/states.spec.ts` — `documentElement.scrollWidth <= clientWidth` in every state of `e2e/states.spec.ts`'s table at 320px, measured after `document.fonts.ready` so the widths are Fira Sans's and not system-ui's — Fira **stays** under spec 0006, so these measurements were not re-opened by the reskin. It **passes on all of them**, the three error states and the drawer included, and it caught one real failure on the way in: the *Tilastot* charts forced the page to 760px. An inner container that scrolls is deliberate and allowed; the document scrolling is not. **Second enforcer since slice 5: `expectOverlayWithinViewport`**, because the first one is structurally blind to every overlay — a `position: fixed` element is out of flow and adds nothing to document overflow. Measured, not argued: a `min-w-[34rem]` put on `DialogContent` on purpose rendered the create-course dialog **520px wide from x=-100 to x=420** at a 320px viewport, a third of it unreachable off each edge, while `documentElement.scrollWidth` stayed exactly **320** and the state swept clean. The new check measures the box of any open `[role="dialog"]` — the dialog and the drawer, the shell's whole navigation below 940px — and was watched red on that same break and green once it was reverted | `[test]` |
| A11Y-8 | Text stays readable and nothing is cut off at 200% zoom (WCAG 1.4.4) | nothing | `[review-only]` |
| A11Y-9 | No control announces itself in the wrong language | nothing automated — axe reads a name's presence, never its language | `[review-only]` |

Contrast, measured from the real tokens by `src/__tests__/tokens-contrast.test.ts` in each theme,
and **every pair clears** since variant A's palette landed. That test's `KNOWN_FAILING` list is
empty for the first time. (This sentence used to carry its own count and disagree with the
`A11Y-4` row; both now name the test instead — see the note at the top of this file.)

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
  sideways in any swept state at 320px, with the register's own box scrolling inside
  itself by design. What that does *not* touch is whether a sideways-scrolling register is
  pleasant to read on a phone — a measured reflow and a usable one are different claims, and no
  gate can tell them apart. **Walk it on a real phone before trusting this decision.** (The entry
  it replaced, `nested-interactive`, is gone for good: deleted along with the accordion rather
  than patched.)
- **Whether the ONE open contrast failure matters to a real reader.** It was two until
  2026-09-10; the register's badge at 3.25:1 is closed, and closed structurally — it stopped being
  `bg-primary/10 text-primary` and became the solid `--accent` / `--accent-foreground` pair, so it
  is asserted by the token test in both themes rather than being visible only to axe. What remains
  is the **404's link at 3.34:1**, still in `e2e/states.spec.ts`'s `KNOWN_VIOLATIONS`, shrink-only,
  and confessed in `REVIEW-DEBT.md`. The palette change could not touch it: that file bypasses the
  token system altogether, so it needs tokenizing *and* translating. Not a gate failing to catch
  something — the gate caught it.
- **A gradient with a stop in the middle.** Slice 4 brought the auth aside inside the token test
  by reducing its gradient to two endpoints and asserting both — sound only because every channel
  moves monotonically between them, so the ends bracket every pixel. Add a third stop to
  `bg-auth-aside` and that stops being true: `tokens-contrast.test.ts` reads the two tokens it is
  told about, axe reports contrast over a gradient as *incomplete*, and `assertions.ts:111` keeps
  only `violations`. **Nothing would go red.** The rule, since no gate states it: a stop in an
  app gradient is a token, or it is unmeasured.
- **Whether axe is measuring the screen or the animation.** It caught the walk out once, on the
  first run: `/settings`' tab trigger reported 4.43:1 against 4.5, at 320px and not at 1280px,
  because `animate-fade-in` was still running and axe composites what is painted. The walk now
  waits for every finite animation. A CSS transition begun *after* an assertion would still be
  missed, and `A11Y-6` having no enforcer is a second reason to give it one: an app that honoured
  `prefers-reduced-motion` would have had no animation to wait for.
- **Which element the pointer is resting on, and therefore whose `:hover` gets measured.** Slice 3
  found the second form of the row above, and this one was a **real defect rather than an
  artifact**. The drawer slides in from the left underneath a stationary mouse that had just
  clicked the trigger at the top-left of main, so the pointer came to rest on the drawer's brand
  link — and axe measured its hover state: `hover:opacity-80` over `AppLogo`'s inherited styling
  took 11.2px `--muted-foreground` from 6.95:1 to **4.28:1**. The tell was the ratio *drifting*
  between runs (4.28, 4.34, 4.41) while `getComputedStyle` read the settled colour, because the
  hover transition was still easing. Both halves are fixed — the brand tints its background
  instead of dimming, and the sweep parks the pointer — but the general case stands: **no gate
  checks contrast in a hover, focus or active state**, and `tokens-contrast.test.ts` cannot, since
  those are composites rather than token pairs.
- **Whether a dialog has an accessible name.** The drawer shipped nameless in the first draft and
  the walk swept it **clean**: axe's `aria-dialog-name` is tagged `best-practice`, and
  `e2e/assertions.ts` runs only `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`. Closed for this one
  dialog by `AppShell.test.tsx`, which asserts the name directly and was watched failing without
  it; not closed as a *class*, because the next dialog added to this app will be just as invisible
  to the tag set. Widening the tags would be the real fix and would open a baseline nobody has
  measured.
- **Whether the main region can shrink.** Making the shell a flex row broke `A11Y-7` in three
  states at once: a flex item's `min-width` defaults to `auto`, so `main` could not go below the
  register's `min-w-[34rem]` and the page measured 809px at a 320px viewport. The walk caught it,
  and `min-w-0` fixed it — but nothing states the rule, so the next layout change is free to
  reintroduce it and will only be caught if the offending content happens to be in a swept state.
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
  entirety. §3 used to carry an empty state that actively misled; that one is closed, and the
  three error states are now swept by the walk.
- **Whether the design survives real content.** A 60-character Finnish name, a Student with zero
  attendances, one row, or the ~14 rows this Kurssi actually holds. Nothing generates those.
- **Everything in §2 and §4.** Flows and component boundaries are `[review-only]` by nature.
- **Dark mode is defined and unreachable.** `tailwind.config.ts` sets `darkMode: ["class"]` and
  `index.css` carries a complete `.dark` token set, and the app has no theme provider and two
  `dark:` utilities in total. The token test measures it anyway, so the palette stays honest — but
  no viewer can select it, and its two failures are as unreachable as the mode itself.
