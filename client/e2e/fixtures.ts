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
import { createRequire } from 'node:module';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { RunOptions } from 'axe-core';
import type { AttendanceStatistics } from '../src/api/attendance';
import type {
  AttendanceRecord,
  AuthResponse,
  Class,
  PaginatedAttendanceSummaryResponse,
  StudentAutocomplete,
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

export const EMPTY_REGISTER: PaginatedAttendanceSummaryResponse = {
  items: [],
  total: 0,
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

export const NO_STATISTICS: AttendanceStatistics = {
  total_records: 0,
  total_students: 0,
  first_date: null,
  last_date: null,
  daily_stats: [],
  monthly_stats: [],
};

/* ----------------------------------------------------------------- the mocks */

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
export function toast(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

/**
 * The autocomplete rows, ordered by frequency the way the API orders them — `total_attendance`
 * descending. `DESIGN.md` §2 makes that ordering part of the core loop, so the fixture has to
 * carry it or the walk proves a list rather than the feature.
 */
export const SUGGESTIONS: StudentAutocomplete[] = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Liisa Korhonen', total_attendance: 15 },
  { id: '33333333-3333-4333-8333-333333333331', name: LONGEST_NAME, total_attendance: 13 },
  { id: '33333333-3333-4333-8333-333333333334', name: 'Otto Nieminen', total_attendance: 1 },
];

/**
 * What a logged attendance answers with. `quantity_created` is what the toast counts.
 *
 * The type is a `Pick` of the fields the server actually sends, which is doing two jobs. It keeps
 * the coupling — rename any of them in `src/api/types.ts` and `typecheck:e2e` goes red — and it
 * leaves out the two deprecated name halves that `AttendanceRecord` still declares as
 * **required**. The API stopped sending those with the Student-entity migration, and a fixture
 * carrying empty strings for them would teach the walk a contract the server no longer has.
 *
 * `Omit` was the first attempt and `scripts/drift-extra.sh` rejected it — correctly, since a text
 * matcher cannot tell using a banned identifier from excluding one by name. `Pick` states the same
 * thing by naming only what is sent, so the gate needs no exemption. That those fields are
 * non-optional in `src/api/types.ts` at all is a type lie about live responses; it is in
 * `REVIEW-DEBT.md`.
 */
type LoggedAttendance = Pick<
  AttendanceRecord,
  'id' | 'class_id' | 'timestamp' | 'created_at' | 'student' | 'student_name' | 'quantity_created'
>;

export function loggedAttendance(name: string, quantity: number): LoggedAttendance {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    class_id: KURSSI.id,
    timestamp: '2026-09-07T09:00:00Z',
    created_at: '2026-09-07T09:00:00Z',
    student: { id: SUGGESTIONS[0]!.id, name, course_credit_received: false },
    student_name: name,
    quantity_created: quantity,
  };
}

/**
 * Answer the autocomplete and the attendance POST, and hand back the POST bodies.
 *
 * The bodies are the point. A toast saying "Läsnäolo kirjattu" proves the screen reacted; only the
 * request proves the Kurssi was told the right name and the right quantity, which is what the core
 * loop is for.
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
export async function tabSequence(page: Page, presses = 25): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return '(nothing)';
        return el.id || (el.textContent ?? '').trim().slice(0, 40) || el.tagName.toLowerCase();
      }),
    );
  }
  return seen;
}

/**
 * Press Tab until `locator` holds focus, and return how many presses it took.
 *
 * The count is what makes `A11Y-2` (focus order follows reading order) assertable: the controls of
 * a form must be reachable in increasing numbers of presses, in the order they are read. Asserting
 * an exact count instead would break on any layout change and prove nothing about the order.
 */
export async function tabTo(page: Page, locator: Locator, maxPresses = 30): Promise<number> {
  for (let pressed = 1; pressed <= maxPresses; pressed += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((el) => el === document.activeElement)) return pressed;
  }
  throw new Error(`not reachable by keyboard within ${maxPresses} Tab presses`);
}

/* --------------------------------------------------- what a browser can prove */

declare global {
  interface Window {
    axe: typeof import('axe-core');
  }
}

const require_ = createRequire(import.meta.url);

/**
 * axe's own bundle, injected into the page rather than reached for through a wrapper.
 *
 * `axe-core` is already a dependency — `src/components/__tests__/surfaces.a11y.test.tsx` runs it
 * under jsdom — so `@axe-core/playwright` would be a second way to do a thing this repo already
 * does (PRINCIPLES #3). It is a thin wrapper around exactly this injection.
 */
const AXE_BUNDLE = require_.resolve('axe-core/axe.min.js');

