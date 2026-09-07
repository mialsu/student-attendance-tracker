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
import AttendanceTracking from '../AttendanceTracking';
import StudentLogs from '../StudentLogs';
import * as useAttendanceHooks from '@/hooks/useAttendance';
import * as useStudentsHooks from '@/hooks/useStudents';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';

vi.mock('@/hooks/useAttendance');
vi.mock('@/hooks/useStudents');
vi.mock('@/hooks/useMediaQuery');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const AXE_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

/**
 * Shrink-only, exactly like KNOWN_FAILING in src/__tests__/tokens-contrast.test.ts: a state listed
 * here must still produce precisely these rule ids, so a NEW violation fails the gate and a FIXED
 * one also fails it — telling you to delete the row rather than letting the ground be given back.
 * Adding a row is only legitimate alongside a REVIEW-DEBT.md entry.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // The per-student menu button sits INSIDE AccordionTrigger, which Radix renders as a <button>,
  // so it is a button nested in a button: invalid HTML, and unreachable by keyboard or screen
  // reader. On a phone that menu is the ONLY route to edit a name, toggle the credit or delete —
  // so for an assistive-technology user the mobile surface has no actions at all.
  //
  // Not fixed here on purpose. The fix moves the menu out of the trigger, which reorders the row
  // (the chevron would land between the count and the menu) — a visible layout change, and this
  // session's scope holds layouts while the re-skin is pending. Confessed in REVIEW-DEBT.md and
  // named as the first thing the mobile pass must fix.
  'Läsnäolot — populated, narrow viewport (the accordion, not the table)': ['nested-interactive'],
};

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

  // Below the breakpoint StudentLogs renders an accordion instead of the table — a different DOM,
  // so passing above it proves nothing here. DESIGN.md holds every state to 320px.
  const NARROW = 'Läsnäolot — populated, narrow viewport (the accordion, not the table)';
  it(NARROW, async () => {
    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(false);
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(summary(3)));
    const { container } = render(<StudentLogs classId={classId} />);
    await expectNoViolations(container, NARROW);
  });
});
