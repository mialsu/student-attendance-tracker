/**
 * The state sweep: every state `DESIGN.md` §3 lists, at both viewports, through axe with contrast
 * on and past the `A11Y-7` reflow measurement.
 *
 * Organised **by state, not by journey**, and that is the one structural decision in this file.
 * `specgate`'s `REVIEW-DEBT.md` records why: its walk caught a real `color-contrast` and a real
 * `heading-order` only because a state existed in the walk to catch them in, and *"adding a state
 * is a manual act nobody is prompted to perform."* A journey visits the states it happens to
 * cross; a table names the ones that must exist.
 *
 * **Four states per read surface since 2026-09-10 — the error state has arrived.** It used to be
 * absent on purpose: all three read surfaces rendered a *failed* request as the *empty* state,
 * because `StudentLogs.tsx`, `TeacherDashboard.tsx` and `ClassStatistics.tsx` each destructured
 * `data` and `isLoading` and never consulted `error`, so asserting anything would have locked the
 * defect in. `DESIGN.md` §3 called it "one bug in three places". Spec 0006 slice 1 fixed it, and
 * the three `— refused` states below are the half of that fix that keeps it fixed: revert any one
 * `error` branch and its state here goes red. This is the note that said "when it is fixed, the
 * fourth state joins this table" — it has.
 */
import { EMPTY_REGISTER, KURSSI, LONGEST_NAME, NO_STATISTICS } from './rows';
import {
  failing,
  noKurssi,
  oneKurssi,
  pending,
  register,
  RETRY_BACKOFF_MS,
  ROUTES,
  signedIn,
  statistics,
  statisticsByRange,
} from './mocks';
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectOverlayWithinViewport,
} from './assertions';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

type SweptState = {
  /** Surface and state, as `DESIGN.md` §3 names them. Also the failure label. */
  name: string;
  /** Mocks, before anything navigates. */
  arrange: (page: Page) => Promise<void>;
  /** Navigate, then wait for the state to be on screen — never a timer. */
  reach: (page: Page) => Promise<void>;
};

const classUrl = `/class/${KURSSI.id}`;

/** Open one of the three tabs and wait for its own content, not for the tab button. */
async function openTab(page: Page, name: string, ready: RegExp | string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByText(ready).first()).toBeVisible();
}

/**
 * Open *Tilastot* and wait for the aggregates, which is where the timeframe filter lives.
 *
 * Waiting on the loading text to go is what the two aggregates states already do, and it is the
 * right wait here too: the filter renders in the loaded branch, so its presence is the signal.
 */
async function openTilastot(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Tilastot' }).click();
  await expect(page.getByText('Ladataan tilastoja...')).toBeHidden();
  await expect(page.getByLabel('Alkaen')).toBeVisible();
}

/**
 * Pick a day from one end's calendar, by its number in the open grid.
 *
 * **The tenth, and it is chosen rather than arbitrary.** The calendar opens on the current month
 * and refuses future days, so the day has to be one that has already happened whenever the walk
 * runs — and it has to be unambiguous in the grid, which rules out the first few and last few days
 * where a neighbouring month's padding shows the same numbers. The 10th satisfies both for any
 * month, on any day from the 10th onward. `exact` is what makes the strictness real: without it
 * Playwright's string form matches a substring, so "10" would also find 1 and 30.
 */
async function pickDay(page: Page, end: string, day = '10'): Promise<void> {
  await page.getByLabel(end).click();
  await page.getByRole('gridcell', { name: day, exact: true }).click();
  await page.keyboard.press('Escape');
}

