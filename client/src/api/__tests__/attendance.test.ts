/**
 * AC-9: what `getStatistics` actually puts on the wire.
 *
 * **Why this seam is worth its own file.** `ClassStatistics.test.tsx` mocks `useAttendance`, which
 * sits *above* `getStatistics` — so nothing there can see a wrong query string, and every
 * assertion in it would pass with both ends of every range shifted by a day. That shift is the
 * failure spec 0008 decision 10 names: a day picked as 1.9.2026 is local midnight, and
 * `toISOString().slice(0, 10)` yields `2026-08-31` under a UTC+3 clock. It produces
 * correct-LOOKING dates, so reading the screen does not find it and the teacher's September
 * quietly starts on 31 August.
 *
 * `process.env.TZ` is set to Europe/Helsinki before anything imports, so the September dates below
 * are UTC+3 and the trap is live rather than hypothetical — under a UTC runner every assertion
 * here would pass against `toISOString` and prove nothing. `assertTrapIsLive` fails loudly if the
 * zone ever stops biting, because a test that can no longer go red is not a test.
 */
process.env.TZ = 'Europe/Helsinki';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attendanceApi, toApiDate } from '../attendance';
import { apiClient } from '../client';

// The suite forbids the network (`src/test/setup.ts`), and this is the seam under test, so the
// transport is mocked and the PARAMETERS are the assertion.
vi.mock('../client', () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

const CLASS_ID = 'c1';
const STATISTICS_URL = `/api/classes/${CLASS_ID}/attendance/statistics`;

/** Local midnight, the way `Calendar mode="single"` hands a picked day back. */
const picked = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/** The params object of the single `apiClient.get` call. */
const sentParams = (): Record<string, string> => {
  const get = vi.mocked(apiClient.get);
  expect(get).toHaveBeenCalledTimes(1);
  const [url, config] = get.mock.calls[0] as [string, { params: Record<string, string> }];
  expect(url).toBe(STATISTICS_URL);
  return config.params;
};

describe('getStatistics — the timeframe on the wire', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockClear();
  });

  it('is running under a clock where toISOString would be wrong', () => {
    // The premise of every assertion below. 1.9.2026 local midnight is 2026-08-31T21:00Z here, so
    // the naive serialization loses a day. If a runner ever makes this pass, the tests that follow
    // stop proving anything and this one says so first.
    const first = picked(2026, 9, 1);
    expect(first.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(toApiDate(first)).toBe('2026-09-01');
  });

  it('sends the LOCAL day for a date picked as 1.9.2026, not the UTC one', async () => {
    await attendanceApi.getStatistics(CLASS_ID, { dateFrom: picked(2026, 9, 1) });

    // Watched red against `toISOString().slice(0, 10)`, which sends 2026-08-31.
    expect(sentParams()).toEqual({ date_from: '2026-09-01' });
  });

  it('sends the whole range, both ends as local days', async () => {
    await attendanceApi.getStatistics(CLASS_ID, {
      dateFrom: picked(2026, 9, 1),
      dateTo: picked(2026, 9, 30),
    });

    expect(sentParams()).toEqual({ date_from: '2026-09-01', date_to: '2026-09-30' });
  });

  it('holds in winter too, where the offset is +02 rather than +03', async () => {
    // A hardcoded offset passes one of these two and fails the other, which is the point — the
    // same argument spec 0009's server tests make at both DST offsets.
    await attendanceApi.getStatistics(CLASS_ID, {
      dateFrom: picked(2026, 1, 1),
      dateTo: picked(2026, 1, 31),
    });

    expect(sentParams()).toEqual({ date_from: '2026-01-01', date_to: '2026-01-31' });
  });

  it('sends neither parameter when the range is unset — omitted means unfiltered', async () => {
    // US-29 / AC-1: the page opens like this, and every pre-0008 caller looks exactly like it.
    await attendanceApi.getStatistics(CLASS_ID);

    expect(sentParams()).toEqual({});
  });

  it('sends only the end that is set, so a one-ended range stays one-ended', async () => {
    await attendanceApi.getStatistics(CLASS_ID, { dateTo: picked(2026, 9, 30) });

    const params = sentParams();
    expect(params).toEqual({ date_to: '2026-09-30' });
    // Not `date_from: ''`, which the server reads as a malformed date and refuses with a 422
    // rather than as "no start".
    expect('date_from' in params).toBe(false);
  });

  it('keeps carrying exclude_dates, and carries it alongside a range', async () => {
    await attendanceApi.getStatistics(CLASS_ID, {
      excludeDates: ['2026-02-27'],
      dateFrom: picked(2026, 9, 1),
    });

    expect(sentParams()).toEqual({ exclude_dates: '2026-02-27', date_from: '2026-09-01' });
  });

  it('omits exclude_dates for an empty array rather than sending a blank one', async () => {
    await attendanceApi.getStatistics(CLASS_ID, { excludeDates: [] });

    expect(sentParams()).toEqual({});
  });
});
