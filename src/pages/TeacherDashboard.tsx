import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAttendanceSummary } from '@/lib/attendance';
import { LogOut } from 'lucide-react';

const TeacherDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Array<{ firstName: string; lastName: string; count: number }>>([]);

  useEffect(() => {
    if (!user || !user.isTeacher) {
      navigate('/auth');
      return;
    }
    
    setSummary(getAttendanceSummary());
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Opettajan näkymä</h1>
            <p className="text-muted-foreground mt-1">{user?.email}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Kirjaudu ulos
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Läsnäolojen yhteenveto</CardTitle>
            <CardDescription>
              Opiskelijat aakkosjärjestyksessä sukunimen mukaan
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Ei läsnäoloja kirjattu vielä
              </p>
            ) : (
              <div className="space-y-2">
                {summary.map((student, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <span className="font-medium">
                      {student.lastName}, {student.firstName}
                    </span>
                    <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full font-semibold">
                      {student.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboard;
