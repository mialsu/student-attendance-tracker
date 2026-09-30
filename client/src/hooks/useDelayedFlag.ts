import { useEffect, useState } from 'react';

/**
 * DESIGN.md §3: nothing shows a spinner before this long. Most calls to the API return well inside
 * it, and a signal that appears and vanishes that fast reads as a flicker rather than as progress.
 */
export const SPINNER_DELAY_MS = 300;

/**
 * `active`, but only once it has held for `delayMs` without a break. It drops the moment `active`
 * does, so an answer that arrives in time shows no signal at all.
 *
 * Every "this is taking a while" signal goes through here, so the 300 ms rule has one home.
 */
export function useDelayedFlag(active: boolean, delayMs: number = SPINNER_DELAY_MS): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  // `active &&` so the signal drops in the same render the flag does, not one render later.
  return active && held;
}
