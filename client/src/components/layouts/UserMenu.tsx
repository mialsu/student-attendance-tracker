import { useNavigate } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';

interface UserMenuProps {
  /** Closes the off-canvas drawer when a menu item navigates. No-op above the shell breakpoint. */
  onNavigate?: () => void;
}

/** Two letters for the avatar, from the email's local part — the only name this app ever holds. */
function initials(email: string | undefined): string {
  return (email ?? '').slice(0, 2).toUpperCase() || '–';
}

/**
 * The account chip at the foot of the sidebar, and the only route to logging out.
 *
 * **Why the trigger is not the old one.** Until slice 3 this was a header dropdown whose label
 * was `sr-only sm:not-sr-only` — the email appeared only from 640px up. Inside an 18rem drawer at
 * a 320px viewport that media query is false, so the trigger would have been a bare chevron with
 * no accessible name: exactly the `A11Y-3` defect the browser walk caught on 2026-09-07, moved
 * into a new house. The chip shows the email at every width, so the accessible name and the
 * visible label are the same string (WCAG 2.5.3).
 *
 * **Why logging out lives here.** The prototype's sidebar has a user chip that opens Settings and
 * no logout at all (`prototype/index.html:556`). Following that literally would have deleted the
 * only way to sign out, so the chip keeps the dropdown the header used to own: one place for
 * account actions, and `DESIGN.md` §2's "get in / get out" flow still ends somewhere.
 */
export function UserMenu({ onNavigate }: UserMenuProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const go = (to: string) => () => {
    onNavigate?.();
    navigate(to);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="gap-3">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
            aria-hidden="true"
          >
            {initials(user?.email)}
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="text-xs font-semibold text-muted-foreground">Tili</span>
            <span className="truncate text-sm">{user?.email}</span>
          </span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">Tili</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={go('/settings')}>
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          Asetukset
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Kirjaudu ulos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
