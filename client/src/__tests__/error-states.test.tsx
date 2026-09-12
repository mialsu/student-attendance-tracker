/**
 * AC10: a failed load renders an **error** state, never the empty one.
 *
 * The defect this file holds shut, in the words of `DESIGN.md` §3: "one bug in three places".
 * `/dashboard`, *Läsnäolot* and *Tilastot* each destructured `data` and `isLoading` from their
 * query and never consulted `error`, so a *failed* request rendered the *empty* branch — the
 * dashboard told a teacher who owns a Kurssi that she had none and invited her to create one, and
 * every one of the three sentences was false and actionable in the wrong direction.
 *
 * **Each surface is asserted twice, and the second half is what makes this a regression test.**
 * Proving the error state appears is easy and insufficient: the old code would pass a test that
 * only looked for an error message if the message happened to render for another reason. So every
 * case also asserts the empty string is **gone**. Reverting any of the three `error` branches
 * turns these red on the second assertion, which is the assertion the bug would have survived.
 *
 * Mocked at the hook seam over `@/api/*`, the pattern `StudentLogs.legacy.test.tsx` established.
 * Nothing here reaches the network; `src/test/setup.ts` fails the test if it tries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import TeacherDashboard from '@/pages/TeacherDashboard';
import ClassStatistics from '@/pages/ClassStatistics';
import StudentLogs from '@/components/StudentLogs';
import * as useClassesHooks from '@/hooks/useClasses';
import * as useAttendanceHooks from '@/hooks/useAttendance';
import * as useStudentsHooks from '@/hooks/useStudents';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';

vi.mock('@/hooks/useClasses');
vi.mock('@/hooks/useAttendance');
vi.mock('@/hooks/useStudents');
vi.mock('@/hooks/useMediaQuery');
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// The dashboard sits inside TeacherLayout, whose header reads the auth context; the context's only
// collaborator is this module, and a real one would reach the network.
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

/** The hooks return far more than these surfaces read, so each cast names what it stands in for. */
const asClasses = (v: unknown) => v as ReturnType<typeof useClassesHooks.useClasses>;
const asCreateClass = (v: unknown) => v as ReturnType<typeof useClassesHooks.useCreateClass>;
const asSummary = (v: unknown) => v as ReturnType<typeof useAttendanceHooks.useAttendanceSummary>;
const asStatistics = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useAttendanceStatistics>;
const asDeleteAttendance = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useDeleteAttendance>;
const asUpdateStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useUpdateStudent>;
const asDeleteStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useDeleteStudent>;
const asMergeStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useMergeStudent>;

const idleMutation = { mutateAsync: vi.fn(), isPending: false };

/**
 * What TanStack Query actually hands back on a rejected `queryFn`: `data` undefined, `error` set.
 * The pairing is the whole point — `!data` is true here too, which is why the empty branch used to
 * win.
 */
const failed = (refetch = vi.fn()) => ({
  data: undefined,
  isLoading: false,
  error: new Error('Network Error'),
  refetch,
});

describe('a failed load renders the error state, not the empty one (AC10)', () => {
  const classId = 'class-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(true);
    vi.mocked(useClassesHooks.useCreateClass).mockReturnValue(asCreateClass(idleMutation));
    vi.mocked(useAttendanceHooks.useDeleteAttendance).mockReturnValue(
      asDeleteAttendance(idleMutation),
    );
    vi.mocked(useStudentsHooks.useUpdateStudent).mockReturnValue(asUpdateStudent(idleMutation));
    vi.mocked(useStudentsHooks.useDeleteStudent).mockReturnValue(asDeleteStudent(idleMutation));
    vi.mocked(useStudentsHooks.useMergeStudent).mockReturnValue(asMergeStudent(idleMutation));
  });

  describe('/dashboard', () => {
    it('says the courses failed to load', () => {
      vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses(failed()));

      render(<TeacherDashboard />);

      expect(screen.getByRole('alert')).toHaveTextContent('Kurssien lataaminen epäonnistui');
      expect(screen.getByText('Tarkista verkkoyhteys ja yritä uudelleen.')).toBeInTheDocument();
    });

    it('does NOT claim she has no courses', () => {
      vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses(failed()));

      render(<TeacherDashboard />);

      // The sentence the bug produced. Its absence is the regression assertion.
      expect(screen.queryByText(/Ei kursseja vielä/)).not.toBeInTheDocument();
    });

    it('retries the query when she asks', async () => {
      const user = userEvent.setup();
      const refetch = vi.fn();
      vi.mocked(useClassesHooks.useClasses).mockReturnValue(asClasses(failed(refetch)));

      render(<TeacherDashboard />);
      await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));

      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Läsnäolot', () => {
    it('says the students failed to load', () => {
      vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(failed()));

      render(<StudentLogs classId={classId} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Opiskelijoiden lataaminen epäonnistui');
    });

    it('does NOT claim the register is empty', () => {
      vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(asSummary(failed()));

      render(<StudentLogs classId={classId} />);

      expect(screen.queryByText('Ei opiskelijoita vielä')).not.toBeInTheDocument();
    });

    it('retries the query when she asks', async () => {
      const user = userEvent.setup();
      const refetch = vi.fn();
      vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
        asSummary(failed(refetch)),
      );

      render(<StudentLogs classId={classId} />);
      await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));

      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tilastot', () => {
    it('says the statistics failed to load', () => {
      vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
        asStatistics(failed()),
      );

      render(<ClassStatistics classId={classId} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Tilastojen lataaminen epäonnistui');
    });

    it('does NOT tell her to go and record some attendance', () => {
      vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
        asStatistics(failed()),
      );

      render(<ClassStatistics classId={classId} />);

      expect(screen.queryByText(/Ei läsnäoloja näytettäväksi/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot/),
      ).not.toBeInTheDocument();
    });

    it('retries the query when she asks', async () => {
      const user = userEvent.setup();
      const refetch = vi.fn();
      vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
        asStatistics(failed(refetch)),
      );

      render(<ClassStatistics classId={classId} />);
      await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));

      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The empty state still has to work. Without this, "never show empty" would pass by deleting
   * the empty branch altogether, and `DESIGN.md` §3 wants four distinct states rather than three.
   */
  describe('a genuinely empty response still reads as empty', () => {
    it('/dashboard invites her to create her first course', () => {
      vi.mocked(useClassesHooks.useClasses).mockReturnValue(
        asClasses({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
      );

      render(<TeacherDashboard />);

      expect(screen.getByText(/Ei kursseja vielä/)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('Tilastot asks her to record some attendance', () => {
      vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
        asStatistics({
          data: { total_records: 0, daily_stats: [], monthly_stats: [] },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      );

      render(<ClassStatistics classId={classId} />);

      expect(screen.getByText(/Ei läsnäoloja näytettäväksi/)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
