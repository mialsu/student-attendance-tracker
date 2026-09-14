/**
 * The signed-in navigation: brand, every Kurssi the teacher owns, settings, and the account menu.
 *
 * Spec 0006 slice 3, replacing the header-only frame. The Owner adopted this knowing what §1 of
 * `DESIGN.md` says — one teacher, one Kurssi, and no way to rename, archive or delete a course —
 * so a course list has little to navigate *today*. It is built for the shape the app already
 * supports (a teacher with several courses), not for a feature this slice adds.
 *
 * Three things here are decisions rather than markup:
 *
 * 1. **The count is `student_count`, and it names its unit.** A bare number beside a course reads
 *    as either Students or attendances; `sr-only` "opiskelijaa" settles it for assistive
 *    technology, and `tabular-nums` keeps the column steady. The API carries both counts on the
 *    class list itself since 2026-09-11, so the sidebar costs no extra request — see
 *    `class_service.get_classes_for_teacher`.
 * 2. **The course group never claims "no courses" when the request failed.** That is the defect
 *    slice 1 closed on three surfaces, and a quiet version of it here would undo the fix. Loading,
 *    empty and failed each say their own thing.
 * 3. **No `role="alert"` on the failure line.** The surface behind the sidebar already announces
 *    the same failure through `QueryErrorState`; a second live region would double-announce it,
 *    and would make `getByRole('alert')` ambiguous in the walk's `— refused` states.
 */
import { BookOpen, LayoutGrid, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { UserMenu } from './UserMenu';
import { useClasses } from '@/hooks/useClasses';
import { useSidebar } from '@/components/ui/sidebar';

/** Close the drawer after navigating, or the new surface renders behind it. No-op on desktop. */
function useCloseDrawerOnNavigate() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { data: classes, isLoading, error } = useClasses();
  const dismiss = useCloseDrawerOnNavigate();

  return (
    <Sidebar>
      <SidebarHeader>
        {/* The brand as the prototype draws it: the product name over the older one, which stays
            visible rather than being replaced. Both are text at every width — the defect the
            walk caught on 2026-09-07 was `AppLogo` hiding its only text below 640px, leaving a
            nameless link on every signed-in surface. */}
        {/* Hover tints the background rather than dimming the whole block, and that is a
            correctness fix, not taste. `AppLogo` used `hover:opacity-80`, which was safe on its
            16px `--foreground` text (9.12:1 → ~7.3:1 dimmed). The sub-label below is 11.2px
            `--muted-foreground`, and 0.8 opacity took it from 6.95:1 to **4.28:1** — under AA, in
            a state a mouse reaches by resting on it. The browser walk found it: the drawer slides
            in beneath a stationary pointer, so axe sampled the hover state and reported a ratio
            that varied run to run. Tinting the background matches the nav items below, too. */}
        <Link
          to="/dashboard"
          onClick={dismiss}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold leading-tight tracking-tight">
              Läsnä
            </span>
            {/* `aria-hidden` because this is a subtitle, not the link's label: without it the
                computed name ran the two together as "LäsnäLäsnäolot" (name computation adds no
                separator between descendants). The link's name is "Läsnä", which is its visible
                primary label, so WCAG 2.5.3 holds. */}
            <span
              className="block truncate text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground"
              aria-hidden="true"
            >
              Läsnäolot
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                  <Link
                    to="/dashboard"
                    onClick={dismiss}
                    aria-current={pathname === '/dashboard' ? 'page' : undefined}
                  >
                    <LayoutGrid aria-hidden="true" />
                    <span>Kaikki kurssit</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Kurssit</SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              </SidebarMenu>
            ) : error ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Kursseja ei voitu ladata
              </p>
            ) : !classes || classes.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Ei kursseja</p>
            ) : (
              <SidebarMenu>
                {classes.map((cls) => {
                  const isActive = pathname.startsWith(`/class/${cls.id}`);
                  return (
                    <SidebarMenuItem key={cls.id}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          to={`/class/${cls.id}`}
                          onClick={dismiss}
                          aria-current={isActive ? 'page' : undefined}
                          // An explicit name, because the computed one was wrong: name
                          // computation concatenates descendant text with no separator, so
                          // "Matematiikka MAA5" + "25" + " opiskelijaa" announced as
                          // "Matematiikka MAA525opiskelijaa". `AppShell.test.tsx` caught it. The
                          // visible label is the leading substring of this name, so WCAG 2.5.3
                          // still holds, and the unit is the point: a bare 25 beside a course is
                          // as readable as attendances.
                          aria-label={
                            cls.student_count !== undefined
                              ? `${cls.name}, ${cls.student_count} opiskelijaa`
                              : cls.name
                          }
                        >
                          <BookOpen aria-hidden="true" />
                          <span className="flex-1 truncate">{cls.name}</span>
                          {cls.student_count !== undefined && (
                            <span
                              className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground"
                              aria-hidden="true"
                            >
                              {cls.student_count}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/settings'}>
              <Link
                to="/settings"
                onClick={dismiss}
                aria-current={pathname === '/settings' ? 'page' : undefined}
              >
                <Settings aria-hidden="true" />
                <span>Asetukset</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu onNavigate={dismiss} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
