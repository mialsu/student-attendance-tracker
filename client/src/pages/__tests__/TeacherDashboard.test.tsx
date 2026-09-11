/**
 * The dashboard with courses on it — the state no test covered before slice 5.
 *
 * `error-states.test.tsx` holds the failed and empty branches (AC10). This file holds the
 * **populated** one, and exists because the reskin changes what a course card *is*, not just how
 * it looks:
 *
 * 1. **A card is a link.** It was a `<Card onClick>` — a `div` — so the whole course list was
 *    unreachable by keyboard and announced as nothing. `DESIGN.md` §3 has said "each card a link"
 *    since the surface inventory was written; the markup simply never agreed with it. The
 *    prototype is no help here and makes the same class of mistake in the other direction
 *    (`prototype/index.html:583` is a `<button>` that navigates).
 * 2. **The counts name their unit in the accessible name.** `US-8` asks for student and attendance
 *    counts on the card, and name computation concatenates descendant text with no separator — so
 *    the card would otherwise announce as "Matematiikka MAA512 opiskelijaa35 läsnäoloa". This is
 *    the defect `AppShell.test.tsx` caught in the sidebar on 2026-09-11; the fix here is the same
 *    explicit `aria-label`, and the visible name is still its leading substring (WCAG 2.5.3).
 *
 * Mocked at the hook seam over `@/api/*`, the pattern `StudentLogs.legacy.test.tsx` established.
 * Nothing here reaches the network; `src/test/setup.ts` fails the test if it tries.
 *
 * Everything is scoped to `main`, because the shell renders the same courses in the sidebar and
 * an unscoped `getByRole('link')` would match both. That is not test friction — it is the reason
 * the accessible names have to differ meaningfully in the first place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import TeacherDashboard from '@/pages/TeacherDashboard';
import * as useClassesHooks from '@/hooks/useClasses';
import type { Class } from '@/api/types';

vi.mock('@/hooks/useClasses');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

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

const asClasses = (v: unknown) => v as ReturnType<typeof useClassesHooks.useClasses>;
const asCreateClass = (v: unknown) => v as ReturnType<typeof useClassesHooks.useCreateClass>;

const KURSSI: Class = {
  id: 'class-1',
  name: 'Matematiikka MAA5',
  description: 'Analyyttinen geometria',
  teacher_id: 'teacher-1',
  active: true,
  created_at: '2025-11-03T08:05:00Z',
  updated_at: null,
  attendance_count: 35,
  student_count: 12,
};

const loaded = (classes: Class[]) => ({
  data: classes,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});

/** The page content, without the sidebar that lists the same courses. */
const main = () => within(screen.getByRole('main'));

describe('the dashboard with courses on it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useClassesHooks.useCreateClass).mockReturnValue(
      asCreateClass({ mutateAsync: vi.fn(), isPending: false }),
    );
    vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses(loaded([KURSSI])));
  });

  it('makes each course a link to its Kurssi, not a div that only a mouse can reach', () => {
    render(<TeacherDashboard />);

    const card = main().getByRole('link', { name: /Matematiikka MAA5/ });

    expect(card).toHaveAttribute('href', '/class/class-1');
  });

  it('names both counts and their units in the accessible name', () => {
    render(<TeacherDashboard />);

    // Not a substring check: the whole computed name, because the defect being held shut is the
    // *concatenation* — "Matematiikka MAA512 opiskelijaa35 läsnäoloa" contains every fragment a
    // looser assertion would look for.
    expect(
      main().getByRole('link', {
        name: 'Matematiikka MAA5, 12 opiskelijaa, 35 läsnäoloa',
      }),
    ).toBeInTheDocument();
  });

  it('shows both counts on the card', () => {
    render(<TeacherDashboard />);

    expect(main().getByText('12')).toBeInTheDocument();
    expect(main().getByText('35')).toBeInTheDocument();
  });

  it('leaves the counts out of the name when the API did not send them', () => {
    vi.mocked(useClassesHooks.useClasses).mockReturnValue(
      asClasses(loaded([{ ...KURSSI, student_count: undefined, attendance_count: undefined }])),
    );

    render(<TeacherDashboard />);

    expect(main().getByRole('link', { name: 'Matematiikka MAA5' })).toBeInTheDocument();
  });

  it('offers a dashed new-course affordance in the grid that opens the dialog', async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard />);

    await user.click(main().getByRole('button', { name: /Uusi kurssi/ }));

    expect(screen.getByRole('dialog', { name: 'Luo uusi kurssi' })).toBeInTheDocument();
  });

  it('does not repeat the new-course affordance in the empty state', () => {
    vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses(loaded([])));

    render(<TeacherDashboard />);

    // One primary CTA per view (spec 0006, Implementation Decisions). With no courses there is no
    // grid, so the dashed card has nothing to sit in and the header button is the only way in.
    expect(main().queryByRole('button', { name: /Uusi kurssi/ })).not.toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Lisää uusi kurssi' })).toBeInTheDocument();
    expect(main().getByText(/Ei kursseja vielä/)).toBeInTheDocument();
  });

  it('says it is working while the course is being created, and refuses a second submit', async () => {
    const user = userEvent.setup();
    vi.mocked(useClassesHooks.useCreateClass).mockReturnValue(
      asCreateClass({ mutateAsync: vi.fn(), isPending: true }),
    );

    render(<TeacherDashboard />);
    await user.click(main().getByRole('button', { name: 'Lisää uusi kurssi' }));

    const submit = screen.getByRole('button', { name: 'Luodaan...' });
    expect(submit).toBeDisabled();
  });
});
