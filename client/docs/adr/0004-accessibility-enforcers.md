# ADR-0004 — accessibility gets three enforcers, and contrast is not one of axe's

Until 2026-09-07 this repo had no accessibility enforcer of any kind. `CODING_STANDARDS.md` said so
plainly and every rule was `[review-only]`; `scripts/drift-check.sh` check 8 — which fails any
`A11Y-n` row in `DESIGN.md` that names no enforcer — was installed and inert because `DESIGN.md`
did not exist. `/design-brief` created that file, which turns the dead gate live, so the rows had
to name something real or the exercise would have produced the pseudo-artifact it exists to avoid.

Two devDependencies were added: **`eslint-plugin-jsx-a11y` 6.10.2** and **`axe-core` 4.13.0**.
Three enforcers came out of them, and the third is the interesting one.

**1. `npm run gate:a11y` — jsx-a11y on its own ratchet at baseline 0.** The rules also live in the
main `eslint.config.js` (spread from `eslint.a11y.config.js`, one source of truth) so the editor
and `npm run lint` see them. They are *additionally* run alone, because `baseline-guard.sh` counts
problems and cannot identify them: folded into the `lint` number at baseline 16, a new a11y error
could be netted out against an unrelated lint fix. On its own ratchet at 0, any a11y error fails.

The opening measurement was **7 findings**, small enough to fix rather than baseline. Four were
fixed, three were config-scoped: `heading-has-content` and `anchor-has-content` are off for
`src/components/ui/**` only, because those shadcn primitives forward children through `{...props}`
and the rules fire on `<h3 {...props} />` without being able to see what the caller passes. The
scoping was proven — a contentless `<h1>` in `src/pages` still fails.

**2. `src/components/__tests__/surfaces.a11y.test.tsx` — axe over rendered surfaces, per state.**
Six states: the logging form idle and mid-submit, Läsnäolot empty, loading, populated, and
populated below the breakpoint where it renders an accordion instead of a table. It found two
defects the linter structurally could not: three icon-only buttons with no accessible name (the
per-row edit control, invisible to the linter because `Button` is a component), and
`nested-interactive` on the mobile accordion — the per-student menu is a `<button>` inside Radix's
trigger `<button>`, so on a phone an assistive-technology user cannot reach the only route to edit,
credit or delete. The names were fixed. The nesting is a shrink-only known violation with a
`REVIEW-DEBT.md` entry, because its fix reorders the row and this session held layouts.

**3. `src/__tests__/tokens-contrast.test.ts` — contrast measured over the token pairs, not by axe.**
This is the decision worth recording. axe is the obvious tool for contrast and it **cannot do the
job in this test environment**: `color-contrast` needs a layout engine to know what is painted
behind what, and jsdom has neither layout nor paint, so axe returns the check as *incomplete* —
neither pass nor failure, and trivially mistaken for a pass. Wiring axe and believing contrast was
covered would have been strictly worse than leaving the row `[review-only]`, which is the whole
argument of the pseudo-artifact anti-pattern.

Every ratio in this app derives from a token pair declared in `src/index.css`, so the pair is the
honest unit. The test parses the `:root` and `.dark` blocks, computes WCAG relative luminance, and
asserts 4.5:1 for text and 3:1 for a boundary that identifies a control, over the ten pairs the app
actually paints. It opened with **seven real AA failures**, `primary-foreground` on `primary` at
**2.61:1** — white on the cyan accent, below even the 3:1 large-text floor, on every default button
in production — chief among them.

## Rejected alternatives

- **Playwright, the web profile's third enforcer.** It is the only way to get a real browser, which
  is the only way to make `A11Y-1`, `A11Y-2` and `A11Y-7` automated rather than human-run, and it
  is what makes axe's contrast rule work. Rejected for now on cost: a new runner, new CI time and a
  new fixture set for a project whose whole suite runs in 3 seconds. The consequence is honest and
  written into `DESIGN.md` — the keyboard walk and the 320px reflow check are `[live]`, run by a
  human, and `DESIGN.md` §6 says what that leaves unproven. Revisit when a second surface or a
  second user arrives.
- **Fold jsx-a11y into the existing `lint` ratchet.** Simpler, one number, and rejected for the
  substitution hole above.
- **Baseline the 7 findings instead of fixing them.** Rejected because 7 is small, and a gate that
  starts at 7 teaches everyone the number is negotiable. Four fixes and three scoped rules got the
  ratchet to 0, which is a bar that means something.
- **`jest-axe` / `vitest-axe` matcher wrappers.** Rejected in favour of calling `axe.run` directly:
  one dependency instead of two, no matcher-compatibility question against Vitest 4, and the
  assertion message is ours to write — it names the state and the rule ids.
- **Assert contrast with a hand-maintained table of ratios in prose.** That is what `DESIGN.md`
  would have held, and an intended ratio is not a ratio. The values live in code and the test reads
  them from the same file the app does, so the two cannot drift.
- **Fix the failing tokens in this session.** Rejected on ownership, not on effort: `frontend-design`
  owns the palette (METHOD.md's reuse table) and devkit does not pick colours. The failures are
  recorded as a shrink-only ratchet so the re-skin has to clear them rather than choose around them.

## Consequences

`gate:a11y` is in `npm run check` and therefore in the pre-commit hook and CI. Both ratchets are
shrink-only: fix a listed contrast pair or the nested-interactive defect and its test **fails**,
telling you to delete the row — the same "ground you cannot give back" rule as `.harness-baseline`.
Adding a row to either list needs a `REVIEW-DEBT.md` entry in the same commit.

The 4 fixed lint findings and 3 fixed missing names changed behaviour in two places worth knowing:
the mobile edit dialog lost a redundant `autoFocus` (Radix already focuses the first field, and the
DOM order was checked), and the per-row edit button now reveals itself on `focus-visible` as well as
hover — it was reachable by Tab while fully transparent.
