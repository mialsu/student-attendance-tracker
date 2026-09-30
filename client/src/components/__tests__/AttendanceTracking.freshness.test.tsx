import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import AttendanceTracking from '../AttendanceTracking';
import { studentsApi } from '@/api/students';
import { attendanceApi } from '@/api/attendance';
import type { AttendanceRecord, StudentAutocomplete } from '@/api/types';

/**
 * A Student logged a minute ago must be findable by any part of their name.
 *
 * Reported by the teacher on 2026-09-30: "al" found Aleksi and "alek" did not. Every typed prefix's
 * answer was cached for five minutes and no mutation refreshed it, so a prefix first asked before a
 * Student existed went on answering "nobody" after they were created. Since spec 0006 the field says
 * so out loud — "Ei osumia — nimellä alek luodaan uusi opiskelija." — which is why it read as broken
 * rather than as slow. It bites hardest at the start of a term: new names copied off a paper sheet,
 * then the same names again for the next day.
 *
 * Mocked at the `src/api` seam with the real hooks and a real QueryClient, because the defect lived
 * in the cache between them. `AttendanceTracking.test.tsx` mocks the hook itself and structurally
 * cannot see it.
 */

vi.mock('@/api/students', () => ({
  studentsApi: { getAutocomplete: vi.fn() },
}));

vi.mock('@/api/attendance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/attendance')>();
  return { ...actual, attendanceApi: { ...actual.attendanceApi, create: vi.fn() } };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

/** The Kurssi's register, as the server would hold it. Logging a new name adds a Student. */
let register: StudentAutocomplete[] = [];

const answer = (query: string) =>
  register.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

/**
 * What `POST /attendance` returns, reduced to what `AttendanceTracking` reads. Cast, because the
 * type still requires the deprecated first/last-name pair the drift gate bans from new code.
 */
const logged = (studentName: string) =>
  ({
    id: `record-${register.length}`,
    class_id: 'c1',
    timestamp: '2026-09-30T08:00:00Z',
    created_at: '2026-09-30T08:00:00Z',
    student_name: studentName,
    quantity_created: 1,
  }) as AttendanceRecord;

const renderWithClient = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
};

/** How many times the server was asked about exactly this text. */
const asked = (query: string) =>
  vi.mocked(studentsApi.getAutocomplete).mock.calls.filter(([, q]) => q === query).length;

/** Whether the server was asked about this text after the first attendance was logged. */
const askedSinceLogging = (query: string) => {
  const logging = vi.mocked(attendanceApi.create).mock.invocationCallOrder[0] ?? Infinity;
  const { calls, invocationCallOrder } = vi.mocked(studentsApi.getAutocomplete).mock;
  return calls.some(([, q], i) => q === query && (invocationCallOrder[i] ?? 0) > logging);
};

describe('the name field after a new Student is logged', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    register = [{ id: 's1', name: 'Kalle Alanen', total_attendance: 5 }];

    vi.mocked(studentsApi.getAutocomplete).mockImplementation(async (_classId, query) =>
      answer(query),
    );
    vi.mocked(attendanceApi.create).mockImplementation(async (_classId, data) => {
      const known = register.some(
        (s) => s.name.toLowerCase() === data.student_name.toLowerCase(),
      );
      if (!known) {
        register = [
          ...register,
          { id: `s${register.length + 1}`, name: data.student_name, total_attendance: 1 },
        ];
      }
      return logged(data.student_name);
    });
  });

  it('finds her by a prefix that was asked before she existed', async () => {
    const user = userEvent.setup();
    renderWithClient(<AttendanceTracking classId="c1" />);
    const field = screen.getByLabelText('Opiskelijan nimi');

    // Before Aleksi exists, "alek" is asked and truthfully answered with nobody.
    await user.type(field, 'alek');
    expect(await screen.findByText(/Ei osumia/, {}, { timeout: 2000 })).toBeInTheDocument();

    // The rest of the name, and Enter: a name nobody matches is logged as a new Student. Enter
    // rather than a click on the button keeps focus in the field, as her keyboard flow does.
    await user.type(field, 'si Virtanen{Enter}');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(register.map((s) => s.name)).toContain('aleksi Virtanen');

    // The same four letters again, for the next day on the sheet.
    await user.type(field, 'alek');

    const list = await screen.findByRole('listbox', {}, { timeout: 2000 });
    expect(list).toHaveTextContent('aleksi Virtanen');
    expect(screen.queryByText(/Ei osumia/)).not.toBeInTheDocument();
    // The answer came from the server after she was logged. How many requests that took depends
    // on where the debounce landed; that one of them came after the logging is the fix.
    expect(askedSinceLogging('alek')).toBe(true);
  });

  it('does not claim nobody matches while the answer is being fetched again', async () => {
    const user = userEvent.setup();
    const client = renderWithClient(<AttendanceTracking classId="c1" />);
    const field = screen.getByLabelText('Opiskelijan nimi');

    await user.type(field, 'zz');
    expect(await screen.findByText(/Ei osumia/, {}, { timeout: 2000 })).toBeInTheDocument();

    // Something elsewhere changes the register — a rename on *Läsnäolot*, say — and the answer on
    // screen is being fetched again. Held open, so the in-between state stays still for the test.
    let release: (value: StudentAutocomplete[]) => void = () => {};
    vi.mocked(studentsApi.getAutocomplete).mockImplementationOnce(
      () => new Promise<StudentAutocomplete[]>((resolve) => (release = resolve)),
    );
    void client.invalidateQueries({ queryKey: ['students-autocomplete'] });
    await waitFor(() => expect(asked('zz')).toBe(2));

    // The old empty answer is still what the cache holds, and it is no longer the answer.
    expect(screen.queryByText(/Ei osumia/)).not.toBeInTheDocument();

    release([]);
    expect(await screen.findByText(/Ei osumia/)).toBeInTheDocument();
  });
});
