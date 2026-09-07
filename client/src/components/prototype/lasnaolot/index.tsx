/**
 * PROTOTYPE — throwaway. Three variants of the Läsnäolot surface, switchable via `?variant=` on
 * the real `/class/:classId` route.
 *
 * Sub-shape A per /prototype's UI branch: the existing route, the real header, breadcrumbs, tabs
 * and real data all stay — only the rendering of this one tab swaps. A variant judged in a vacuum
 * always looks fine, which is why none of these gets its own page.
 *
 * Read-only by design. The credit checkbox is local state and persists nothing; the question here
 * is what the surface should look like, not whether the backend works.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAttendanceSummary } from '@/hooks/useAttendance';
import { PrototypeSwitcher } from '../PrototypeSwitcher';
import { VARIANTS } from './palettes';
import { VariantLedger } from './VariantLedger';
import { VariantPaper } from './VariantPaper';
import { VariantCards } from './VariantCards';
import type { CSSProperties } from 'react';
import type { AttendanceSummary } from '@/api/types';

/**
 * Sample rows, for looking at the variants without standing up the API. Port 8000 on this machine
 * is another project's `platform-api` and the attendance API has no local .env, so the realistic
 * default when you open this is that the fetch fails.
 *
 * Chosen to stress the layout rather than to flatter it: a 34-character Finnish name, a
 * hyphenated one, a single-name student, counts either side of the teacher's 14–15 rule of thumb,
 * and a student with one attendance.
 */
const SAMPLE: AttendanceSummary[] = [
  ['Aino-Marjatta Väyrynen-Lehtimäki', 16, true],
  ['Eero Kinnunen', 15, true],
  ['Väinö Sillanpää', 14, false],
  ['Liisa Korhonen', 13, false],
  ['Tuomas Järvinen', 11, false],
  ['Sanni Mäkelä', 9, false],
  ['Onni Heikkilä', 7, false],
  ['Helmi Nieminen', 4, false],
  ['Ilmari', 1, false],
].map(([name, count, credit], i) => ({
  student_id: `sample-${i}`,
  student_name: name as string,
  total_attendance: count as number,
  course_credit_received: credit as boolean,
  records: [{ id: `rec-${i}`, timestamp: '2026-09-03T16:00:00Z' }],
})) as AttendanceSummary[];

const RENDERERS = {
  A: VariantLedger,
  B: VariantPaper,
  C: VariantCards,
} as const;

/** Load the active variant's webfonts only while it is on screen, so index.html — and therefore
 *  production — is untouched by the prototype. */
function useVariantFonts(families: string[]) {
  useEffect(() => {
    if (families.length === 0) return;
    const href = `https://fonts.googleapis.com/css2?${families
      .map((f) => `family=${f}`)
      .join('&')}&display=swap`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.prototypeFonts = 'lasnaolot';
    document.head.appendChild(link);
    return () => link.remove();
  }, [families]);
}

export function LasnaolotVariants({ classId }: { classId: string }) {
  const [searchParams] = useSearchParams();
  const requested = (searchParams.get('variant') ?? 'A').toUpperCase();
  const meta = VARIANTS.find((v) => v.key === requested) ?? VARIANTS[0];

  useVariantFonts(meta.fonts);

  // Reveal the legacy students too: the cutoff hides nobody in this data until ~2030, and a
  // prototype wants as many rows as it can get.
  const { data, isLoading, error } = useAttendanceSummary(classId, { limit: 50, legacy: true });

  const Renderer = RENDERERS[meta.key as keyof typeof RENDERERS];

  // Note what this deliberately does NOT do: collapse the failed fetch into the empty state. That
  // is the defect REVIEW-DEBT records against all three real read surfaces, and a prototype meant
  // to show what this surface should look like has no business repeating it. An error says it
  // failed; empty says it is empty; and only after saying so does it fall back to SAMPLE so the
  // layouts are still judgeable with no API running.
  const usingSample = Boolean(error) || (!isLoading && (data?.items?.length ?? 0) === 0);
  const items = usingSample ? SAMPLE : (data?.items ?? []);

  return (
    <>
      {usingSample && (
        <p className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {error
            ? 'Läsnäolojen haku ei onnistunut, joten alla on esimerkkidataa.'
            : 'Kurssilla ei ole läsnäoloja, joten alla on esimerkkidataa.'}{' '}
          Prototyyppi ei tallenna mitään.
        </p>
      )}
      <div style={meta.palette as CSSProperties} className="rounded-lg border border-border">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Ladataan…</p>
        ) : (
          <Renderer
            items={items}
            legacyHidden={usingSample ? 2 : (data?.legacy_hidden ?? 0)}
            fontStack={meta.fontStack}
          />
        )}
      </div>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={meta.key}
        note={usingSample ? 'esimerkkidata' : 'oikea data'}
      />
    </>
  );
}
