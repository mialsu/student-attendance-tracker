/**
 * The *Läsnäolot* search box keeps her place while a search runs.
 *
 * Reported by the teacher on 2026-09-30: type "al", pause, type "ek", and the box still read "al".
 * Every debounced search replaced the whole card with its loading state, so the box she was typing
 * into was unmounted mid-word and a new one mounted without focus. `StudentLogs.search.test.tsx`
 * holds the same line in jsdom; this holds it in a browser, where focus is the browser's own.
 */
import { KURSSI } from './rows';
import { ROUTES, oneKurssi, register, signedIn } from './mocks';
import { expect, test } from './fixtures';

test('the search box keeps focus across a search, so the next letters land in it', async ({
  page,
}) => {
  await signedIn(page);
  await oneKurssi(page);
  // One answer for every search: this is about the box, not about which rows come back.
  await register(page);

  await page.goto(`/class/${KURSSI.id}`);
  await page.getByRole('tab', { name: 'Läsnäolot' }).click();
  const box = page.getByPlaceholder('Etsi opiskelijan nimellä...');
  await box.click();

  // Waited on as a request, not a timer: the search leaves only after the 500 ms debounce, and
  // that departure is the moment the old code swapped the card out.
  const searched = page.waitForRequest(
    (request) => ROUTES.summary.test(request.url()) && request.url().includes('search=al'),
  );
  await page.keyboard.type('al');
  await searched;
  await expect(page.getByText(/haulla "al"/)).toBeVisible();

  await page.keyboard.type('ek');
  await expect(box).toHaveValue('alek');
  await expect(box).toBeFocused();
});
