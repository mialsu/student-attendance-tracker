import type { QueryClient } from '@tanstack/react-query';

/**
 * Every query that names or counts a Kurssi's Students and their attendance.
 *
 * One list for every mutation that changes the register. Until 2026-09-30 each mutation kept its
 * own, and they had drifted apart: none named the name suggestions, so a Student logged a minute
 * ago stayed missing from them (the teacher's "al finds Aleksi, alek does not"), and renaming,
 * merging or deleting a Student left *Tilastot*'s totals stale for its five-minute cache. A query
 * added to the app joins this list once, rather than five hand-kept ones.
 */
const REGISTER_QUERIES = [
  'students',
  'students-autocomplete',
  'attendance',
  'attendance-summary',
  'attendance-statistics',
] as const;

/**
 * Mark every register query stale, and refetch the ones on screen.
 *
 * Scoped to one Kurssi when the mutation knows which. The Student mutations are called with a
 * Student id alone, so they refresh every Kurssi's copy — a teacher has one or two.
 */
export function invalidateRegister(queryClient: QueryClient, classId?: string): void {
  for (const name of REGISTER_QUERIES) {
    queryClient.invalidateQueries({ queryKey: classId ? [name, classId] : [name] });
  }
}
