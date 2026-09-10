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
} from './mocks';
import { expectNoAxeViolations, expectNoHorizontalScroll } from './assertions';
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
    name: '/settings',
    arrange: async (page) => {
      await signedIn(page);
    },
    reach: async (page) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible();
    },
  },
  {
    name: '404 — the wrong address',
    arrange: async () => {},
    reach: async (page) => {
      await page.goto('/ei-ole-olemassa');
      await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
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
  'reflow-320 · Läsnäolot — the register, including a 32-character name': ['color-contrast'],
  'desktop-1280 · Läsnäolot — the register, including a 32-character name': ['color-contrast'],
  'reflow-320 · 404 — the wrong address': ['color-contrast'],
  'desktop-1280 · 404 — the wrong address': ['color-contrast'],
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
  });
}
