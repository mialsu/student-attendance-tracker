import { apiClient } from './client';
import type { AttendanceRecord, AttendanceSummary, PaginatedAttendanceResponse, PaginatedAttendanceSummaryResponse } from './types';

export interface CreateAttendanceRequest {
  student_name: string;      // NEW: Single field
  quantity?: number;         // NEW: Bulk logging (1-50, default 1)
  timestamp?: string;        // ISO 8601 format, optional - defaults to current time on server

  // DEPRECATED: Keep for backward compatibility during migration
  student_first_name?: string;
  student_last_name?: string;
}

export interface ListAttendanceParams {
  skip?: number;
  limit?: number;
  student_name?: string;
  date_from?: string; // ISO 8601 format
  date_to?: string; // ISO 8601 format
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

export const attendanceApi = {
  async list(classId: string, params?: ListAttendanceParams): Promise<PaginatedAttendanceResponse> {
    const response = await apiClient.get(`/api/classes/${classId}/attendance`, {
      params,
    });
    return response.data;
  },

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

  async getStatistics(classId: string, excludeDates?: string[]): Promise<AttendanceStatistics> {
    const params = excludeDates && excludeDates.length > 0
      ? { exclude_dates: excludeDates.join(',') }
      : {};
    const response = await apiClient.get(`/api/classes/${classId}/attendance/statistics`, {
      params,
    });
    return response.data;
  },
};
