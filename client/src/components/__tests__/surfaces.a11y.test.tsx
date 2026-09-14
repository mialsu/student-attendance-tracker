/**
 * A11Y-3's automated half: axe over the rendered surfaces, in each of the states DESIGN.md §3
 * lists — not only the loaded happy one, which is where an empty or error layout hides its
 * missing labels.
 *
 * Two honest limits, both restated in DESIGN.md §6:
 *
 * 1. `color-contrast` is switched OFF here on purpose. jsdom has no layout or paint, so axe
 *    cannot know what is drawn behind what and reports contrast as *incomplete* — neither a pass
 *    nor a failure, and trivially mistaken for a pass. Contrast is enforced instead over the
 *    token pairs, in src/__tests__/tokens-contrast.test.ts.
 * 2. axe finds a *missing* accessible name, never a useless one. "button", "click here", or a
 *    Finnish screen announcing "Close" in English all pass this file. Those belong to the
 *    keyboard walk (A11Y-1) and to review.
 *
 * Mocked at the hook seam, the pattern src/components/__tests__/StudentLogs.legacy.test.tsx
 * established. Nothing reaches the network; src/test/setup.ts fails the test if it tries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/test-utils';
import axe, { type RunOptions } from 'axe-core';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import AttendanceTracking from '../AttendanceTracking';
import StudentLogs from '../StudentLogs';
import Auth from '@/pages/Auth';
import Settings from '@/pages/Settings';
import ProtectedRoute from '../ProtectedRoute';
import * as useAttendanceHooks from '@/hooks/useAttendance';
import * as useStudentsHooks from '@/hooks/useStudents';
import * as useClassesHooks from '@/hooks/useClasses';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';
import type { User } from '@/api/types';

vi.mock('@/hooks/useAttendance');
vi.mock('@/hooks/useStudents');
vi.mock('@/hooks/useClasses');
vi.mock('@/hooks/useMediaQuery');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// The two auth surfaces have no query hook to stand in front of: they call the context, whose
// only collaborator is this module. Same seam `auth-flow.test.tsx` uses.
vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

import { authApi } from '@/api/auth';

const AXE_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

/**
 * Empty, and it was not empty for long.
 *
 * It held one row on 2026-09-07: `nested-interactive` on the mobile accordion, where the
 * per-student menu was a `<button>` inside Radix's trigger `<button>`, leaving an
 * assistive-technology user on a phone with no route to rename, credit or delete. That row closed
 * the same day, not by patching the nesting but by deleting the accordion: variant A won the
 * /prototype run and StudentLogs now renders ONE table at every width, so there is no trigger left
 * to nest a button inside.
 *
 * Shrink-only in both directions — a new rule id fails, and a listed one that stops appearing also
 * fails and names the row to delete. That is what made me remove this one rather than leave a
 * stale exemption behind. Adding a row needs a REVIEW-DEBT.md entry in the same commit.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {};
async function expectNoViolations(container: HTMLElement, state?: string) {
  const { violations } = await axe.run(container, AXE_OPTIONS);
  const found = violations.map(
    (v) => `${v.id} × ${v.nodes.length} — ${v.help} (${v.nodes[0]?.target.join(' ')})`,
  );
  const known = (state && KNOWN_VIOLATIONS[state]) || [];
  if (known.length > 0) {
    expect(
      violations.map((v) => v.id).sort(),
      `${state}: expected exactly the known violations ${known.join(', ')}. A new id means a new ` +
        `defect; a missing one means it is FIXED — delete its KNOWN_VIOLATIONS row and close the ` +
        `REVIEW-DEBT entry. Saw: ${found.join(' | ') || 'nothing'}`,
    ).toEqual([...known].sort());
    return;
  }
  expect(found, `axe found ${found.length} violation(s)`).toEqual([]);
}

const asSummary = (v: unknown) => v as ReturnType<typeof useAttendanceHooks.useAttendanceSummary>;
const asCreate = (v: unknown) => v as ReturnType<typeof useAttendanceHooks.useCreateAttendance>;
const asAutocomplete = (v: unknown) =>
  v as ReturnType<typeof useStudentsHooks.useStudentAutocomplete>;
const asDeleteAttendance = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useDeleteAttendance>;
const asUpdateStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useUpdateStudent>;
const asDeleteStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useDeleteStudent>;
const asMergeStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useMergeStudent>;

const idleMutation = { mutateAsync: vi.fn(), isPending: false };

const asClasses = (v: unknown) => v as ReturnType<typeof useClassesHooks.useClasses>;

const TEACHER: User = {
  id: 'ac1d0000-0000-0000-0000-000000000001',
  email: 'opettaja@koulu.fi',
  active: true,
  created_at: '2026-09-02T00:00:00Z',
};

/** A request accepted and never answered — how a mid-mutation state is held still. */
const neverSettles = <T,>() => new Promise<T>(() => {});

const summary = (itemCount: number, legacyHidden = 0) => ({
  data: {
    items: Array.from({ length: itemCount }, (_, i) => ({
      student_id: `student-${i}`,
      student_name: `Opiskelija ${i}`,
      course_credit_received: i % 2 === 0,
      total_attendance: 3,
      records: [],
    })),
    total: itemCount,
    skip: 0,
    limit: 20,
    legacy_hidden: legacyHidden,
  },
  isLoading: false,
});

