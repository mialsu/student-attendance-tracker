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