/**
 * The same four WCAG tag sets the jsdom sweep runs — and `color-contrast` **on**, which is the
 * whole reason a real browser is here.
 *
 * jsdom has no layout and no paint, so it cannot know what is drawn behind what and returns
 * contrast as *incomplete*: neither a pass nor a failure, and trivially mistaken for a pass
 * (ADR-0004). `src/__tests__/tokens-contrast.test.ts` asserts the token *pairs* clear AA, which
 * proves the palette and says nothing about a rendered screen. This closes that, and `DESIGN.md`
 * §6 names the gap it closes.
 */
export const AXE_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

/**
 * Wait for the webfont before measuring anything.
 *
 * Fira Sans is self-hosted and same-origin, so this always resolves — but `font-display: swap`
 * means the first paint is system-ui, whose advance widths differ. A reflow assertion taken
 * before the swap measures the wrong font, which would make `A11Y-7` a test about a typeface the
 * app does not use.
 */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Let every finite animation finish before measuring anything.
 *
 * Not tidiness — without it the sweep reports contrast failures that are not in the palette.
 * `animate-fade-in` runs for 0.3s and axe composites what is actually painted, so mid-fade it
 * reads the text blended against its own background: `--muted-foreground` is `#48566a`, and axe
 * measured `#637081`, which is exactly that colour at **0.83 alpha** over `#e9f2f4` — the same
 * alpha on all three channels. That turned a passing token pair into a 4.43:1 "defect", and made
 * it appear at 320px and not at 1280px, because the only difference was how long the page took to
 * get there. A width-dependent contrast ratio is impossible, which is what gave it away.
 *
 * Infinite animations are excluded on purpose: the loading states hold `animate-spin`, which never
 * finishes, and awaiting it would hang the walk rather than measure it.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/**
 * axe over the whole document, contrast included. `where` names the state in the failure.
 *
 * `known` is **shrink-only in both directions**, the convention
 * `src/components/__tests__/surfaces.a11y.test.tsx` established: a new rule id fails because it is
 * a new defect, and a listed id that stops appearing *also* fails and names the row to delete, so
 * ground once won cannot be given back. A row here is legitimate only alongside a
 * `REVIEW-DEBT.md` entry saying why.
 */
export async function expectNoAxeViolations(
  page: Page,
  where: string,
  known: string[] = [],
): Promise<void> {
  await fontsReady(page);
  await settleAnimations(page);
  await page.addScriptTag({ path: AXE_BUNDLE });

  const found = await page.evaluate(async (options: RunOptions) => {
    const { violations } = await window.axe.run(document, options);
    return violations.map((v) => {
      const node = v.nodes[0];
      const target = node?.target.join(' ') ?? 'no target';
      // A contrast row without numbers is not actionable: axe already measured the two colours
      // and the ratio it wanted, and the token-pair test cannot see either, so carry them out.
      const measured = node?.any.find((check) => check.id === 'color-contrast')?.data as
        | { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string }
        | undefined;
      const numbers = measured?.contrastRatio
        ? ` [${measured.fgColor} on ${measured.bgColor} = ${measured.contrastRatio}:1, wanted ${measured.expectedContrastRatio}]`
        : '';
      return `${v.id} × ${v.nodes.length} — ${v.help} (${target})${numbers}`;
    });
  }, AXE_OPTIONS);

  if (known.length > 0) {
    const ids = found.map((row) => row.split(' ')[0] ?? '').sort();
    expect(
      ids,
      `${where}: expected exactly the known violations ${known.join(', ')}. A new id is a new ` +
        `defect; a missing one means it is FIXED — delete its KNOWN_VIOLATIONS row and close the ` +
        `REVIEW-DEBT entry. Saw: ${found.join(' | ') || 'nothing'}`,
    ).toEqual([...known].sort());
    return;
  }

  expect(found, `${where}: axe found ${found.length} violation(s)`).toEqual([]);
}

/**
 * `A11Y-7` / WCAG 1.4.10: the **page** may not scroll sideways at 320px.
 *
 * An inner container that scrolls is fine and deliberate — the register is one table at every
 * width with a `min-w-[34rem]`, so below about 544px it scrolls inside its own box. That is the
 * shape variant A chose. What is not fine is the document scrolling, which is what this measures,
 * and the failure names the three widest offenders because "the page scrolls" is not actionable
 * on its own.
 */
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  await fontsReady(page);
  // A fade-in that translates would overflow transiently; measure the page it settles into.
  await settleAnimations(page);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    const widest = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 3)
      .map((el) => {
        const cls = (el.getAttribute('class') ?? '').split(' ')[0] ?? '';
        const right = Math.round(el.getBoundingClientRect().right);
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} → ${right}px`;
      });
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest };
  });

  expect(overflow, `${where}: the page itself scrolls sideways (A11Y-7, WCAG 1.4.10)`).toBeNull();
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
