/**
 * The two guards that make the walk's hermeticity a property of the harness rather than a habit,
 * and the `test` every spec imports.
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
 * Both are `auto` fixtures, so no spec can forget them, and both assert *after* the test body so a
 * failure names what escaped.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { PREVIEW_ORIGIN } from './mocks';

type Guards = {
  /** Installed for every test; see the note at the top of this file. */
  hermetic: void;
};

export const test = base.extend<Guards>({
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
});

export { expect };
