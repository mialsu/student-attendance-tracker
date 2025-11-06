// API Response Types

export interface User {
  id: string;
  email: string;
  active: boolean;
  created_at: string;
}

export interface Class {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  attendance_count?: number;
}

export interface AttendanceRecord {
  id: string;
  class_id: string;
  student_first_name: string;
  student_last_name: string;
  timestamp: string;
  created_at: string;
  total_attendance?: number; // Total count for this student (only in create response)
}

export interface AttendanceRecordInSummary {
  id: string;
  timestamp: string;
}

export interface AttendanceSummary {
  student_first_name: string;
  student_last_name: string;
  total_attendance: number;
  records: AttendanceRecordInSummary[];
}

export interface PaginatedAttendanceResponse {
  items: AttendanceRecord[];
  total: number;
  skip: number;
  limit: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface APIError {
  detail: string;
}
