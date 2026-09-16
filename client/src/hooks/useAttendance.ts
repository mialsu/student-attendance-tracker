import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, toApiDate } from '../api/attendance';
import type {
  CreateAttendanceRequest,
  GetStatisticsParams,
  GetSummaryParams,
} from '../api/attendance';

export function useAttendanceSummary(
  classId: string,
  params?: GetSummaryParams
) {
  return useQuery({
    queryKey: ['attendance-summary', classId, params],
    queryFn: () => attendanceApi.getSummary(classId, params),
    enabled: !!classId,
  });
}

export function useAttendanceStatistics(classId: string, params?: GetStatisticsParams) {
  // The key carries the SERIALIZED days, not the `Date` objects. Two reasons, and the second is
  // the one that would bite: TanStack hashes the key structurally, so a fresh `Date` for the same
  // day from a re-render is a new object but must not be a new key; and the key has to agree with
  // the request about which day a `Date` is, which is `toApiDate`'s local-day rule and not
  // `Date`'s UTC `toJSON`. Keyed on the UTC form, a range picked at 1.9.2026 in UTC+3 would cache
  // under 2026-08-31 while asking the server for 2026-09-01.
  const dateFrom = params?.dateFrom ? toApiDate(params.dateFrom) : undefined;
  const dateTo = params?.dateTo ? toApiDate(params.dateTo) : undefined;

  return useQuery({
    queryKey: ['attendance-statistics', classId, params?.excludeDates, dateFrom, dateTo],
    queryFn: () => attendanceApi.getStatistics(classId, params),
    enabled: !!classId,
    staleTime: 1000 * 60 * 5, // 5 minutes
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
      queryClient.invalidateQueries({ queryKey: ['attendance-statistics', variables.classId] });
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
      queryClient.invalidateQueries({ queryKey: ['attendance-statistics', variables.classId] });
    },
  });
}
