import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getClassById, Class } from '@/lib/classes';
import { ArrowLeft, LogOut, Settings } from 'lucide-react';
import AttendanceTracking from '@/components/AttendanceTracking';
import StudentLogs from '@/components/StudentLogs';

const ClassView = () => {
  const { classId } = useParams<{ classId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<Class | null>(null);

  useEffect(() => {
    if (!user || !user.isTeacher) {
      navigate('/auth');
      return;
    }

    if (classId) {
      const cls = getClassById(classId);
      if (!cls) {
        navigate('/dashboard');
        return;
      }
      if (cls.teacherEmail !== user.email) {
        navigate('/dashboard');
        return;
      }
      setClassData(cls);
    }
  }, [user, classId, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

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
            <TabsTrigger value="logs">Opiskelijan lokit</TabsTrigger>
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
