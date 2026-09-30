import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { attendanceApi } from '@/api/attendance';
import type { AttendanceStatistics } from '@/api/attendance';
import { studentsApi } from '@/api/students';
import type { AttendanceRecord, Student, StudentAutocomplete } from '@/api/types';
import {
  useAttendanceStatistics,
  useCreateAttendance,
  useDeleteAttendance,
} from '../useAttendance';
import {
  useDeleteStudent,
  useMergeStudent,
  useStudentAutocomplete,
  useUpdateStudent,
} from '../useStudents';

/**
 * Every change to the register refreshes every figure on screen that counts it.
 *
 * Two holes of one kind, both found on 2026-09-30 while tracing the teacher's "alek" report. The
 * name suggestions (`students-autocomplete`) were refreshed by no mutation at all, and renaming,
 * merging or deleting a Student left *Tilastot* (`attendance-statistics`, cached five minutes)
 * showing the old totals: each mutation's list of queries to refresh had been written by hand and
 * none of them named those two keys.
 *
 * Each row runs one mutation against real hooks and a real QueryClient, mocked at the `src/api`
 * seam, and asserts the affected queries went back to the server.
 */

vi.mock('@/api/attendance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/attendance')>();
  return {
    ...actual,
    attendanceApi: {
      ...actual.attendanceApi,
      getStatistics: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('@/api/students', () => ({
  studentsApi: {
    getAutocomplete: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    merge: vi.fn(),
  },
}));

const STATISTICS: AttendanceStatistics = {
  total_records: 3,
  total_students: 2,
  first_date: '2026-09-01',
  last_date: '2026-09-02',
  daily_stats: [{ date: '2026-09-01', count: 3 }],
  monthly_stats: [{ year_month: '2026-09', count: 3 }],
};

const SUGGESTIONS: StudentAutocomplete[] = [
  { id: 's1', name: 'Aleksi Virtanen', total_attendance: 2 },
];

const STUDENT: Student = {
  id: 's1',
  name: 'Aleksi Virtanen',
  class_id: 'c1',
  course_credit_received: false,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-01T08:00:00Z',
};

/** Cast, because the type still requires the deprecated first/last-name pair the drift gate bans. */
const RECORD = {
  id: 'r1',
  class_id: 'c1',
  timestamp: '2026-09-30T08:00:00Z',
  created_at: '2026-09-30T08:00:00Z',
  student_name: 'Aleksi Virtanen',
} as AttendanceRecord;

/** Everything on screen that counts the register, plus the mutations that change it. */
const useRegister = () => ({
  statistics: useAttendanceStatistics('c1'),
  suggestions: useStudentAutocomplete('c1', 'al'),
  createAttendance: useCreateAttendance(),
  deleteAttendance: useDeleteAttendance(),
  updateStudent: useUpdateStudent(),
  deleteStudent: useDeleteStudent(),
  mergeStudent: useMergeStudent(),
});

type Register = ReturnType<typeof useRegister>;

const CHANGES: Array<[string, (r: Register) => Promise<unknown>]> = [
  [
    'logging attendance',
    (r) => r.createAttendance.mutateAsync({ classId: 'c1', data: { student_name: 'Aleksi' } }),
  ],
  ['deleting an attendance record', (r) => r.deleteAttendance.mutateAsync({ recordId: 'r1', classId: 'c1' })],
  [
    'renaming a student',
    (r) => r.updateStudent.mutateAsync({ studentId: 's1', data: { name: 'Aleksi Koski' } }),
  ],
  ['merging two students', (r) => r.mergeStudent.mutateAsync({ targetStudentId: 's1', duplicateStudentId: 's2' })],
  ['deleting a student', (r) => r.deleteStudent.mutateAsync('s1')],
];

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('a change to the register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attendanceApi.getStatistics).mockResolvedValue(STATISTICS);
    vi.mocked(attendanceApi.create).mockResolvedValue(RECORD);
    vi.mocked(attendanceApi.delete).mockResolvedValue(undefined);
    vi.mocked(studentsApi.getAutocomplete).mockResolvedValue(SUGGESTIONS);
    vi.mocked(studentsApi.update).mockResolvedValue(STUDENT);
    vi.mocked(studentsApi.delete).mockResolvedValue(undefined);
    vi.mocked(studentsApi.merge).mockResolvedValue(STUDENT);
  });

  it.each(CHANGES)('%s refreshes the statistics and the name suggestions', async (_, change) => {
    const { result } = renderHook(useRegister, { wrapper });
    await waitFor(() => {
      expect(result.current.statistics.isSuccess).toBe(true);
      expect(result.current.suggestions.isSuccess).toBe(true);
    });
    expect(attendanceApi.getStatistics).toHaveBeenCalledTimes(1);
    expect(studentsApi.getAutocomplete).toHaveBeenCalledTimes(1);

    await act(() => change(result.current));

    await waitFor(() => {
      expect(attendanceApi.getStatistics).toHaveBeenCalledTimes(2);
      expect(studentsApi.getAutocomplete).toHaveBeenCalledTimes(2);
    });
  });
});
