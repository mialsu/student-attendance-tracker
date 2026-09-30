import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '@/api/students';
import type { ListStudentsParams, UpdateStudentRequest } from '@/api/students';
import { invalidateRegister } from './registerQueries';

/**
 * Fetch paginated list of students for a class
 */
export function useStudents(classId: string, params?: ListStudentsParams) {
  return useQuery({
    queryKey: ['students', classId, params],
    queryFn: () => studentsApi.list(classId, params),
    enabled: !!classId,
  });
}

/**
 * Name suggestions for the attendance form, asked afresh for every prefix.
 * Enabled only when query is at least 2 characters.
 *
 * No answer is ever reused. Until 2026-09-30 each prefix's answer was kept for five minutes, so a
 * prefix first asked before a Student existed went on answering "nobody" after they were logged —
 * the teacher's "al finds Aleksi, alek does not". The request is one indexed query per debounced
 * keystroke, so the cache saved next to nothing and cost a wrong answer.
 */
export function useStudentAutocomplete(
  classId: string,
  query: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['students-autocomplete', classId, query],
    queryFn: () => studentsApi.getAutocomplete(classId, query),
    enabled: enabled && !!classId && query.length >= 2,
    // Stale the moment it lands, and dropped the moment nothing on screen shows it.
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Update student information (name or course credit status)
 */
export function useUpdateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studentId, data }: { studentId: string; data: UpdateStudentRequest }) =>
      studentsApi.update(studentId, data),
    onSuccess: () => invalidateRegister(queryClient),
  });
}

/**
 * Delete a student and all their attendance records
 */
export function useDeleteStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentId: string) => studentsApi.delete(studentId),
    onSuccess: () => invalidateRegister(queryClient),
  });
}

/**
 * Merge duplicate student into target student
 * Transfers all attendance records and merges course credit status
 */
export function useMergeStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      targetStudentId,
      duplicateStudentId,
    }: {
      targetStudentId: string;
      duplicateStudentId: string;
    }) => studentsApi.merge(targetStudentId, duplicateStudentId),
    onSuccess: () => invalidateRegister(queryClient),
  });
}
