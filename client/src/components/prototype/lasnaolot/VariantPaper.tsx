/**
 * PROTOTYPE — throwaway. Variant B, "Paperi".
 *
 * The register as paper, from ui-ux-pro-max's `e-ink-paper`: ink on off-white, no gradients, no
 * shadows, `transition: none`, minimal chrome. Structurally it is not a table at all — it is a
 * page you read, one student per line.
 *
 * The tally is drawn as actual tally marks in groups of five, which is the whole reason this
 * variant exists. CONTEXT.md says this app is "a tally sheet, not an academic record", and that
 * around 14–15 attendances is the teacher's own rule of thumb which **nothing may enforce or
 * display** — no progress bar, no badge, no "14/15". Marks in fives give her the same glance
 * without the app claiming a verdict: she counts three groups and knows. The numeral is shown
 * alongside so nothing depends on reading the marks.
 *
 * Free side effect worth noting: a style whose transition is `none` satisfies A11Y-6
 * (prefers-reduced-motion) by construction rather than by a media query.
 */
import { useState } from 'react';
import type { VariantProps } from './palettes';

function TallyMarks({ count }: { count: number }) {
  const groups = Math.floor(count / 5);
  const rest = count % 5;
  const bar = 'block h-4 w-[2px] bg-foreground';
  return (
    <span className="inline-flex flex-wrap items-end gap-2.5" aria-hidden="true">
      {Array.from({ length: groups }).map((_, g) => (
        <span key={g} className="relative inline-flex gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={bar} />
          ))}
          {/* the fifth mark, struck across the other four */}
          <span className="absolute left-[-3px] top-1/2 h-[2px] w-[calc(100%+6px)] -translate-y-1/2 -rotate-[18deg] bg-foreground" />
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex gap-[3px]">
          {Array.from({ length: rest }).map((_, i) => (
            <span key={i} className={bar} />
          ))}
        </span>
      )}
    </span>
  );
}

export function VariantPaper({ items, legacyHidden, fontStack }: VariantProps) {
  const [credited, setCredited] = useState<Record<string, boolean>>({});
  const isCredited = (id: string, fallback: boolean) => credited[id] ?? fallback;

  return (
    <div
      style={{ fontFamily: fontStack }}
      className="bg-background px-5 py-7 text-foreground sm:px-8 [&_*]:transition-none"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 border-b-2 border-foreground pb-2">
          <h2
            className="text-2xl font-medium tracking-tight"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            Läsnäolot
          </h2>
          <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {items.length} opiskelijaa
            {legacyHidden > 0 ? ` · ${legacyHidden} piilotettu` : ''}
          </p>
        </header>

        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.student_id} className="flex flex-wrap items-baseline gap-x-4 gap-y-2 py-3.5">
              <span
                className="min-w-[8rem] flex-1 text-lg"
                style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {s.student_name}
              </span>

              <span className="flex items-baseline gap-3">
                <TallyMarks count={s.total_attendance} />
                <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">
                  {s.total_attendance}
                </span>
              </span>

              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs uppercase tracking-[0.12em]">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--foreground))]"
                  checked={isCredited(s.student_id, s.course_credit_received)}
                  onChange={(e) =>
                    setCredited((c) => ({ ...c, [s.student_id]: e.target.checked }))
                  }
                />
                <span
                  className={
                    isCredited(s.student_id, s.course_credit_received)
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  Suoritus
                </span>
              </label>
            </li>
          ))}
        </ul>

        {items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Ei läsnäoloja kirjattu vielä tälle kurssille.
          </p>
        )}
      </div>
    </div>
  );
}
