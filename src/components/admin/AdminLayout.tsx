import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminNav from './AdminNav';

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header with red theme */}
      <header className="border-b bg-red-50 dark:bg-red-950/20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
                Hallintapaneeli
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20">
              <LogOut className="mr-2 h-4 w-4" />
              Kirjaudu ulos
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="border-b bg-red-50 dark:bg-red-950/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <AdminNav />
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
