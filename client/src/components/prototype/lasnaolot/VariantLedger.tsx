/**
 * PROTOTYPE — throwaway. Variant A, "Tilikirja".
 *
 * The register as a ledger: one dense table, 36px rows, sticky header, every student visible at
 * once without scrolling. Built from ui-ux-pro-max's `data-dense-dashboard` numbers — row height
 * 36px, small type 12-14px, 8px gaps, sticky headers, minimal padding.
 *
 * The bet: this teacher has ~14 students and wants the whole register in one glance, the way she
 * would read a paper sheet — not a card per person, and not a row she has to expand.
 */
import { useState } from 'react';
import type { VariantProps } from './palettes';

export function VariantLedger({ items, legacyHidden, fontStack }: VariantProps) {
  const [credited, setCredited] = useState<Record<string, boolean>>({});
  const isCredited = (id: string, fallback: boolean) => credited[id] ?? fallback;

  const total = items.reduce((sum, i) => sum + i.total_attendance, 0);

  return (
    <div style={{ fontFamily: fontStack }} className="bg-card text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">Läsnäolot</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {items.length} opiskelijaa · {total} merkintää
          {legacyHidden > 0 ? ` · ${legacyHidden} piilotettu` : ''}
        </p>
      </div>

      {/* Wide content scrolls in its own container — DESIGN.md holds every state to 320px, and the
          page body must never scroll sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-[13px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                Nimi
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold tabular-nums">
                Kertaa
              </th>
              <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                Viimeisin
              </th>
              <th scope="col" className="px-3 py-1.5 text-center font-semibold">
                Suoritus
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const last = s.records?.[0]?.timestamp;
              return (
                <tr key={s.student_id} className="border-b border-border/60 last:border-0">
                  <td className="h-9 px-3 align-middle font-medium">{s.student_name}</td>
                  <td className="h-9 px-3 text-right align-middle tabular-nums">
                    {s.total_attendance}
                  </td>
                  <td className="h-9 px-3 align-middle tabular-nums text-muted-foreground">
                    {last ? new Date(last).toLocaleDateString('fi-FI') : '—'}
                  </td>
                  <td className="h-9 px-3 text-center align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={isCredited(s.student_id, s.course_credit_received)}
                      onChange={(e) =>
                        setCredited((c) => ({ ...c, [s.student_id]: e.target.checked }))
                      }
                      aria-label={`Suoritusmerkintä - ${s.student_name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          Ei läsnäoloja kirjattu vielä tälle kurssille.
        </p>
      )}
    </div>
  );
}