describe('the surfaces pass axe in every state', () => {
  const classId = 'class-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(true);
    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue(asCreate(idleMutation));
    vi.mocked(useAttendanceHooks.useDeleteAttendance).mockReturnValue(
      asDeleteAttendance(idleMutation),
    );
    vi.mocked(useStudentsHooks.useUpdateStudent).mockReturnValue(asUpdateStudent(idleMutation));
    vi.mocked(useStudentsHooks.useDeleteStudent).mockReturnValue(asDeleteStudent(idleMutation));
    vi.mocked(useStudentsHooks.useMergeStudent).mockReturnValue(asMergeStudent(idleMutation));
    vi.mocked(useStudentsHooks.useStudentAutocomplete).mockReturnValue(
      asAutocomplete({ data: [], isLoading: false, error: null }),
    );
  });

  it('Kirjaa läsnäolo — the logging form, idle', async () => {
    const { container } = render(<AttendanceTracking classId={classId} />);
    await expectNoViolations(container);
  });

  it('Kirjaa läsnäolo — mid-submit, controls disabled', async () => {
    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue(
      asCreate({ mutateAsync: vi.fn(), isPending: true }),
    );
    const { container } = render(<AttendanceTracking classId={classId} />);
    await expectNoViolations(container);
  });

  it('Läsnäolot — empty, no students yet', async () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(summary(0)));
    const { container } = render(<StudentLogs classId={classId} />);
    await expectNoViolations(container);
  });

  it('Läsnäolot — loading', async () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
      asSummary({ data: undefined, isLoading: true }),
    );
    const { container } = render(<StudentLogs classId={classId} />);
    await expectNoViolations(container);
  });

  it('Läsnäolot — populated, with the legacy banner showing', async () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(summary(3, 2)));
    const { container } = render(<StudentLogs classId={classId} />);
    await expectNoViolations(container);
  });

  // This used to be a genuinely different DOM: below the breakpoint StudentLogs rendered an
  // Accordion instead of the table, and that branch was where `nested-interactive` lived. Since
  // variant A landed there is ONE implementation, so this now asserts the same markup as the case
  // above — deliberately. If a second, width-specific implementation is ever reintroduced, this is
  // the test where the two would diverge, and DESIGN.md §4 is the argument against it.
  const NARROW = 'Läsnäolot — populated, with the breakpoint reporting narrow';
  it(NARROW, async () => {
    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(false);
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(summary(3)));
    const { container } = render(<StudentLogs classId={classId} />);
    await expectNoViolations(container, NARROW);
  });

  /*
    The two surfaces slice 7 gave a mid-mutation state to.

    Deliberately NOT the whole of slices 3-7. `e2e/states.spec.ts` already sweeps all 21 states in
    `DESIGN.md` §3 through axe in a real browser, at both viewports, with `color-contrast` and
    `heading-order` on — everything this file can do and three things it cannot. Re-covering those
    states here would be two formats for one artifact, and the weaker one at that.

    What this file uniquely carries is the state a mutation is *in flight*, which the walk's table
    has no row for: `Kirjaa läsnäolo — mid-submit` above has been the only one. Slice 7 created two
    more, and a disabled control whose label has just changed is exactly where an accessible name
    goes missing, so they belong here.
  */
  it('/auth — mid-login, the submit disabled', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockReturnValue(neverSettles());

    const { container } = render(<Auth />);
    await user.type(screen.getByLabelText('Sähköposti'), TEACHER.email);
    await user.type(screen.getByLabelText('Salasana'), 'salasana123');
    await user.click(screen.getByRole('button', { name: /^kirjaudu$/i }));

    await screen.findByRole('button', { name: 'Kirjaudutaan...' });
    await expectNoViolations(container);
  });

  it('/settings — mid-email-change, the submit disabled', async () => {
    const user = userEvent.setup();
    vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses({ data: [], isLoading: false }));
    vi.mocked(authApi.refreshToken).mockResolvedValue({ access_token: 'an-access-token' });
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(TEACHER);
    vi.mocked(authApi.updateEmail).mockReturnValue(neverSettles());

    const { container } = render(
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>,
    );
    await screen.findByRole('heading', { name: 'Asetukset', level: 1 });

    // `clear` before `type`, because the field arrives prefilled and appending makes the value
    // two addresses joined — invalid for `type="email"`, which the browser refuses before React
    // sees it. `Settings.test.tsx` carries the same line and the same reason.
    await user.clear(screen.getByLabelText('Uusi sähköposti'));
    await user.type(screen.getByLabelText('Uusi sähköposti'), 'uusi@koulu.fi');
    await user.type(screen.getByLabelText('Vahvista salasanallasi'), 'salasana123');
    await user.click(screen.getByRole('button', { name: 'Tallenna sähköposti' }));

    await screen.findByRole('button', { name: 'Tallennetaan...' });
    await expectNoViolations(container);
  });
});
