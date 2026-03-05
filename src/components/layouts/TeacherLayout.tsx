import { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import type { BreadcrumbItem } from '@/types/breadcrumb';

interface TeacherLayoutProps {
  children: ReactNode;
  breadcrumbs: BreadcrumbItem[];
}

export function TeacherLayout({ children, breadcrumbs }: TeacherLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader breadcrumbs={breadcrumbs} />
      <main className="p-4 md:p-8 animate-fade-in">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
