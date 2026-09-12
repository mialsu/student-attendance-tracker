/**
 * The error state the three read surfaces never had.
 *
 * `DESIGN.md` §3 holds every surface to four states, and `/dashboard`, *Läsnäolot* and *Tilastot*
 * shipped with three: each destructured `data` and `isLoading` and never consulted `error`, so a
 * **failed** request fell through into the **empty** branch. The dashboard told a teacher who owns
 * a Kurssi that she had none and invited her to create one — false, and actionable in the wrong
 * direction. Spec 0006 slice 1.
 *
 * One component rather than three copies, because the three surfaces owe the reader the same
 * thing. What they do *not* share is the frame: each caller wraps this in whatever its own loading
 * branch already uses, so a Card stays a Card and an early return stays an early return.
 *
 * **Two deliberate restraints:**
 *
 * 1. **No new colour pair.** The message renders in `text-foreground` and the hint in
 *    `text-muted-foreground` — both already asserted against `--card` and `--background` by
 *    `tokens-contrast.test.ts`. `text-destructive` on a card would have painted a pair the token
 *    test does not list, and `--destructive` at `0 72% 51%` measures ~4.5:1 on white, which is too
 *    close to the line to introduce by accident. The icon carries the colour and is `aria-hidden`,
 *    so nothing here conveys meaning by colour alone (`A11Y-5`).
 * 2. **The API's `detail` is not shown.** These three fail on transport far more than on logic,
 *    where the underlying message is empty or English — and `AC8` keeps every string Finnish.
 */
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QueryErrorStateProps {
  /**
   * `<noun> lataaminen epäonnistui`, matching the twelve `… epäonnistui` strings already in the
   * app. Passed per surface rather than derived, so the noun agrees with what actually failed.
   */
  message: string;
  /** `refetch` from the surface's own query. Every hook here returns the raw `useQuery` result. */
  onRetry: () => void;
}

export const QueryErrorState = ({ message, onRetry }: QueryErrorStateProps) => (
  // `role="alert"` so the failure is announced rather than silently swapped in. The retry sits
  // outside the alert's text so a screen reader reads the problem before the control.
  <div className="flex flex-col items-center gap-3 py-8 text-center">
    <div role="alert" className="flex flex-col items-center gap-2">
      <AlertCircle className="w-6 h-6 text-destructive" aria-hidden="true" />
      <p className="font-medium">{message}</p>
      <p className="text-sm text-muted-foreground">Tarkista verkkoyhteys ja yritä uudelleen.</p>
    </div>
    <Button variant="outline" onClick={onRetry}>
      Yritä uudelleen
    </Button>
  </div>
);
