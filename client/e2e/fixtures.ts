/**
 * The three guards every walk test runs under, and the `test` every spec imports.
 *
 * Mocking is easy; *knowing* you mocked everything is the hard half:
 *
 *   1. **Nothing leaves the preview origin.** Aborted and recorded, and the test fails at teardown.
 *      `.env.e2e` already points the bundle at this origin, so this catches a hardcoded URL.
 *   2. **Nothing under `/api` goes unanswered.** A request no fixture claims gets a 501 and is
 *      recorded, and the test fails at teardown. Without this, `vite preview`'s SPA history
 *      fallback answers an unmocked GET with `index.html` and a 200 — the app then fails on HTML
 *      where it wanted JSON, which reads as an app bug rather than a hole in the walk.
 *
 * The second guard earned its keep immediately: it recorded the stray `POST /api/auth/refresh` a
 * refused login was firing, which is how that defect was diagnosed rather than guessed.
 *
 *   3. **Nothing the page throws goes uncaught.** Recorded, and the test fails at teardown naming
 *      the error. Without it a crash reads as a missing element: on 2026-10-01 withholding the chart
 *      element unmounted the whole app once in 200 runs, and the walk reported a missing bar and a
 *      blank screenshot. `recordUncaughtErrors` says what counts as uncaught, and why.
 *
 * All three are `auto` fixtures, so no spec can forget them, and all three assert *after* the test
 * body so a failure names what escaped.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { PREVIEW_ORIGIN } from './mocks';

type Guards = {
  /** Installed for every test; see the note at the top of this file. */
  hermetic: void;
  /** Installed for every test; see `FIXED_NOW`. */
  fixedClock: void;
  /** Installed for every test; see `recordUncaughtErrors`. */
  noUncaughtErrors: void;
};

/**
 * The walk's today. The clock was the one input a run did not choose: the timeframe states pick
 * "the 10th" from a calendar that refuses future days, so every run on the 1st to the 9th of a
 * month failed four of them — first on 2026-10-01, two weeks after they were written. Mid-month for
 * the reason `ClassStatistics.test.tsx` pins 2026-09-20: late enough that the 10th has happened,
 * early enough that tomorrow is in the same month. `setFixedTime` fixes `Date` and leaves timers
 * running, so animations, debounces and the 300 ms fade behave exactly as before. Date edges (a
 * month's last day, a DST night) belong in unit tests that name their dates, not in a walk.
 */
export const FIXED_NOW = new Date('2026-09-20T12:00:00+03:00');

/**
 * Start recording every error the page throws that nothing catches, and return a function that
 * resolves to them. The third guard is this plus one assertion; `e2e/guards.spec.ts` calls it
 * directly, to prove it still sees each kind.
 *
 * Two channels, because the walk's own clock moves one kind of uncaught error off the first.
 * `pageerror` carries an exception nothing caught and a rejection nothing handled. It never sees an
 * error thrown inside a timer: `fixedClock` installs Playwright's clock, which runs every
 * `setTimeout`, `setInterval` and animation-frame callback inside its own try/catch and passes what
 * it catches to `console.error` (`_callFirstTimer` and `_updateRealTimeTimer` in playwright-core's
 * injected clock). Planted on 2026-10-01: a throw in a `setTimeout` reached the console as an Error
 * and never reached `pageerror`. So a `console.error` whose first argument is an Error counts too.
 * React's production build reports a render error both ways, and the Set keeps it once.
 *
 * Any other `console.error` does not count, and that was measured rather than assumed: across the
 * whole walk, 88 tests, the console carried 28 errors in 10 tests and no warnings. 26 were
 * Chromium's own "Failed to load resource" for the 500s and 401s the walk serves on purpose, and 2
 * were `NotFound.tsx` logging the address it could not find. None was an Error, and the walk runs
 * production React, which prints no development warnings.
 */
export function recordUncaughtErrors(page: Page): () => Promise<string[]> {
  const uncaught = new Set<string>();
  const inspections: Promise<void>[] = [];

  page.on('pageerror', (error) => uncaught.add(`${error.name}: ${error.message}`));
  page.on('console', (message) => {
    const [first] = message.args();
    if (message.type() !== 'error' || !first) return;
    inspections.push(
      first
        .evaluate((value) => (value instanceof Error ? `${value.name}: ${value.message}` : null))
        .then((error) => {
          if (error) uncaught.add(error);
        })
        // A page that has navigated away cannot be asked about its old values. Dropping that one
        // report costs a rare miss; failing on it would make a red that depends on timing.
        .catch(() => undefined),
    );
  });

  return async () => {
    await Promise.all(inspections);
    return [...uncaught];
  };
}

export const test = base.extend<Guards>({
  fixedClock: [
    async ({ page }, use) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await use();
    },
    { auto: true },
  ],
  hermetic: [
    async ({ page }, use) => {
      const leftTheOrigin: string[] = [];
      const unanswered: string[] = [];

      await page.route(
        (url) => url.origin !== PREVIEW_ORIGIN,
        async (route) => {
          leftTheOrigin.push(route.request().url());
          await route.abort();
        },
      );

      await page.route('**/api/**', async (route) => {
        const request = route.request();
        unanswered.push(`${request.method()} ${new URL(request.url()).pathname}`);
        await route.fulfill({
          status: 501,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'no fixture answers this endpoint' }),
        });
      });

      await use();

      expect(leftTheOrigin, 'the walk reached outside the preview server').toEqual([]);
      expect(unanswered, 'the walk hit an endpoint no fixture answers').toEqual([]);
    },
    { auto: true },
  ],
  noUncaughtErrors: [
    async ({ page }, use) => {
      const uncaught = recordUncaughtErrors(page);
      await use();
      expect(await uncaught(), 'the page threw an error nothing caught').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