const STATES: SweptState[] = [
  {
    name: '/auth — the form',
    arrange: async () => {},
    reach: async (page) => {
      await page.goto('/auth');
      await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible();
    },
  },
  {
    /*
     * Added by spec 0006 slice 4, and it is a state `DESIGN.md` §3 always implied without the
     * sweep ever entering it: signup is the same surface with three more controls, one of them
     * carrying the registration-code hint this slice rewrote. The file header's argument applies
     * exactly — "a journey visits the states it happens to cross" — and no journey here signs up.
     *
     * At 320px it is also the tallest, widest form the app has, which makes it the `A11Y-7`
     * measurement that actually bites on this surface.
     */
    name: '/auth — rekisteröityminen',
    arrange: async () => {},
    reach: async (page) => {
      await page.goto('/auth');
      await page.getByRole('button', { name: 'Ei tiliä? Rekisteröidy' }).click();
      await expect(page.getByRole('heading', { name: 'Rekisteröidy' })).toBeVisible();
      await expect(page.getByLabel('Rekisteröintikoodi', { exact: true })).toBeVisible();
    },
  },
  {
    name: '/dashboard — loading',
    arrange: async (page) => {
      await signedIn(page);
      await pending(page, ROUTES.classList);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: 'Kurssit' })).toBeVisible();
    },
  },
  {
    name: '/dashboard — empty, no Kurssi yet',
    arrange: async (page) => {
      await signedIn(page);
      await noKurssi(page);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      await expect(page.getByText(/Ei kursseja vielä/)).toBeVisible();
    },
  },
  {
    name: '/dashboard — one Kurssi',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      await expect(page.getByText(KURSSI.name).first()).toBeVisible();
    },
  },
  {
    // A dialog is the state most worth sweeping and the one a component test cannot judge: axe
    // reads the real focus trap and the real contrast over the overlay, and `A11Y-7` measures a
    // fixed-position panel at 320px, where a dialog overflows more readily than a page does.
    // Reached through the dashed card rather than the header button on purpose — that is the
    // affordance slice 5 added, so this is also the only place the walk exercises it.
    // `exact` is what makes that last sentence true. Playwright's string form of `name` matches a
    // case-insensitive SUBSTRING, so without it the header's "Lisää uusi kurssi" matches as well:
    // two candidates once the cards render (a strict-mode violation), one before they do. This
    // state therefore passed by clicking the header button on every run where the click resolved
    // first, and failed only under the load of the full `npm run check`. `auth.spec.ts` carries
    // the same flag on 'Kirjaudu' for the same reason.
    name: '/dashboard — luo uusi kurssi',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'Uusi kurssi', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Luo uusi kurssi' })).toBeVisible();
      // The panel animates in, and axe must not sample it mid-transition — the same
      // nondeterminism the drawer state documents above.
      await expect(page.getByRole('dialog', { name: 'Luo uusi kurssi' })).toHaveCSS('opacity', '1');
    },
  },
  {
    // The one that could do real damage: as the empty state, this invited her to create a course
    // she already owns. Asserting the invitation is GONE is the half that holds the fix.
    name: '/dashboard — refused',
    arrange: async (page) => {
      await signedIn(page);
      await failing(page, ROUTES.classList);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('alert')).toContainText('Kurssien lataaminen epäonnistui', {
        timeout: RETRY_BACKOFF_MS,
      });
      await expect(page.getByText(/Ei kursseja vielä/)).toBeHidden();
    },
  },
  {
    name: '/class/:id — loading the Kurssi',
    arrange: async (page) => {
      await signedIn(page);
      await pending(page, ROUTES.classDetail);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await expect(page.getByText('Ladataan kurssia...')).toBeVisible();
    },
  },
  {
    name: 'Läsnäolon kirjaus — the logging form',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await expect(page.getByText('Kirjaa opiskelijan läsnäolo')).toBeVisible();
    },
  },
  {
    name: 'Läsnäolot — loading',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await pending(page, ROUTES.summary);
      await mockAutocomplete(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTab(page, 'Läsnäolot', 'Opiskelijoiden läsnäolot');
    },
  },
  {
    name: 'Läsnäolot — empty, no Students yet',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page, EMPTY_REGISTER);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTab(page, 'Läsnäolot', 'Opiskelijoiden läsnäolot');
      await expect(page.getByText(/Ei opiskelijoita vielä|Ei läsnäoloja kirjattu/)).toBeVisible();
    },
  },
  {
    name: 'Läsnäolot — the register, including a 32-character name',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTab(page, 'Läsnäolot', 'Opiskelijoiden läsnäolot');
      await expect(page.getByText(LONGEST_NAME)).toBeVisible();
    },
  },
  {
    name: 'Läsnäolot — refused',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await failing(page, ROUTES.summary);
      await failing(page, ROUTES.autocomplete);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      // The Card header renders in the error branch too, so the tab is reached the same way.
      await openTab(page, 'Läsnäolot', 'Opiskelijoiden läsnäolot');
      await expect(page.getByRole('alert')).toContainText(
        'Opiskelijoiden lataaminen epäonnistui',
        { timeout: RETRY_BACKOFF_MS },
      );
      await expect(page.getByText('Ei opiskelijoita vielä')).toBeHidden();
    },
  },
  {
    name: 'Tilastot — loading',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await pending(page, ROUTES.statistics);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await page.getByRole('tab', { name: 'Tilastot' }).click();
      await expect(page.getByText('Ladataan tilastoja...')).toBeVisible();
    },
  },
  {
    name: 'Tilastot — empty',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await statistics(page, NO_STATISTICS);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTab(page, 'Tilastot', 'Ei läsnäoloja näytettäväksi');
    },
  },
  {
    name: 'Tilastot — the aggregates',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await statistics(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await page.getByRole('tab', { name: 'Tilastot' }).click();
      await expect(page.getByText('Ladataan tilastoja...')).toBeHidden();
    },
  },
  {
    // The other half of AC9's toggle. Worth its own swept state rather than a click inside the
    // one above: the month view draws a different number of bars from a different dataset, and
    // both `A11Y-7` at 320px and axe over the chart have to hold for each. The daily view is the
    // default, so it is the state above.
    name: 'Tilastot — the aggregates, by month',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await statistics(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await page.getByRole('tab', { name: 'Tilastot' }).click();
      await expect(page.getByText('Ladataan tilastoja...')).toBeHidden();
      await page.getByRole('radio', { name: 'Kuukaudet' }).click();
      await expect(page.getByText('Läsnäolot kuukausittain (kaavio)')).toBeVisible();
    },
  },
  {
    /*
     * Spec 0008 AC-15, and the half no component test can judge: an OPEN calendar popover at
     * 320px. `ClassStatistics.test.tsx` renders the same popover in jsdom, where it has no
     * geometry at all — a `position: fixed` panel measures nothing there, so nothing in that file
     * can see a calendar hanging off the edge of a phone.
     *
     * It is also the state `expectOverlayWithinViewport` was written for. Radix's PopoverContent
     * is a `[role="dialog"]`, so the calendar's box is measured the way the create-course dialog's
     * is — and unlike document overflow, which a fixed element contributes nothing to, that check
     * can actually fail here.
     */
    name: 'Tilastot — the timeframe, calendar open',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await statistics(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTilastot(page);
      await page.getByLabel('Alkaen').click();
      // The popover animates in, and axe must not sample it mid-transition — the same
      // nondeterminism the drawer and the create-course dialog document above.
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
      await expect(page.getByRole('gridcell', { name: '10', exact: true })).toBeVisible();
    },
  },
  {
    /*
     * The filter carrying a timeframe, with figures behind it. Worth its own state rather than a
     * click inside the aggregates one: a set range adds the *Tyhjennä aikaväli* action and puts a
     * date into both triggers, so it is a different layout to reflow at 320px and a different set
     * of colours for axe to read.
     */
    name: 'Tilastot — the timeframe set, with figures',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      // Answers every request with the same figures, range or not, so this state is the filter
      // rather than the filtering.
      await statistics(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTilastot(page);
      await pickDay(page, 'Alkaen');
      await expect(page.getByRole('button', { name: 'Tyhjennä aikaväli' })).toBeVisible();
      await expect(page.getByText('Päivät valitulla aikavälillä')).toBeVisible();
    },
  },
  {
    /*
     * The fifth state, and `DESIGN.md` §3's new *Tilastot* row. The one that had to exist: with
     * the four totals filtered (spec 0008 decision 5), an empty September is `total_records === 0`
     * exactly like a Kurssi that has never been used — so without this branch the teacher holding
     * hundreds of records gets told to go and log some. That is the defect §3 calls "an empty
     * state lying about an error", and spec 0006 already fixed it once on this same surface.
     */
    name: 'Tilastot — an empty timeframe',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      // Figures with no range, nothing with one — so the filter is operable before it empties.
      await statisticsByRange(page);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await openTilastot(page);
      await pickDay(page, 'Alkaen');
      // Not pinned to a formatted date: the walk's clock decides the month, and AC-9's own test
      // owns the serialization. What matters here is that the sentence names a timeframe at all.
      await expect(page.getByText(/ei ole kirjattuja läsnäoloja/)).toBeVisible();
      // The advice for a teacher who has never logged anything must be GONE, which is the half
      // that holds the fix — the same assertion the three `— refused` states make.
      await expect(page.getByText('Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot.')).toBeHidden();
      // And the way out is on screen (US-17).
      await expect(page.getByRole('button', { name: 'Tyhjennä aikaväli' })).toBeVisible();
    },
  },
  {
    name: 'Tilastot — refused',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
      await register(page);
      await failing(page, ROUTES.statistics);
    },
    reach: async (page) => {
      await page.goto(classUrl);
      await page.getByRole('tab', { name: 'Tilastot' }).click();
      await expect(page.getByRole('alert')).toContainText('Tilastojen lataaminen epäonnistui', {
        timeout: RETRY_BACKOFF_MS,
      });
      await expect(page.getByText(/Ei läsnäoloja näytettäväksi/)).toBeHidden();
    },
  },
  {
    // `oneKurssi` is new here as of slice 3 and is not padding: the sidebar lists the teacher's
    // courses on EVERY signed-in surface, so /settings now fetches the class list too. Without
    // the mock, `fixtures.ts`'s guard 501s it and fails the test at teardown — which is the guard
    // doing its job, and the reason this line is here rather than the shell silently erroring.
    name: '/settings',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
    },
    reach: async (page) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible();
    },
  },
  {
    // The shell's own state. Below 940px the navigation is an off-canvas Radix dialog over a
    // scrim — which nothing swept before, and which is where a trapped scroll or an unreadable
    // overlay would hide; above it the sidebar is simply on screen. Both are the state "the
    // navigation is visible", so this sweeps at both viewports rather than skipping one: a
    // `test.skip` here would also have tripped the drift gate's escape-hatch check, correctly,
    // since a skipped test and a silenced one look identical to it.
    name: 'Valikko — the navigation, however the width serves it',
    arrange: async (page) => {
      await signedIn(page);
      await oneKurssi(page);
    },
    reach: async (page) => {
      await page.goto('/dashboard');
      // The trigger exists only while the shell is collapsed, so its presence IS the width
      // question — no viewport branch needed. The assertion below is unconditional either way.
      const open = page.getByRole('button', { name: 'Avaa valikko' });
      if (await open.count()) {
        await open.click();
        // Wait for the slide to finish before anything measures. `toHaveCSS` polls the real
        // computed style, so this is not the timer ADR-0005 forbids.
        await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
        // Park the pointer out of the way, and this line earned its place. The drawer slides in
        // from the left *underneath a stationary mouse*, which had just clicked the trigger at
        // the top-left of main — so the pointer ended up resting on the drawer's brand link and
        // axe sampled its :hover state. That found a real defect (a `hover:opacity-80` dimming
        // 11.2px muted text to 4.28:1, now fixed in AppSidebar), but as a swept state it is
        // wrong twice over: it measures hover on whichever element the layout happens to put
        // under the cursor, and the ratio it reports drifts with the transition, which is
        // exactly the nondeterminism `retries: 0` claims this walk does not have.
        await page.mouse.move(0, 639);
      }
      // Scoped to the sidebar, and it has to be since slice 5: the dashboard's own course cards
      // are links now too, so an unscoped match finds two on desktop and fails strictly. At 320px
      // it happened to find one — Radix marks the page behind an open drawer `aria-hidden`, so
      // the card was out of the accessibility tree — which is exactly the kind of accidental pass
      // a scope makes impossible. `data-sidebar="sidebar"` is on both the desktop and the drawer
      // branch of `ui/sidebar.tsx`, so one selector serves both viewports.
      await expect(
        page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: /Matematiikka MAA5/ }),
      ).toBeVisible();
    },
  },
  {
    name: '404 — the wrong address',
    arrange: async () => {},
    reach: async (page) => {
      await page.goto('/ei-ole-olemassa');
      await expect(page.getByRole('heading', { name: 'Sivua ei löytynyt' })).toBeVisible();
    },
  },
];

