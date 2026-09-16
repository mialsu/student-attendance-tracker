/**
 * AC9 / US-22: *Tilastot* charts attendance with a **day/month toggle**, and the per-day table
 * stays beside it (Owner, 2026-09-11 — the exact figures are worth keeping, the second chart was
 * not).
 *
 * Before this the surface carried two near-identical chart cards, one per granularity, and no
 * toggle at all; US-22's "day/month bar chart" was served by showing both at once. Collapsing
 * them is what makes the toggle meaningful rather than decorative.
 *
 * **Recharts draws nothing in jsdom** — `ResponsiveContainer` measures 0×0 — so this file asserts
 * the control and *which* dataset the chart has been asked for, by the heading that names it. The
 * drawing itself is the browser walk's job (`e2e/states.spec.ts`, both granularities swept).
 *
 * Mocked at the hook seam, the pattern `error-states.test.tsx` established. Nothing here reaches
 * the network; `src/test/setup.ts` fails the test if it tries.
 *
 * **The second suite below is spec 0008's timeframe** — AC-10, AC-11, AC-12, AC-13 and AC-14. Its
 * mock is an *implementation* rather than a fixed value, which is the one trick in this file worth
 * explaining: it answers a range with no records and answers no range with records, so it models
 * the case the empty-range state exists for — a Kurssi that HAS attendance, filtered to a month
 * that does not. A fixed return value cannot express that, and picking a date from the all-time
 * empty state is impossible by design (that branch renders no filter, because there is nothing to
 * filter).
 *
 * What it cannot see is the query string: the mock stands where `getStatistics` would, so every
 * assertion here would pass with both ends shifted by a day. `src/api/__tests__/attendance.test.ts`
 * owns that, and AC-9 is why it is a separate file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import ClassStatistics from '@/pages/ClassStatistics';
import * as useAttendanceHooks from '@/hooks/useAttendance';

vi.mock('@/hooks/useAttendance');

/** The hook returns far more than this surface reads, so the cast names what it stands in for. */
const asStatistics = (v: unknown) =>
  v as ReturnType<typeof useAttendanceHooks.useAttendanceStatistics>;

