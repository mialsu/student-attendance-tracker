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
  /** Students in this Kurssi. Carried by the class list itself, so the sidebar costs no request. */
  student_count?: number;
}

// Student entity types
export interface Student {
  id: string;
  name: string;
  class_id: string;
  course_credit_received: boolean;
  created_at: string;
  updated_at: string | null;
  total_attendance?: number;
}

export interface StudentInAttendance {
  id: string;
  name: string;
  course_credit_received: boolean;
}

export interface StudentAutocomplete {
  id: string;
  name: string;
  total_attendance: number;
}

export interface PaginatedStudentResponse {
  items: Student[];
  total: number;
  skip: number;
  limit: number;
}

// Attendance record - supports both old and new backend schema
export interface AttendanceRecord {
  id: string;
  class_id: string;
  timestamp: string;
  created_at: string;

  // NEW: Student object from backend
  student?: StudentInAttendance;

  // DEPRECATED: For backward compatibility
  student_first_name: string;
  student_last_name: string;
  student_name?: string;

  total_attendance?: number;
  quantity_created?: number; // NEW: Bulk logging metadata
}

export interface AttendanceRecordInSummary {
  id: string;
  timestamp: string;
}

// Updated summary with student entity
export interface AttendanceSummary {
  student_id: string; // NEW
  student_name: string;
  course_credit_received: boolean; // NEW
  total_attendance: number;
  records: AttendanceRecordInSummary[];
}

export interface PaginatedAttendanceSummaryResponse {
  items: AttendanceSummary[];
  total: number;
  skip: number;
  limit: number;
  /** Students hidden by the five-year cutoff under the current filters. 0 when legacy is true. */
  legacy_hidden: number;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  registration_code: string;
}

export interface APIError {
  detail: string;
}
