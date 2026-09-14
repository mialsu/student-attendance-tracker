/**
 * The signed-in frame: a persistent sidebar beside a scrolling main region.
 *
 * Spec 0006 slice 3. Before it, this was a sticky header carrying the brand, the breadcrumbs and
 * the account menu; the prototype has no header on any width, so all three moved — the brand and
 * the account menu into `AppSidebar`, the breadcrumbs to the top of main, where the prototype
 * puts them (`prototype/index.html:616`). `AppHeader` and `AppLogo` are gone rather than kept
 * unused.
 *
 * **One breakpoint, in JS, at 940px.** `src/lib/breakpoints.ts` holds the number and says why it
 * is not Tailwind's `md`. Below it the sidebar becomes an off-canvas drawer and the only control
 * that opens it is the button below; above it there is no trigger, because nothing collapses a
 * persistent sidebar (see the note in `ui/sidebar.tsx` about the shortcut that used to).
 *
 * `/class/:id`'s full-surface spinner deliberately renders *outside* this frame, as it did
 * before: `DESIGN.md` §3's "the frame never waits for its data" is one of the three loading
 * decisions spec 0006 defers, so changing it here would be scope this slice does not own.
 */
import { ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Breadcrumbs } from './Breadcrumbs';
import type { BreadcrumbItem } from '@/types/breadcrumb';

interface TeacherLayoutProps {
  children: ReactNode;
  breadcrumbs: BreadcrumbItem[];
}

/**
 * Opens the drawer, and exists only while the shell is collapsed.
 *
 * Rendered from `isMobile` rather than a `shell:hidden` class so the button and the drawer share
 * one source of truth. A CSS-hidden trigger above 940px would still be in the tab order.
 */
function OpenNavButton() {
  const { isMobile, toggleSidebar } = useSidebar();
  if (!isMobile) {
    return null;
  }

  return (
    <Button variant="outline" size="icon" onClick={toggleSidebar} className="mb-4">
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Avaa valikko</span>
    </Button>
  );
}

export function TeacherLayout({ children, breadcrumbs }: TeacherLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* `min-w-0` is load-bearing, not tidying. `SidebarInset` is `flex-1` inside
          `SidebarProvider`'s flex row, and a flex item's `min-width` defaults to `auto` — so it
          cannot shrink below its content's min-content width. The register's `min-w-[34rem]`
          therefore pushed the whole page to 809px at a 320px viewport and broke `A11Y-7` in three
          states, which the walk caught. `min-w-0` lets main shrink and hands the overflow back to
          the register's own scroll container, where §6 says it belongs. */}
      <SidebarInset className="min-w-0">
        <div className="w-full min-w-0 max-w-6xl p-4 md:p-8 animate-fade-in">
          <OpenNavButton />
          <Breadcrumbs items={breadcrumbs} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
