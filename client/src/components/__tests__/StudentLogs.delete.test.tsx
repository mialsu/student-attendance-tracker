/**
 * AC5: deleting a Student requires a confirmation that names the Student **and** the history it
 * destroys.
 *
 * The confirmation itself shipped long before spec 0006 — `StudentLogs.tsx` has had the
 * `AlertDialog` and its copy for as long as the delete action has existed. What it did **not**
 * have was an enforcer: no test opened it, no test read its sentence, and no test proved that the
 * action does not delete on the first click. AC5 names "behaviour test" as its enforcer, so this
 * file is that, and nothing here is a new feature.
 *
 * It was watched red the only way an already-passing criterion can be: by wiring the row action
 * straight to `deleteStudent` and confirming that all four tests fail (2026-09-11). A test written
 * after the behaviour, never watched fail, is a test that asserts whatever the code happens to do.
 *
 * The domain rule behind the sentence is the Owner's, recorded in `api/INVARIANTS.md` under
 * *Deliberately not invariants*: deleting a Student MAY destroy their whole history, because the
 * school holds the credit and this app is a tally sheet. That is exactly why the warning has to
 * say so out loud.
 *
 * Mocked at the hook seam, the pattern `StudentLogs.legacy.test.tsx` established. Nothing here
 * reaches the network; `src/test/setup.ts` fails the test if it tries.
 */
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
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const asSummary = (v: unknown) => v as ReturnType<typeof useAttendanceHooks.useAttendanceSummary>;
const asDeleteAttendance = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useDeleteAttendance>;
const asUpdateStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useUpdateStudent>;
const asDeleteStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useDeleteStudent>;
const asMergeStudent = (v: unknown) => v as ReturnType<typeof useStudentsHooks.useMergeStudent>;

const idleMutation = { mutateAsync: vi.fn(), isPending: false };

const STUDENT = {
  student_id: 'student-7',
  student_name: 'Liisa Korhonen',
  course_credit_received: false,
  total_attendance: 15,
  records: [],
};

describe('StudentLogs — deleting a student asks first', () => {
  const classId = 'class-1';
  let deleteStudent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    deleteStudent = vi.fn().mockResolvedValue(undefined);

    // true = the desktop DataTable branch, which is where the row action lives.
    vi.mocked(useMediaQueryHooks.useMediaQuery).mockReturnValue(true);
    vi.mocked(useAttendanceHooks.useAttendanceSummary).mockReturnValue(
      asSummary({
        data: { items: [STUDENT], total: 1, skip: 0, limit: 20, legacy_hidden: 0 },
        isLoading: false,
      })
    );
    vi.mocked(useAttendanceHooks.useDeleteAttendance).mockReturnValue(
      asDeleteAttendance(idleMutation)
    );
    vi.mocked(useStudentsHooks.useUpdateStudent).mockReturnValue(asUpdateStudent(idleMutation));
    vi.mocked(useStudentsHooks.useMergeStudent).mockReturnValue(asMergeStudent(idleMutation));
    vi.mocked(useStudentsHooks.useDeleteStudent).mockReturnValue(
      asDeleteStudent({ mutateAsync: deleteStudent, isPending: false })
    );
  });

  const clickDelete = async () => {
    const user = userEvent.setup();
    render(<StudentLogs classId={classId} />);
    await user.click(screen.getByRole('button', { name: 'Poista opiskelija' }));
    return user;
  };

  it('deletes nothing on the first click, and asks instead', async () => {
    await clickDelete();

    expect(screen.getByRole('alertdialog', { name: /Poista opiskelija\?/ })).toBeInTheDocument();
    expect(deleteStudent).not.toHaveBeenCalled();
  });

  it('names the student in the question', async () => {
    await clickDelete();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Liisa Korhonen');
  });

  it('says how much history goes with them, and that it cannot be undone', async () => {
    await clickDelete();

    const dialog = screen.getByRole('alertdialog');
    // The count is the student's own tally, not a constant: AC5 asks for the history loss to be
    // stated, and "15" is the part that makes it concrete.
    expect(dialog).toHaveTextContent('15');
    expect(dialog).toHaveTextContent(/läsnäolomerkintä/);
    expect(dialog).toHaveTextContent(/ei voi perua/);
  });

  it('deletes the named student only once confirmed', async () => {
    const user = await clickDelete();

    await user.click(screen.getByRole('button', { name: 'Poista' }));

    expect(deleteStudent).toHaveBeenCalledTimes(1);
    expect(deleteStudent).toHaveBeenCalledWith(STUDENT.student_id);
  });

  it('deletes nothing when the question is declined', async () => {
    const user = await clickDelete();

    await user.click(screen.getByRole('button', { name: 'Peruuta' }));

    expect(deleteStudent).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
