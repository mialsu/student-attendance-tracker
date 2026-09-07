/**
 * PROTOTYPE — throwaway. Variant C, "Kortit".
 *
 * Touch-first, and the point of it is architectural as much as visual: **one layout at every
 * width.** Today `StudentLogs` ships two complete implementations of this surface — a DataTable
 * above the breakpoint and an Accordion below it, each with its own row actions and dialogs, which
 * is where DESIGN.md §4 says the re-skin's cost lives. It is also where the `nested-interactive`
 * defect lives, because the mobile accordion puts a menu button inside its trigger button.
 *
 * A card grid that reflows from one column at 320px to three on a desktop needs neither branch.
 * Whether losing the dense table is too high a price is exactly what looking at this next to
 * variant A is meant to settle.
 *
 * Type and palette from ui-ux-pro-max: `minimalism-and-swiss-style`, Lexend + Source Sans 3
 * ("enterprise, government, healthcare, accessibility-focused" — Lexend is designed for reading
 * proficiency). Tap targets are held at 44px.
 */
import { useState } from 'react';
import type { VariantProps } from './palettes';

export function VariantCards({ items, legacyHidden, fontStack }: VariantProps) {
  const [credited, setCredited] = useState<Record<string, boolean>>({});
  const isCredited = (id: string, fallback: boolean) => credited[id] ?? fallback;

  return (
    <div style={{ fontFamily: fontStack }} className="bg-background px-4 py-6 text-foreground">
      <header className="mb-5">
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ fontFamily: "'Lexend', system-ui, sans-serif" }}
        >
          Läsnäolot
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} opiskelijaa
          {legacyHidden > 0 ? ` · ${legacyHidden} piilotettu` : ''}
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => {
          const on = isCredited(s.student_id, s.course_credit_received);
          return (
            <li
              key={s.student_id}
              className="rounded-[var(--radius)] border border-border bg-card p-4 text-card-foreground"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="text-base font-medium leading-snug"
                  style={{ fontFamily: "'Lexend', system-ui, sans-serif" }}
                >
                  {s.student_name}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-3xl font-semibold leading-none tabular-nums">
                    {s.total_attendance}
                  </span>
                  <span className="mt-0.5 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    kertaa
                  </span>
                </span>
              </div>

              <label className="mt-3 flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 border-t border-border pt-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[hsl(var(--accent))]"
                  checked={on}
                  onChange={(e) =>
                    setCredited((c) => ({ ...c, [s.student_id]: e.target.checked }))
                  }
                />
                <span className={on ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                  {on ? 'Suoritus merkitty' : 'Ei suoritusta'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ei läsnäoloja kirjattu vielä tälle kurssille.
        </p>
      )}
    </div>
  );
}
