import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '../api/attendance';
import type { CreateAttendanceRequest, ListAttendanceParams } from '../api/attendance';

export function useAttendance(classId: string, params?: ListAttendanceParams) {
  return useQuery({
    queryKey: ['attendance', classId, params],
    queryFn: () => attendanceApi.list(classId, params),
    enabled: !!classId,
  });
}

export function useAttendanceSummary(classId: string) {
  return useQuery({
    queryKey: ['attendance-summary', classId],
    queryFn: () => attendanceApi.getSummary(classId),
    enabled: !!classId,
  });
}

export function useCreateAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ classId, data }: { classId: string; data: CreateAttendanceRequest }) =>
      attendanceApi.create(classId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary', variables.classId] });
    },
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordId, classId }: { recordId: string; classId: string }) =>
      attendanceApi.delete(recordId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-summary', variables.classId] });
    },
  });
}
