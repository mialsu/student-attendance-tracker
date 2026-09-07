/**
 * PROTOTYPE — throwaway. The floating variant switcher from /prototype's UI branch.
 *
 * Deliberately ugly, and deliberately NOT using the app's design tokens: it is prototype chrome,
 * not part of the design being judged, so it must not inherit whichever palette the variant sets.
 * The hardcoded neutrals here are the one place in this repo where bypassing the token system is
 * correct — everywhere else it is the defect DESIGN.md §1 records against NotFound.tsx.
 *
 * Hidden whenever `import.meta.env.PROD`, so a stray merge cannot ship the bar to the teacher.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  /** Shown beside the label, e.g. to say the variant does not persist anything. */
  note?: string;
}

export function PrototypeSwitcher({ variants, current, note }: PrototypeSwitcherProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set('variant', next.key);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Never steal the arrow keys from a field the user is typing in.
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      go(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      style={{ fontFamily: 'ui-monospace, monospace' }}
    >
      <div className="flex items-center gap-1 rounded-full bg-zinc-900 py-1.5 pl-1.5 pr-1.5 text-zinc-100 shadow-xl ring-1 ring-white/20">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Edellinen versio"
          className="h-8 w-8 rounded-full text-lg leading-none text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ←
        </button>
        <span className="px-2 text-xs tabular-nums">
          <span className="font-bold">{current}</span>
          <span className="text-zinc-400"> / {variants.length} · </span>
          {variants[index]?.name}
          {note ? <span className="text-zinc-400"> · {note}</span> : null}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Seuraava versio"
          className="h-8 w-8 rounded-full text-lg leading-none text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          →
        </button>
      </div>
    </div>
  );
}
