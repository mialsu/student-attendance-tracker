import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '@/api/students';
import type { ListStudentsParams, UpdateStudentRequest } from '@/api/students';

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
 * Fetch autocomplete suggestions for student names
 * Enabled only when query is at least 2 characters
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
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
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
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
  });
}

/**
 * Delete a student and all their attendance records
 */
export function useDeleteStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentId: string) => studentsApi.delete(studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
  });
}
