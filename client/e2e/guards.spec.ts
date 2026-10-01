/**
 * The uncaught-error guard, tested from the side that matters: it has to SEE each kind of error it
 * exists to catch. A guard that stopped seeing one would leave every other test green, and this file
 * is what makes that failure loud.
 *
 * The timer case is why it exists. It rests on how Playwright's clock handles a callback that
 * throws (it logs the error; `recordUncaughtErrors` in `fixtures.ts` has the trace), and Dependabot
 * moves `@playwright/test` every month. A version that swallowed the error instead turns this test
 * red rather than leaving the guard blind to timers.
 *
 * Built on Playwright's own `test` rather than the walk's, because the walk's would fail at teardown
 * on the very errors this test plants. The clock is set the way `fixedClock` sets it, since the
 * clock is what moves a timer's error off `pageerror`.
 */
import { expect, test } from '@playwright/test';
import { FIXED_NOW, recordUncaughtErrors } from './fixtures';

test('the uncaught-error guard sees all three kinds, and not a logged string', async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  const uncaught = recordUncaughtErrors(page);

  await page.evaluate(() => {
    document.body.addEventListener('click', () => {
      throw new Error('thrown by a click handler');
    });
    document.body.click();
    void Promise.reject(new Error('rejected with no handler'));
    setTimeout(() => {
      throw new Error('thrown inside a timer');
    }, 0);
    // The shape `NotFound.tsx` logs in, which must not count.
    console.error('logged as a string', '/ei-ole-olemassa');
  });

  await expect
    .poll(async () => (await uncaught()).sort())
    .toEqual([
      'Error: rejected with no handler',
      'Error: thrown by a click handler',
      'Error: thrown inside a timer',
    ]);
});
