/**
 * Where the walk's requests go, and what answers them.
 *
 * ADR-0005 decides that the API is mocked at the browser boundary. Two rules keep that decision
 * honest, and both live here rather than in a spec:
 *
 * - **Routes are regexes, not globs.** A glob and a query string are a bad pairing: `?` is a
 *   wildcard in one and a delimiter in the other. `ROUTES` matches against the whole URL instead.
 * - **A mock registered inside a test wins.** Playwright matches routes newest-first, so anything
 *   here overrides the guards in `fixtures.ts`. `e2e/auth.spec.ts` proves that ordering rather than
 *   assuming it, because if it ever reversed, every mock would be shadowed by the 501 guard and
 *   every spec would fail in a way that looks like an app bug.
 */
import type { Page } from '@playwright/test';
import type { AttendanceStatistics } from '../src/api/attendance';
import type { PaginatedAttendanceSummaryResponse } from '../src/api/types';
import {
  ACCESS_TOKEN,
  KURSSI,
  REGISTER,
  STATISTICS,
  SUGGESTIONS,
  TEACHER,
  loggedAttendance,
} from './rows';

/** The preview server the walk drives. `playwright.config.ts` owns the port and says why it is 4174. */
export const PREVIEW_ORIGIN = 'http://localhost:4174';

/** Where each endpoint lives, as regexes. A glob and a query string are a bad pairing: `?` is a
 *  wildcard in one and a delimiter in the other, so every route here is matched against the whole
 *  URL instead. */
export const ROUTES = {
  classList: /\/api\/classes(\?|$)/,
  classDetail: /\/api\/classes\/[^/]+$/,
  summary: /\/attendance\/summary(\?|$)/,
  statistics: /\/attendance\/statistics(\?|$)/,
  autocomplete: /\/students\/autocomplete(\?|$)/,
  createAttendance: /\/attendance(\?|$)/,
} as const;

/**
 * Answer one endpoint with JSON. Registered from inside a test, so it takes precedence over the
 * `/api` guard below.
 */

export async function mockJson(
  page: Page,
  url: string | RegExp,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(url, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

/** A session the app can bootstrap from: `/refresh` mints a token, `/me` names the teacher. */

export async function signedIn(page: Page): Promise<void> {
  await mockJson(page, '**/api/auth/refresh', { access_token: ACCESS_TOKEN, token_type: 'bearer' });
  await mockJson(page, '**/api/auth/me', TEACHER);
}

/** No session: `/refresh` refuses, which is what a cold browser with no cookie gets. */

export async function coldSession(page: Page): Promise<void> {
  await mockJson(page, '**/api/auth/refresh', { detail: 'Not authenticated' }, 401);
}

/** One Kurssi on the dashboard, and the same Kurssi behind /class/:id. */

export async function oneKurssi(page: Page): Promise<void> {
  await mockJson(page, ROUTES.classList, [KURSSI]);
  await mockJson(page, ROUTES.classDetail, KURSSI);
}

/** A teacher with no Kurssi — the dashboard's empty state. */

export async function noKurssi(page: Page): Promise<void> {
  await mockJson(page, ROUTES.classList, []);
}

/** The register behind the *Läsnäolot* tab. Pass `EMPTY_REGISTER` for its empty state. */

export async function register(
  page: Page,
  body: PaginatedAttendanceSummaryResponse = REGISTER,
): Promise<void> {
  await mockJson(page, ROUTES.summary, body);
  await mockJson(page, ROUTES.autocomplete, []);
}

/** The aggregates behind the *Tilastot* tab. Pass `NO_STATISTICS` for its empty state. */

export async function statistics(
  page: Page,
  body: AttendanceStatistics = STATISTICS,
): Promise<void> {
  await mockJson(page, ROUTES.statistics, body);
}

/**
 * A request that is accepted and never answered — which is how a loading state is held still.
 *
 * Deliberately not a timer. ADR-0005's `retries: 0` is a claim that nothing here is
 * nondeterministic, and "wait 3 seconds and hope the spinner is still up" would make that false.
 * A route that never fulfils holds the state open for as long as the assertion needs, every time.
 */

export async function pending(page: Page, url: RegExp): Promise<void> {
  await page.route(url, () => {
    /* deliberately never fulfilled — see above */
  });
}

/**
 * The visible toast carrying `text`.
 *
 * Radix renders every toast **twice**: the one you can see, and an `aria-live`
 * `<span role="status">` whose text is `Notification` + title + description. A loose
 * `getByText` therefore matches one element or two depending on whether the announcement has
 * mounted yet — which failed one of the two viewport projects on every run, alternating, and
 * looked exactly like flake. `{ exact: true }` picks the visible node, whose text content is the
 * message alone.
 *
 * Every toast assertion goes through here, so the race is settled in one place.
 */

export async function attendanceLogging(page: Page): Promise<{ posted: unknown[] }> {
  const posted: unknown[] = [];

  await mockJson(page, ROUTES.autocomplete, SUGGESTIONS);
  await page.route(ROUTES.createAttendance, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = request.postDataJSON() as { student_name: string; quantity: number };
    posted.push(body);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(loggedAttendance(body.student_name, body.quantity)),
    });
  });

  return { posted };
}

/**
 * The forward tab order of the page, as a list of identifiers — an element's `id` when it has one,
 * else its trimmed text.
 *
 * This is what makes `A11Y-2` (focus order follows reading order) a real assertion rather than a
 * self-comparison: take the sequence once, then check the controls appear in it in the order they
 * are read. Counting presses per control cannot do that job, because Tab wraps at the end of the
 * document — a control in the wrong place is still "reached", just later, so a count proves
 * reachability and says nothing about order.
 */
