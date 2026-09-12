import { useState, useEffect } from 'react';

/**
 * Custom hook to detect media query matches
 * @param query - Media query string (e.g., '(min-width: 768px)')
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  // Read synchronously on the first render rather than starting at `false` and correcting in an
  // effect. That default cost two things once the shell started reading this hook (2026-09-11):
  // at a 320px viewport the first paint drew the DESKTOP sidebar and then swapped it for the
  // drawer, and the browser walk could observe the page mid-swap — the off-canvas trigger was
  // absent on the first frame, so `e2e/states.spec.ts`'s shell state looked for a nav that had
  // not decided yet. A lazy initialiser is the whole fix; nothing polls and no test waits.
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Re-read on mount too: the query can already have changed between the first render and here.
    setMatches(media.matches);

    // Update on change
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
