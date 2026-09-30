import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import StudentLogs from '../StudentLogs';
import { attendanceApi } from '@/api/attendance';
import type { GetSummaryParams } from '@/api/attendance';
import type { PaginatedAttendanceSummaryResponse } from '@/api/types';

/**
 * The *Läsnäolot* search box, while a search is running.
 *
 * Reported by the teacher on 2026-09-30, and reproduced the same day: type "al", pause, type "ek",
 * and the field still read "al". Every debounced search sent the component back into its loading
 * branch, which replaced the whole card — search box included — so the box she was typing into was
 * unmounted mid-word and a new one mounted without focus. The "ek" went nowhere.
 *
 * The fix keeps the rows on screen until the next answer arrives (DESIGN.md §3). These tests hold
 * it to that from the outside: the same element keeps focus, the words under the table describe
 * the rows on screen, and nothing fades before 300 ms.
 *
 * Mocked at the `src/api` seam with the real hooks and a real QueryClient. The defect was an
 * interaction between the query and the render, which a hook mock cannot reproduce.
 */

vi.mock('@/api/attendance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/attendance')>();
  return { ...actual, attendanceApi: { ...actual.attendanceApi, getSummary: vi.fn() } };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const REGISTER = [
  { name: 'Aleksi Virtanen', attended: 9 },
  { name: 'Kalle Alanen', attended: 7 },
  { name: 'Väinö Nieminen', attended: 4 },
];

/** What the summary endpoint answers for these parameters, from the register above. */
const summary = (params?: GetSummaryParams): PaginatedAttendanceSummaryResponse => {
  const matching = REGISTER.filter(
    (s) => !params?.search || s.name.toLowerCase().includes(params.search.toLowerCase()),
  );
  return {
    items: matching.map((s, i) => ({
      student_id: `s${i}`,
      student_name: s.name,
      course_credit_received: false,
      total_attendance: s.attended,
      records: [],
    })),
    total: matching.length,
    skip: params?.skip ?? 0,
    limit: params?.limit ?? 20,
    legacy_hidden: 0,
  };
};

const renderWithClient = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
  const rendered = render(wrap(ui));
  return { ...rendered, rerender: (next: ReactNode) => rendered.rerender(wrap(next)) };
};

const searchBox = () => screen.getByPlaceholderText('Etsi opiskelijan nimellä...');

/** Resolves once the summary endpoint has been asked about exactly this search. */
const askedAbout = (search: string) =>
  waitFor(
    () =>
      expect(vi.mocked(attendanceApi.getSummary)).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ search }),
      ),
    { timeout: 2000 },
  );

/** The next summary request, held open until the test releases it. */
const holdNextAnswer = () => {
  let release = () => {};
  vi.mocked(attendanceApi.getSummary).mockImplementationOnce(
    (_classId, params) =>
      new Promise((resolve) => {
        release = () => resolve(summary(params));
      }),
  );
  return () => release();
};

describe('the Läsnäolot search box while a search runs', () => {
  beforeEach(() => {
    // reset, not clear: a held answer a test never released must not become the next test's
    // first load. `clearAllMocks` keeps queued `mockImplementationOnce` calls.
    vi.resetAllMocks();
    vi.mocked(attendanceApi.getSummary).mockImplementation(async (_classId, params) =>
      summary(params),
    );
  });

  it('keeps the same box, focused, so the next letters land in it', async () => {
    const user = userEvent.setup();
    renderWithClient(<StudentLogs classId="c1" />);

    // The first load has no rows to keep, so it still shows its loading card.
    expect(screen.getByText('Ladataan lokeja...')).toBeInTheDocument();
    const field = await screen.findByPlaceholderText('Etsi opiskelijan nimellä...');

    await user.click(field);
    await user.type(field, 'al');
    await askedAbout('al');
    expect(await screen.findByText(/Löytyi 2 opiskelijaa haulla "al"/)).toBeInTheDocument();

    // The defect, exactly as she met it: the box she typed "al" into must still be the box on
    // screen, still focused, so "ek" typed without touching the mouse lands after it.
    expect(searchBox()).toBe(field);
    expect(field).toHaveFocus();
    await user.keyboard('ek');
    expect(field).toHaveValue('alek');
  });

  it('describes the rows on screen, not a search that has not answered yet', async () => {
    const user = userEvent.setup();
    renderWithClient(<StudentLogs classId="c1" />);
    const field = await screen.findByPlaceholderText('Etsi opiskelijan nimellä...');

    await user.type(field, 'al');
    expect(await screen.findByText(/Löytyi 2 opiskelijaa haulla "al"/)).toBeInTheDocument();

    const release = holdNextAnswer();
    // Typed into whatever box is on screen now, so this test fails on its own point — the rows
    // disappearing — rather than on the lost box the test above is about.
    await user.type(searchBox(), 'ek');
    await askedAbout('alek');

    // While "alek" is on its way, the "al" rows stay — and so does the sentence about them.
    // A sentence naming "alek" over the two "al" rows would describe rows that are not there.
    const table = screen.getByRole('table');
    expect(within(table).getByText('Kalle Alanen')).toBeInTheDocument();
    expect(screen.getByText(/Löytyi 2 opiskelijaa haulla "al"/)).toBeInTheDocument();

    release();
    expect(await screen.findByText(/Löytyi 1 opiskelija haulla "alek"/)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Kalle Alanen')).not.toBeInTheDocument();
  });

  it('never keeps one Kurssi\'s rows on screen under another\'s heading', async () => {
    // With the tab open, picking another Kurssi in the sidebar re-renders this component with a
    // new `classId` rather than mounting a fresh one, so "keep the rows until the next answer"
    // would show the last Kurssi's Students as this one's until its own arrived.
    const { rerender } = renderWithClient(<StudentLogs classId="c1" />);
    expect(await screen.findByText('Kalle Alanen')).toBeInTheDocument();

    holdNextAnswer();
    rerender(<StudentLogs classId="c2" />);
    await waitFor(() =>
      expect(vi.mocked(attendanceApi.getSummary)).toHaveBeenCalledWith('c2', expect.anything()),
    );

    expect(screen.queryByText('Kalle Alanen')).not.toBeInTheDocument();
    expect(screen.getByText('Ladataan lokeja...')).toBeInTheDocument();
  });

  it('fades the old rows only once an answer has taken longer than 300 ms', async () => {
    const user = userEvent.setup();
    const { container } = renderWithClient(<StudentLogs classId="c1" />);
    const field = await screen.findByPlaceholderText('Etsi opiskelijan nimellä...');
    const busy = () => screen.getByRole('table').getAttribute('aria-busy') === 'true';
    const spinning = () => container.querySelector('.animate-spin') !== null;

    const release = holdNextAnswer();
    await user.type(field, 'al');
    await askedAbout('al');

    // Most answers arrive well inside 300 ms, and a fade that comes and goes that fast reads as a
    // flicker (DESIGN.md §3). So at first nothing changes at all.
    expect(busy()).toBe(false);
    expect(spinning()).toBe(false);

    await waitFor(
      () => {
        expect(busy()).toBe(true);
        expect(spinning()).toBe(true);
      },
      { timeout: 1000 },
    );

    release();
    expect(await screen.findByText(/Löytyi 2 opiskelijaa haulla "al"/)).toBeInTheDocument();
    expect(busy()).toBe(false);
    expect(spinning()).toBe(false);
    expect(field).toHaveFocus();
  });
});
