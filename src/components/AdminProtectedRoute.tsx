import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

const AdminProtectedRoute = ({ children }: AdminProtectedRouteProps) => {
  const { user, loading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-muted-foreground">Tarkistetaan istuntoa...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/auth" replace />;
  }

  if (user.role !== 'superadmin') {
    // Not a superadmin, redirect to teacher dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
