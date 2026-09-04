import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import StudentLogs from '../StudentLogs';
import * as useAttendanceHooks from '@/hooks/useAttendance';
import * as useStudentsHooks from '@/hooks/useStudents';
import * as useMediaQueryHooks from '@/hooks/useMediaQuery';

vi.mock('@/hooks/useAttendance');
vi.mock('@/hooks/useStudents');
vi.mock('@/hooks/useMediaQuery');

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * The banner that reports students hidden by the five-year cutoff.
 * Spec: specs/0002-legacy-student-cutoff.md, AC-6.
 *
 * Mocked at the hook seam over `@/api/attendance`, the pattern the 2026-09-03 rewrite
 * established. Nothing here reaches the network; src/test/setup.ts would fail the test if
 * it tried.
 */
/**
 * The hooks return far more than StudentLogs reads, and each mutation carries its own
 * argument type, so every cast names the hook it stands in for.
 */
const asSummary = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useAttendanceSummary>;
const asDeleteAttendance = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useDeleteAttendance>;
const asUpdateStudent = (v: unknown) =>
  v as ReturnType<typeof useStudentsHooks.useUpdateStudent>;
const asDeleteStudent = (v: unknown) =>
  v as ReturnType<typeof useStudentsHooks.useDeleteStudent>;
const asMergeStudent = (v: unknown) =>
  v as ReturnType<typeof useStudentsHooks.useMergeStudent>;

const idleMutation = { mutateAsync: vi.fn(), isPending: false };

describe('StudentLogs — hidden legacy students', () => {
  const classId = 'class-1';

  const summaryResponse = (legacyHidden: number, itemCount = 1) => ({
    data: {
      items: Array.from({ length: itemCount }, (_, i) => ({
        student_id: `student-${i}`,
        student_name: `Opiskelija ${i}`,
        course_credit_received: false,
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

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(true);
    vi.mocked(useAttendanceHooks.useDeleteAttendance).mockReturnValue(
      asDeleteAttendance(idleMutation)
    );
    vi.mocked(useStudentsHooks.useUpdateStudent).mockReturnValue(
      asUpdateStudent(idleMutation)
    );
    vi.mocked(useStudentsHooks.useDeleteStudent).mockReturnValue(
      asDeleteStudent(idleMutation)
    );
    vi.mocked(useStudentsHooks.useMergeStudent).mockReturnValue(
      asMergeStudent(idleMutation)
    );
  });

  it('says nothing when the cutoff is hiding nobody', () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
      asSummary(summaryResponse(0))
    );

    render(<StudentLogs classId={classId} />);

    expect(screen.queryByRole('button', { name: 'Näytä' })).not.toBeInTheDocument();
    expect(screen.queryByText(/piilotettu/)).not.toBeInTheDocument();
  });

  it('names a single hidden student in the singular', () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
      asSummary(summaryResponse(1))
    );

    render(<StudentLogs classId={classId} />);

    expect(screen.getByText('1 vanha opiskelija piilotettu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Näytä' })).toBeInTheDocument();
  });

  it('counts several hidden students in the partitive', () => {
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
      asSummary(summaryResponse(3))
    );

    render(<StudentLogs classId={classId} />);

    expect(screen.getByText('3 vanhaa opiskelijaa piilotettu')).toBeInTheDocument();
  });

  it('asks for the hidden students when the teacher clicks Näytä', async () => {
    const user = userEvent.setup();
    const summary = vi.mocked(useAttendanceHooks.useAttendanceSummary);
    summary.mockReturnValue(asSummary(summaryResponse(2)));

    render(<StudentLogs classId={classId} />);

    expect(summary).toHaveBeenLastCalledWith(
      classId,
      expect.objectContaining({ legacy: undefined })
    );

    await user.click(screen.getByRole('button', { name: 'Näytä' }));

    expect(summary).toHaveBeenLastCalledWith(
      classId,
      expect.objectContaining({ legacy: true })
    );
  });

  it('offers the way back once they are revealed', async () => {
    const user = userEvent.setup();
    const summary = vi.mocked(useAttendanceHooks.useAttendanceSummary);
    summary.mockReturnValue(asSummary(summaryResponse(2)));

    render(<StudentLogs classId={classId} />);
    await user.click(screen.getByRole('button', { name: 'Näytä' }));

    // Revealed, the API reports nothing hidden — the banner has to stand on its own.
    summary.mockReturnValue(asSummary(summaryResponse(0, 3)));

    expect(screen.getByText('Vanhat opiskelijat näkyvissä')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Piilota' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Piilota' }));

    expect(summary).toHaveBeenLastCalledWith(
      classId,
      expect.objectContaining({ legacy: undefined })
    );
  });
});
