import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClass } from '@/hooks/useClasses';
import { ArrowLeft, LogOut, Settings, Loader2 } from 'lucide-react';
import AttendanceTracking from '@/components/AttendanceTracking';
import StudentLogs from '@/components/StudentLogs';

const ClassView = () => {
  const { classId } = useParams<{ classId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: classData, isLoading: classLoading, error } = useClass(classId || '');

  useEffect(() => {
    // If class failed to load or doesn't belong to user, redirect
    if (!classLoading && classData && user && classData.teacher_id !== user.id) {
      navigate('/dashboard');
      return;
    }

    // If class not found
    if (error) {
      navigate('/dashboard');
    }
  }, [classData, classLoading, error, user, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  if (classLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="py-12">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-muted-foreground">Ladataan kurssia...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!classData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{classData.name}</h1>
              <p className="text-muted-foreground mt-1">{classData.description || 'Ei kuvausta'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSettings}>
              <Settings className="w-4 h-4 mr-2" />
              Asetukset
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Kirjaudu ulos
            </Button>
          </div>
        </div>

        <Tabs defaultValue="attendance" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="attendance">Läsnäolon kirjaus</TabsTrigger>
            <TabsTrigger value="logs">Läsnäolot</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            <AttendanceTracking classId={classData.id} />
          </TabsContent>

          <TabsContent value="logs">
            <StudentLogs classId={classData.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ClassView;
