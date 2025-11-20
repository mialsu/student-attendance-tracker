import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminNav = () => {
  const navItems = [
    {
      to: '/admin/dashboard',
      label: 'Kojelauta',
      icon: LayoutDashboard,
    },
    {
      to: '/admin/registration-codes',
      label: 'Rekisteröintikoodit',
      icon: Ticket,
    },
  ];

  return (
    <nav className="flex gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              'border-b-2 border-transparent',
              isActive
                ? 'text-red-600 dark:text-red-400 border-red-600 dark:border-red-400'
                : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800'
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
};

export default AdminNav;
