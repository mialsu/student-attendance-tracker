import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, toApiDate } from '../api/attendance';
import type {
  CreateAttendanceRequest,
  GetStatisticsParams,
  GetSummaryParams,
} from '../api/attendance';
import type { PaginatedAttendanceSummaryResponse } from '../api/types';
import { invalidateRegister } from './registerQueries';

/** A page of the summary, carrying the parameters it is the answer to. */
export type AttendanceSummaryPage = PaginatedAttendanceSummaryResponse & {
  requested: GetSummaryParams;
};

/**
 * The register behind *Läsnäolot*, one page at a time.
 *
 * A new search, page or legacy filter keeps the page on screen until its replacement arrives,
 * so the surface never falls back to its loading branch after the first load. That fallback
 * unmounted the search box mid-word on every debounced search — reported by the teacher on
 * 2026-09-30. Because the rows on screen can therefore answer an older question than the one
 * being asked, each page carries `requested`, and anything written about the rows reads it rather
 * than the newest input.
 *
 * Kept within one Kurssi only. With the tab open, picking another Kurssi re-renders the same
 * component with a new `classId`, and keeping the rows there would show the last Kurssi's
 * Students under this one's heading until its own arrived.
 */
export function useAttendanceSummary(
  classId: string,
  params?: GetSummaryParams
) {
  return useQuery({
    queryKey: ['attendance-summary', classId, params],
    queryFn: async (): Promise<AttendanceSummaryPage> => ({
      ...(await attendanceApi.getSummary(classId, params)),
      requested: params ?? {},
    }),
    enabled: !!classId,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === classId ? previous : undefined,
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
    onSuccess: (_, variables) => invalidateRegister(queryClient, variables.classId),
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordId, classId }: { recordId: string; classId: string }) =>
      attendanceApi.delete(recordId),
    onSuccess: (_, variables) => invalidateRegister(queryClient, variables.classId),
  });
}
