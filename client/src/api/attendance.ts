import { format } from 'date-fns';
import { apiClient } from './client';
import type { AttendanceRecord, AttendanceSummary, PaginatedAttendanceSummaryResponse } from './types';

export interface CreateAttendanceRequest {
  student_name: string;      // NEW: Single field
  quantity?: number;         // NEW: Bulk logging (1-50, default 1)
  timestamp?: string;        // ISO 8601 format, optional - defaults to current time on server

  // DEPRECATED: Keep for backward compatibility during migration
  student_first_name?: string;
  student_last_name?: string;
}

export interface GetSummaryParams {
  skip?: number;
  limit?: number;
  search?: string;
  sort_by?: 'attendance_desc' | 'name_asc';
  /** Show students whose first attendance is over five years old. Omitted, they are hidden. */
  legacy?: boolean;
}

export interface DailyStatistic {
  date: string; // ISO format: "2024-01-15"
  count: number;
}

export interface MonthlyStatistic {
  year_month: string; // Format: "2024-01"
  count: number;
}

export interface AttendanceStatistics {
  total_records: number;
  total_students: number;
  first_date: string | null;
  last_date: string | null;
  daily_stats: DailyStatistic[];
  monthly_stats: MonthlyStatistic[];
}

export interface GetStatisticsParams {
  /** Days to leave out entirely. Omitted or empty, nothing is excluded. */
  excludeDates?: string[];
  /** First day to include, inclusive. Omitted, the timeframe has no start. */
  dateFrom?: Date;
  /** Last day to include, inclusive of that whole day. Omitted, the timeframe has no end. */
  dateTo?: Date;
}

/**
 * A picked `Date` as the server reads it: the LOCAL calendar day, never the UTC one.
 *
 * `toISOString()` is the trap, and it is silent. A day picked as 1.9.2026 is local midnight; in
 * UTC+3 `toISOString().slice(0, 10)` yields `2026-08-31`, so both ends of every range would shift
 * back a day for the half of the year Finland spends on summer time. `format` reads the local
 * fields, which is what the teacher picked and what `date_from`/`date_to` mean — spec 0008
 * decision 10, and the server buckets by local day too (spec 0009).
 *
 * Exported because it is also the queryKey's serialization: the key and the request have to agree
 * about which day a `Date` is, or the cache answers one range with another's rows.
 */
export const toApiDate = (d: Date): string => format(d, 'yyyy-MM-dd');

export const attendanceApi = {
  async create(classId: string, data: CreateAttendanceRequest): Promise<AttendanceRecord> {
    const response = await apiClient.post(`/api/classes/${classId}/attendance`, data);
    return response.data;
  },

  async delete(recordId: string): Promise<void> {
    await apiClient.delete(`/api/attendance/${recordId}`);
  },

  async getSummary(
    classId: string,
    params?: GetSummaryParams
  ): Promise<PaginatedAttendanceSummaryResponse> {
    const response = await apiClient.get(`/api/classes/${classId}/attendance/summary`, {
      params,
    });
    return response.data;
  },

  /**
   * Every figure the statistics endpoint returns describes the timeframe — the four summary
   * counts included, not just the buckets (spec 0008 decision 5). An omitted end means that end
   * is unbounded, so no parameters at all is the whole Kurssi, which is how the page opens.
   */
  async getStatistics(
    classId: string,
    params?: GetStatisticsParams
  ): Promise<AttendanceStatistics> {
    const query: Record<string, string> = {};
    if (params?.excludeDates && params.excludeDates.length > 0) {
      query.exclude_dates = params.excludeDates.join(',');
    }
    // Each end is sent only when it is set. An `undefined` here would still reach the wire as
    // `date_from=` on some axios versions, and an empty string is a 422 rather than "unfiltered".
    if (params?.dateFrom) query.date_from = toApiDate(params.dateFrom);
    if (params?.dateTo) query.date_to = toApiDate(params.dateTo);

    const response = await apiClient.get(`/api/classes/${classId}/attendance/statistics`, {
      params: query,
    });
    return response.data;
  },
};
