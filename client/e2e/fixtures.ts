/**
 * The walk's rows, its mocks, and the two guards that keep it honest.
 *
 * `docs/adr/0005-playwright-for-the-browser-walk.md` decides that the API is mocked at the browser
 * boundary. Mocking is easy; *knowing* you mocked everything is the hard half, and it is what the
 * two auto-installed guards below are for:
 *
 *   1. **Nothing leaves the preview origin.** Aborted and recorded, and the test fails at teardown.
 *      `.env.e2e` already points the bundle at this origin, so this catches a hardcoded URL.
 *   2. **Nothing under `/api` goes unanswered.** A request no fixture claims gets a 501 and is
 *      recorded, and the test fails at teardown. Without this, `vite preview`'s SPA history
 *      fallback answers an unmocked GET with `index.html` and a 200 — the app then fails on HTML
 *      where it wanted JSON, which reads as an app bug rather than a hole in the walk.
 *
 * Both are `auto` fixtures, so no spec can forget them, and both assert *after* the test body so a
 * failure names what escaped.
 *
 * Playwright matches routes newest-first, so a `mockJson` call inside a test always wins over the
 * guard registered here. `e2e/auth.spec.ts` proves that ordering rather than assuming it.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type {
  AttendanceStatistics,
} from '../src/api/attendance';
import type {
  AuthResponse,
  Class,
  PaginatedAttendanceSummaryResponse,
  User,
} from '../src/api/types';

/** The preview server the walk drives. `playwright.config.ts` owns the port and says why it is 4174. */
export const PREVIEW_ORIGIN = 'http://localhost:4174';

/* ------------------------------------------------------------------ the rows */

/**
 * Written to stress the layout rather than flatter it (ADR-0005). `DESIGN.md` §6 lists "whether the
 * design survives real content" as uncovered, and these four shapes are the cheapest honest move
 * against it:
 *
 * - a **32-character hyphenated** name, which is what a Finnish double-barrelled surname does to a
 *   column at 320px;
 * - a **single-name** Student, because `Student.name` is one field and nothing requires two words;
 * - tallies **either side of 14–15**, the teacher's rule of thumb for a course credit, which the app
 *   deliberately neither enforces nor displays (`INVARIANTS.md`, *Deliberately not invariants*);
 * - a Student with **one** attendance, the smallest non-empty register row there is.
 */
export const TEACHER: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'opettaja@koulu.fi',
  active: true,
  created_at: '2025-11-03T08:00:00Z',
};

export const KURSSI: Class = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Matematiikka MAA5',
  description: 'Analyyttinen geometria',
  teacher_id: TEACHER.id,
  active: true,
  created_at: '2025-11-03T08:05:00Z',
  updated_at: null,
  attendance_count: 59,
};

export const ACCESS_TOKEN = 'e2e-access-token-not-a-real-jwt';

export const SESSION: AuthResponse = {
  access_token: ACCESS_TOKEN,
  token_type: 'bearer',
  user: TEACHER,
};

/** Exactly 32 characters, hyphenated on both halves. The width test in one string. */
export const LONGEST_NAME = 'Aino-Kaarina Mäkeläinen-Virtanen';

export const REGISTER: PaginatedAttendanceSummaryResponse = {
  items: [
    {
      student_id: '33333333-3333-4333-8333-333333333331',
      student_name: LONGEST_NAME,
      course_credit_received: false,
      total_attendance: 13,
      records: [{ id: 'r1', timestamp: '2026-09-01T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333332',
      student_name: 'Väinö',
      course_credit_received: false,
      total_attendance: 14,
      records: [{ id: 'r2', timestamp: '2026-09-02T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333333',
      student_name: 'Liisa Korhonen',
      course_credit_received: true,
      total_attendance: 15,
      records: [{ id: 'r3', timestamp: '2026-09-03T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333334',
      student_name: 'Otto Nieminen',
      course_credit_received: false,
      total_attendance: 1,
      records: [{ id: 'r4', timestamp: '2026-09-04T09:00:00Z' }],
    },
  ],
  total: 4,
  skip: 0,
  limit: 50,
  legacy_hidden: 0,
};

export const STATISTICS: AttendanceStatistics = {
  total_records: 43,
  total_students: 4,
  first_date: '2026-09-01',
  last_date: '2026-09-04',
  daily_stats: [
    { date: '2026-09-01', count: 13 },
    { date: '2026-09-02', count: 14 },
    { date: '2026-09-03', count: 15 },
    { date: '2026-09-04', count: 1 },
  ],
  monthly_stats: [{ year_month: '2026-09', count: 43 }],
};

/* ----------------------------------------------------------------- the mocks */

/**
 * Answer one endpoint with JSON. Registered from inside a test, so it takes precedence over the
 * `/api` guard below.
 */
export async function mockJson(
  page: Page,
  glob: string,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(glob, (route) =>
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

/** One Kurssi on the dashboard. */
export async function oneKurssi(page: Page): Promise<void> {
  await mockJson(page, '**/api/classes?*', [KURSSI]);
  await mockJson(page, '**/api/classes', [KURSSI]);
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
export function toast(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

/* ---------------------------------------------------------------- the guards */

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