/** *Läsnäolot* asks for autocomplete on mount even with no query. */
async function mockAutocomplete(page: Page): Promise<void> {
  await page.route(ROUTES.autocomplete, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

/**
 * Two rendered contrast failures stand, both recorded in `REVIEW-DEBT.md` on 2026-09-07, and both
 * are palette or copy decisions rather than plumbing — which is why they are listed here instead
 * of quietly fixed.
 *
 * - **The register's badge**: `Badge variant="default"` is `bg-primary/10 text-primary`, which
 *   renders `#0d968b` on `#e7f5f3` = **3.25:1** against a 4.5:1 requirement. No unit test could
 *   have caught it: `src/__tests__/tokens-contrast.test.ts` asserts `primary-foreground` on
 *   `primary` — white on solid teal, the Button — and has no way to express a 10%-alpha composite
 *   over a Card. `destructive` has the same shape and will surface the day a destructive badge
 *   renders in a swept state.
 * - **The 404**: `text-blue-500` on `bg-gray-100` = **3.34:1**. `DESIGN.md` §1 already names this
 *   surface as the only untokenized, English one in the app, so the fix is a re-skin and a
 *   translation, not a colour tweak.
 *
 * A third row is a standoff between two of this repo's own gates. axe wants the register's scroll
 * container keyboard-reachable when it holds nothing focusable — which is the **empty** state, at
 * 320px only — and `jsx-a11y/no-noninteractive-tabindex` refuses the `tabIndex={0}` that fixes it.
 * Satisfying both means giving `ui/table.tsx` and `ui/data-table.tsx` a labelling API and allowing
 * `region` in the lint rule, which is a design decision about two shared primitives. `REVIEW-DEBT`
 * carries it.
 *
 * Shrink-only in both directions — see `expectNoAxeViolations`.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // The register's two `color-contrast` rows are GONE — deleted 2026-09-10, spec 0006 slice 2.
  // The *Suoritus* badge measured 3.25:1 as `bg-primary/10 text-primary`; `badge.tsx` now paints
  // the solid `--accent` / `--accent-foreground` pair at 5.61:1 light and 4.98:1 dark, and that
  // pair is asserted by `tokens-contrast.test.ts` — so the check moved from "only axe can see it"
  // to gated in both themes. This ratchet is what forced the deletion: it failed with
  // "Saw: nothing" and named the rows, which is the half that stops ground being given back.
  //
  // The 404's two rows are GONE — deleted 2026-09-12, spec 0006 slice 8. That file bypassed the
  // token system entirely (`bg-gray-100`, `text-gray-600`, `text-blue-500`) and its link measured
  // 3.34:1, which no palette change could reach. It is on `--background`, `--muted-foreground`
  // and `--primary` now, and `tokens-contrast.test.ts` pins the link's pair in both themes. This
  // ratchet is shrink-only in both directions, so leaving these rows here after the fix would
  // have failed the run with "Saw: nothing" — which is the half that stops ground being given
  // back quietly.
  // Keyed by viewport as well as state, and this row is why: the empty register scrolls only
  // where 34rem does not fit, so at 1280px there is no scrollable region and nothing to report.
  // A state-only key would have demanded this violation at desktop too, and failed there.
  'reflow-320 · Läsnäolot — empty, no Students yet': ['scrollable-region-focusable'],
};

for (const swept of STATES) {
  test(swept.name, async ({ page }, testInfo) => {
    await swept.arrange(page);
    await swept.reach(page);

    const key = `${testInfo.project.name} · ${swept.name}`;
    await expectNoAxeViolations(page, key, KNOWN_VIOLATIONS[key]);
    await expectNoHorizontalScroll(page, key);
    // A no-op for the states with no overlay open, and the only measurement that sees the two
    // that do — the drawer and the create-course dialog. See the helper for what was measured.
    await expectOverlayWithinViewport(page, key);
  });
}
