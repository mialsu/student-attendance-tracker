import { SHELL_COLLAPSED_QUERY } from "@/lib/breakpoints";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * True while the shell is collapsed to its off-canvas drawer.
 *
 * shadcn ships this as its own `matchMedia` implementation at Tailwind's `md` (768px), which
 * made two things wrong at once: a second implementation of a hook this repo already had
 * (`useMediaQuery`), and the wrong width — see `@/lib/breakpoints` for why the shell breaks at
 * 940. Delegating fixes both, and it keeps `vi.mock('@/hooks/useMediaQuery')` — the convention
 * `surfaces.a11y.test.tsx` and `StudentLogs.legacy.test.tsx` already use — as the one way to
 * drive width in a test.
 *
 * The name stays as shadcn's, because `components/ui/sidebar.tsx` imports it under this name and
 * renaming it would be churn in a file that is otherwise upstream's.
 */
export function useIsMobile() {
  return useMediaQuery(SHELL_COLLAPSED_QUERY);
}