const STATISTICS = {
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

const DAY_CHART = 'Läsnäolot päivittäin (kaavio)';
const MONTH_CHART = 'Läsnäolot kuukausittain (kaavio)';

describe('ClassStatistics — the day/month toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
      asStatistics({ data: STATISTICS, isLoading: false, error: null, refetch: vi.fn() })
    );
  });

  it('offers the two granularities as a radiogroup, days first', () => {
    render(<ClassStatistics classId="c1" />);

    const group = screen.getByRole('radiogroup', { name: /jakso/i });
    expect(group).toBeInTheDocument();

    // Radix's ToggleGroup root is a plain `group` until it is told otherwise, and its
    // single-select items are `role="radio"`. This assertion is the only enforcer of the pairing:
    // axe does not flag a radio outside a radiogroup, measured on 2026-09-11 by deleting the
    // `role` and watching the whole walk stay green.
    expect(screen.getByRole('radio', { name: 'Päivät' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Kuukaudet' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('charts one granularity at a time, not both', () => {
    render(<ClassStatistics classId="c1" />);

    expect(screen.getByText(DAY_CHART)).toBeInTheDocument();
    expect(screen.queryByText(MONTH_CHART)).not.toBeInTheDocument();
  });

  it('swaps the chart to months when the toggle is switched', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await user.click(screen.getByRole('radio', { name: 'Kuukaudet' }));

    expect(screen.getByText(MONTH_CHART)).toBeInTheDocument();
    expect(screen.queryByText(DAY_CHART)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Kuukaudet' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Päivät' })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves between the two from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    const days = screen.getByRole('radio', { name: 'Päivät' });
    const months = screen.getByRole('radio', { name: 'Kuukaudet' });

    days.focus();
    expect(days).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(months).toHaveFocus();
  });

  // The Owner's decision, and the reason the toggle is not simply a replacement: a chart cannot
  // be read to the day, and she reads it to the day.
  it('keeps the per-day table alongside the chart', () => {
    render(<ClassStatistics classId="c1" />);

    expect(screen.getByText('Läsnäolot päivittäin')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Päivämäärä' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Läsnäolot' })).toBeInTheDocument();
  });

  // AC9's other half. The empty branch owns the whole surface, so there is no chart frame and no
  // toggle to press — DESIGN.md §3.
  it('shows the no-data state with no chart and no toggle', () => {
    vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
      asStatistics({
        data: { total_records: 0, total_students: 0, daily_stats: [], monthly_stats: [] },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
    );

    render(<ClassStatistics classId="c1" />);

    expect(screen.getByText('Ei läsnäoloja näytettäväksi')).toBeInTheDocument();
    expect(
      screen.getByText('Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText(DAY_CHART)).not.toBeInTheDocument();
    expect(screen.queryByText(MONTH_CHART)).not.toBeInTheDocument();
  });
});

/**
 * Spec 0008 slices 2 and 3 — the timeframe.
 *
 * The clock matters here and is not stubbed: the calendar opens on the current month and refuses
 * future days, so the days these tests click have to be real past days. They are named by their
 * number, which is unambiguous in the grid — the only days shown from a neighbouring month are the
 * few that pad the first and last weeks.
 */
describe('ClassStatistics — the timeframe (spec 0008)', () => {
  /** Records exist, but not in the chosen range. The state the filter's empty branch is for. */
  const NOTHING_IN_RANGE = {
    total_records: 0,
    total_students: 0,
    first_date: null,
    last_date: null,
    daily_stats: [],
    monthly_stats: [],
  };

  const FROM = 'Alkaen';
  const TO = 'Päättyen';
  const CLEAR = 'Tyhjennä aikaväli';
  const ALL_DAYS = 'Kaikki päivät, joilta läsnäoloja on kirjattu';
  const RANGE_DAYS = 'Päivät valitulla aikavälillä';

  /** A past day that is unambiguous in the open grid, and its Finnish short form. */
  const DAY = { number: '10', finnish: () => shortFi(10) };
  const OTHER_DAY = { number: '15', finnish: () => shortFi(15) };

  /** `format(d, 'P', { locale: fi })` for a day in the month the calendar opens on. */
  function shortFi(dayOfMonth: number): string {
    const now = new Date();
    return `${dayOfMonth}.${now.getMonth() + 1}.${now.getFullYear()}`;
  }

  /**
   * The mock as a function of the range, which is what lets one `beforeEach` serve every test
   * here. `onRange` defaults to "no records", so picking any range lands in the empty-range state
   * unless a test says otherwise.
   */
  const mockByRange = (onRange: Record<string, unknown> = { data: NOTHING_IN_RANGE }) => {
    vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockImplementation((_classId, params) => {
      const ranged = Boolean(params?.dateFrom || params?.dateTo);
      return asStatistics({
        data: STATISTICS,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        ...(ranged ? onRange : {}),
      });
    });
  };

  /** Open one end's calendar, click a day by its number, and close the popover behind us. */
  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    end: string,
    dayNumber: string
  ) => {
    await user.click(screen.getByLabelText(end));
    // `getByRole` is strict, and that strictness is the assertion: a day number matching twice
    // would mean two calendars are open at once, which is the bug Escape below prevents.
    await user.click(screen.getByRole('gridcell', { name: dayNumber }));
    await user.keyboard('{Escape}');
  };

  /** The days the open calendar refuses, by number. */
  const disabledDays = (): string[] =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button[name="day"]'))
      .filter((b) => b.disabled)
      .map((b) => b.textContent ?? '');

  beforeEach(() => {
    vi.clearAllMocks();
    mockByRange();
  });

  // --- AC-10 ---------------------------------------------------------------------------------

  it('opens with no timeframe, so the whole Kurssi is on screen and nothing is configured', () => {
    render(<ClassStatistics classId="c1" />);

    // US-4. Both ends empty, and the table still claims every day — which is true here.
    expect(screen.getByLabelText(FROM)).toHaveTextContent('Valitse päivämäärä');
    expect(screen.getByLabelText(TO)).toHaveTextContent('Valitse päivämäärä');
    expect(screen.getByText(ALL_DAYS)).toBeInTheDocument();
    expect(screen.getByText(String(STATISTICS.total_records))).toBeInTheDocument();
    // Nothing to clear, so no clear action in the tab order.
    expect(screen.queryByRole('button', { name: CLEAR })).not.toBeInTheDocument();
  });

  it('re-queries with the picked start date, and the hook sees it', async () => {
    const user = userEvent.setup();
    mockByRange({ data: STATISTICS });
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);

    // The hook is the seam, so "re-queries" is provable only as "was called with the range".
    const calls = vi.mocked(useAttendanceHooks.useAttendanceStatistics).mock.calls;
    const [, params] = calls[calls.length - 1];
    expect(params?.dateFrom).toBeInstanceOf(Date);
    expect(params?.dateFrom?.getDate()).toBe(Number(DAY.number));
    expect(params?.dateTo).toBeUndefined();
    // And the exclusion the page has always sent is still going with it.
    expect(params?.excludeDates).toEqual(['2026-02-27']);
  });

  it('shows the picked day on the trigger, in the Finnish short form', async () => {
    const user = userEvent.setup();
    mockByRange({ data: STATISTICS });
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);

    // US-21: 10.9.2026, the way she writes it — not 2026-09-10 and not September 10th.
    expect(screen.getByLabelText(FROM)).toHaveTextContent(DAY.finnish());
  });

  it('retitles the per-day table, because "kaikki päivät" is false under a timeframe', async () => {
    const user = userEvent.setup();
    mockByRange({ data: STATISTICS });
    render(<ClassStatistics classId="c1" />);

    expect(screen.getByText(ALL_DAYS)).toBeInTheDocument();

    await pick(user, FROM, DAY.number);

    // Decision 13.
    expect(screen.getByText(RANGE_DAYS)).toBeInTheDocument();
    expect(screen.queryByText(ALL_DAYS)).not.toBeInTheDocument();
  });

  // --- AC-12 ---------------------------------------------------------------------------------

  it('offers no future day at either end', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await user.click(screen.getByLabelText(FROM));

    // US-20. Today is selectable; tomorrow is not, and neither is anything after it.
    const today = new Date().getDate();
    const refused = disabledDays();
    expect(refused).not.toContain(String(today));
    expect(refused).toContain(String(today + 1));
  });

  it('Alkaen offers no day after a chosen Päättyen', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await pick(user, TO, DAY.number);
    await user.click(screen.getByLabelText(FROM));

    // US-19, the half the server's 422 backstops. The chosen end itself stays available — a
    // single-day timeframe is a legitimate thing to ask for.
    const refused = disabledDays();
    expect(refused).toContain(OTHER_DAY.number);
    expect(refused).not.toContain(DAY.number);
  });

  it('Päättyen offers no day before a chosen Alkaen', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, OTHER_DAY.number);
    await user.click(screen.getByLabelText(TO));

    const refused = disabledDays();
    expect(refused).toContain(DAY.number);
    expect(refused).not.toContain(OTHER_DAY.number);
  });

  // --- AC-14 ---------------------------------------------------------------------------------

  it('keeps the chosen dates when the Päivät/Kuukaudet toggle is flipped', async () => {
    const user = userEvent.setup();
    mockByRange({ data: STATISTICS });
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);
    expect(screen.getByLabelText(FROM)).toHaveTextContent(DAY.finnish());

    await user.click(screen.getByRole('radio', { name: 'Kuukaudet' }));

    // US-13: changing granularity must not cost the filter. The two live in separate state, and
    // this is what says so — a single `useState` object reset by the toggle would fail here.
    expect(screen.getByText(MONTH_CHART)).toBeInTheDocument();
    expect(screen.getByLabelText(FROM)).toHaveTextContent(DAY.finnish());
    expect(screen.getByText(RANGE_DAYS)).toBeInTheDocument();
  });

  // --- AC-11 ---------------------------------------------------------------------------------

  it('answers an empty timeframe by naming both dates, not by advising a new log', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);
    await pick(user, TO, OTHER_DAY.number);

    // US-15, US-16. The sentence carries her own dates back so she can see her own mistake in it.
    expect(
      screen.getByText(`Aikavälillä ${DAY.finnish()} – ${OTHER_DAY.finnish()} ei ole kirjattuja läsnäoloja.`)
    ).toBeInTheDocument();
    // US-18's other half: the advice meant for a teacher who has never logged anything must NOT
    // appear here. This is the defect DESIGN.md §3 calls "an empty state lying about an error",
    // one filter along — she has hundreds of records, just not in September.
    expect(screen.queryByText('Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot.')).not.toBeInTheDocument();
    expect(screen.queryByText('Ei läsnäoloja näytettäväksi')).not.toBeInTheDocument();
    // And no chart frame or toggle over no data.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('names a one-ended timeframe too, rather than rendering an undefined date', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);

    expect(
      screen.getByText(`Aikavälillä ${DAY.finnish()} alkaen ei ole kirjattuja läsnäoloja.`)
    ).toBeInTheDocument();
  });

  it('offers a way out of an empty timeframe on the screen itself', async () => {
    const user = userEvent.setup();
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);
    expect(screen.getByText(/ei ole kirjattuja läsnäoloja/)).toBeInTheDocument();

    // US-17: a dead end is the failure. One press, not a second date-picking exercise (US-5).
    await user.click(screen.getByRole('button', { name: CLEAR }));

    expect(screen.queryByText(/ei ole kirjattuja läsnäoloja/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(FROM)).toHaveTextContent('Valitse päivämäärä');
    expect(screen.getByText(ALL_DAYS)).toBeInTheDocument();
    expect(screen.getByText(String(STATISTICS.total_records))).toBeInTheDocument();
  });

  it('still tells a Kurssi with no attendance at all to log some', () => {
    // US-18. No range, no records — the original advice, and it still fits. The filter is absent
    // because there is nothing to filter, so this state is exactly what it was before spec 0008.
    vi.mocked(useAttendanceHooks.useAttendanceStatistics).mockReturnValue(
      asStatistics({ data: NOTHING_IN_RANGE, isLoading: false, error: null, refetch: vi.fn() })
    );

    render(<ClassStatistics classId="c1" />);

    expect(screen.getByText('Ei läsnäoloja näytettäväksi')).toBeInTheDocument();
    expect(
      screen.getByText('Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/ei ole kirjattuja läsnäoloja/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(FROM)).not.toBeInTheDocument();
  });

  // --- AC-13 ---------------------------------------------------------------------------------

  it('renders the error state under a timeframe, never the empty-range one', async () => {
    const user = userEvent.setup();
    // Both at once, deliberately: a failed request leaves `total_records` at 0 as well, so this
    // mock is the ambiguity itself and the test proves which branch owns it. US-26, and the same
    // shape spec 0006 fixed one layer up.
    mockByRange({ data: NOTHING_IN_RANGE, error: new Error('kaatui') });
    render(<ClassStatistics classId="c1" />);

    await pick(user, FROM, DAY.number);

    expect(screen.getByRole('alert')).toHaveTextContent('Tilastojen lataaminen epäonnistui');
    expect(screen.queryByText(/ei ole kirjattuja läsnäoloja/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ei läsnäoloja näytettäväksi')).not.toBeInTheDocument();
  });
});
