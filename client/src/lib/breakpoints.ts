/**
 * The one width the app branches its layout on — the shell, and since spec 0006 slice 4 the auth
 * split-screen too. The auth screen is not inside the shell, so this is reuse rather than reach:
 * the prototype puts both behind the same 940px query, and a second breakpoint 84px away would be
 * a distinction no one could see and a number that could drift.
 *
 * 940px, and the number is a consequence rather than a preference: the register's scroll
 * container carries `min-w-[34rem]` (544px), and the persistent sidebar is 16rem (256px). At
 * 940 the main region still has 684px for it; at Tailwind's `md` (768px) it would have 512px,
 * so the table would start scrolling inside itself the moment the sidebar appeared. The
 * prototype chose 940 for the same reason (`prototype/index.html:450`).
 *
 * Imported by `tailwind.config.ts` as the `shell` screen and by `use-mobile.tsx` as the JS
 * query, so the CSS breakpoint and the JS one cannot drift apart. `A11Y-7`'s two measured
 * viewports (320 and 1280) sit either side of it deliberately.
 */
export const SHELL_BREAKPOINT_PX = 940;

/** Matches while the shell is collapsed to its off-canvas drawer. */
export const SHELL_COLLAPSED_QUERY = `(max-width: ${SHELL_BREAKPOINT_PX - 1}px)`;
