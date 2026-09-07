/**
 * The rows the walk runs on, written to stress the layout rather than flatter it.
 *
 * `DESIGN.md` §6 lists "whether the design survives real content" as uncovered, and these shapes
 * are the cheapest honest move against it: a **32-character hyphenated** name, which is what a
 * Finnish double-barrelled surname does to a column at 320px; a **single-name** Student, because
 * `Student.name` is one field and nothing requires two words; tallies **either side of 14–15**,
 * the teacher's rule of thumb for a course credit, which the app deliberately neither enforces nor
 * displays (`INVARIANTS.md`, *Deliberately not invariants*); and a Student with **one** attendance,
 * the smallest non-empty register row there is.
 *
 * Everything here is typed against `src/api`'s own interfaces, so a contract change turns
 * `typecheck:e2e` red rather than a spec red at runtime. It caught one on the way in:
 * `MonthlyStatistic` is `year_month`, not `month`.
 */
import type { AttendanceStatistics } from '../src/api/attendance';
import type {
  AttendanceRecord,
  AuthResponse,
  Class,
  PaginatedAttendanceSummaryResponse,
  StudentAutocomplete,
  User,
} from '../src/api/types';

/**
 * Written to stress the layout rather than flatter it (ADR-0005). `DESIGN.md` §6 lists "whether the
 * design survives real content" as uncovered, and these four shapes are the cheapest honest move
 * against it:
 *
 * - a **32-character hyphenated** name, which is what a Finnish double-barrelled surname does to a
 *   column at 320px;
 * - a **single-name** Student, because `Student.name` is one field and nothing requires two words;
 * - tallies **either side of 14–15**, the teacher's rule of thumb for a course credit, which the app
 *   deliberately neither enforces nor displays (`INVARIANTS.md`, *Deliberately not invariants*);
 * - a Student with **one** attendance, the smallest non-empty register row there is.
 */
export const TEACHER: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'opettaja@koulu.fi',
  active: true,
  created_at: '2025-11-03T08:00:00Z',
};

export const KURSSI: Class = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Matematiikka MAA5',
  description: 'Analyyttinen geometria',
  teacher_id: TEACHER.id,
  active: true,
  created_at: '2025-11-03T08:05:00Z',
  updated_at: null,
  attendance_count: 59,
};

export const ACCESS_TOKEN = 'e2e-access-token-not-a-real-jwt';

export const SESSION: AuthResponse = {
  access_token: ACCESS_TOKEN,
  token_type: 'bearer',
  user: TEACHER,
};

/** Exactly 32 characters, hyphenated on both halves. The width test in one string. */

export const LONGEST_NAME = 'Aino-Kaarina Mäkeläinen-Virtanen';

export const REGISTER: PaginatedAttendanceSummaryResponse = {
  items: [
    {
      student_id: '33333333-3333-4333-8333-333333333331',
      student_name: LONGEST_NAME,
      course_credit_received: false,
      total_attendance: 13,
      records: [{ id: 'r1', timestamp: '2026-09-01T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333332',
      student_name: 'Väinö',
      course_credit_received: false,
      total_attendance: 14,
      records: [{ id: 'r2', timestamp: '2026-09-02T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333333',
      student_name: 'Liisa Korhonen',
      course_credit_received: true,
      total_attendance: 15,
      records: [{ id: 'r3', timestamp: '2026-09-03T09:00:00Z' }],
    },
    {
      student_id: '33333333-3333-4333-8333-333333333334',
      student_name: 'Otto Nieminen',
      course_credit_received: false,
      total_attendance: 1,
      records: [{ id: 'r4', timestamp: '2026-09-04T09:00:00Z' }],
    },
  ],
  total: 4,
  skip: 0,
  limit: 50,
  legacy_hidden: 0,
};

export const EMPTY_REGISTER: PaginatedAttendanceSummaryResponse = {
  items: [],
  total: 0,
  skip: 0,
  limit: 50,
  legacy_hidden: 0,
};

export const STATISTICS: AttendanceStatistics = {
  total_records: 43,
  total_students: 4,
  first_date: '2026-09-01',
  last_date: '2026-09-04',
  daily_stats: [
    { date: '2026-09-01', count: 13 },
    { date: '2026-09-02', count: 14 },
    { date: '2026-09-03', count: 15 },
    { date: '2026-09-04', count: 1 },
  ],
  monthly_stats: [{ year_month: '2026-09', count: 43 }],
};

export const NO_STATISTICS: AttendanceStatistics = {
  total_records: 0,
  total_students: 0,
  first_date: null,
  last_date: null,
  daily_stats: [],
  monthly_stats: [],
};

export const SUGGESTIONS: StudentAutocomplete[] = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Liisa Korhonen', total_attendance: 15 },
  { id: '33333333-3333-4333-8333-333333333331', name: LONGEST_NAME, total_attendance: 13 },
  { id: '33333333-3333-4333-8333-333333333334', name: 'Otto Nieminen', total_attendance: 1 },
];

/**
 * What a logged attendance answers with. `quantity_created` is what the toast counts.
 *
 * The type is a `Pick` of the fields the server actually sends, which is doing two jobs. It keeps
 * the coupling — rename any of them in `src/api/types.ts` and `typecheck:e2e` goes red — and it
 * leaves out the two deprecated name halves that `AttendanceRecord` still declares as
 * **required**. The API stopped sending those with the Student-entity migration, and a fixture
 * carrying empty strings for them would teach the walk a contract the server no longer has.
 *
 * `Omit` was the first attempt and `scripts/drift-extra.sh` rejected it — correctly, since a text
 * matcher cannot tell using a banned identifier from excluding one by name. `Pick` states the same
 * thing by naming only what is sent, so the gate needs no exemption. That those fields are
 * non-optional in `src/api/types.ts` at all is a type lie about live responses; it is in
 * `REVIEW-DEBT.md`.
 */

type LoggedAttendance = Pick<
  AttendanceRecord,
  'id' | 'class_id' | 'timestamp' | 'created_at' | 'student' | 'student_name' | 'quantity_created'
>;

export function loggedAttendance(name: string, quantity: number): LoggedAttendance {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    class_id: KURSSI.id,
    timestamp: '2026-09-07T09:00:00Z',
    created_at: '2026-09-07T09:00:00Z',
    student: { id: SUGGESTIONS[0]!.id, name, course_credit_received: false },
    student_name: name,
    quantity_created: quantity,
  };
}

/**
 * Answer the autocomplete and the attendance POST, and hand back the POST bodies.
 *
 * The bodies are the point. A toast saying "Läsnäolo kirjattu" proves the screen reacted; only the
 * request proves the Kurssi was told the right name and the right quantity, which is what the core
 * loop is for.
 */
