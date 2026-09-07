/**
 * The browser walk's configuration.
 *
 * `docs/adr/0005-playwright-for-the-browser-walk.md` records why Playwright, why the API is mocked
 * at the browser boundary, and the twelve alternatives that lost. Four things are decided *here*
 * rather than there: the port, the two viewports, whether a server may be reused, and who builds.
 *
 * **Two viewports, because both widths mean something.** 320px is `A11Y-7`'s WCAG 1.4.10 floor and
 * the narrowest width the Owner declared; 1280px clears the register table's `min-w-[34rem]` so it
 * lays out without sideways scroll. They are the two sides of the one-table decision, and a third
 * would be a number nobody chose.
 *
 * **Its own port.** 4174, one off Vite's preview default of 4173, so a preview the Owner already
 * has open is neither reused nor killed by a gate run.
 *
 * **No reuse, ever.** `reuseExistingServer` only checks whether the URL *answers* — `specgate`'s
 * config carries the burn: a whole suite ran green against a different project's app on a shared
 * port. With `false` plus `--strictPort`, anything already holding 4174 fails the run loudly
 * instead of quietly answering for it.
 *
 * **The webServer builds, in the walk's own mode.** `--mode e2e` loads `.env.e2e`, which points
 * the bundle at this same origin; `npm run build` would load `.env.production` and bake in
 * https://attendance-api.kotoio.fi, leaving the walk one missed route pattern away from the real
 * API. `.env.e2e` says the rest. Building here also means every entry point tests the current
 * tree: `npm run check` builds twice, ~4s to remove "the walk passed against an hour-old dist"
 * from the list of things that can happen.
 */
import { defineConfig, devices } from '@playwright/test';

/** See the note above — deliberately not Vite's 4173. */
const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  /** The API is mocked per page, so no two specs share state and nothing has to run in order. */
  fullyParallel: true,
  /**
   * No retries. After self-hosting the webfont there is no network, no database, no clock and no
   * real API left to be nondeterministic, so `0` is a claim rather than a hope — and an
   * intermittent pass would hide the race a gate exists to catch. The ADR's policy for the first
   * red run that is not the app: revert the assertion and file the nondeterminism as debt. Never
   * add a retry.
   */
  retries: 0,
  /** `.only` silences a suite. `scripts/drift-check.sh` check 2 catches it in a diff; this catches it here. */
  forbidOnly: true,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'reflow-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run build:e2e && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    stdout: 'ignore',
    timeout: 120_000,
  },
});
