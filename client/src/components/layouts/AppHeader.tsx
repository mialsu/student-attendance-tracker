import { AppLogo } from './AppLogo';
import { Breadcrumbs } from './Breadcrumbs';
import { UserMenu } from './UserMenu';
import type { BreadcrumbItem } from '@/types/breadcrumb';

interface AppHeaderProps {
  breadcrumbs: BreadcrumbItem[];
}

export function AppHeader({ breadcrumbs }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <AppLogo />
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
