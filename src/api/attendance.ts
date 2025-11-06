import { apiClient } from './client';
import type { AttendanceRecord, AttendanceSummary, PaginatedAttendanceResponse } from './types';

export interface CreateAttendanceRequest {
  student_first_name: string;
  student_last_name: string;
  timestamp?: string; // ISO 8601 format, optional - defaults to current time on server
}

export interface ListAttendanceParams {
  skip?: number;
  limit?: number;
  student_name?: string;
  date_from?: string; // ISO 8601 format
  date_to?: string; // ISO 8601 format
  legacy?: boolean; // Include students with first attendance > 5 years ago
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

  async getSummary(classId: string): Promise<AttendanceSummary[]> {
    const response = await apiClient.get(`/api/classes/${classId}/attendance/summary`);
    return response.data;
  },
};
