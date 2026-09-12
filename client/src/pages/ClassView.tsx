import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClass } from '@/hooks/useClasses';
import { Loader2 } from 'lucide-react';
import AttendanceTracking from '@/components/AttendanceTracking';
import StudentLogs from '@/components/StudentLogs';
import ClassStatistics from '@/pages/ClassStatistics';
import { TeacherLayout } from '@/components/layouts/TeacherLayout';
import type { BreadcrumbItem } from '@/types/breadcrumb';

const ClassView = () => {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: classData, isLoading: classLoading, error } = useClass(classId || '');
  const [activeTab, setActiveTab] = useState('attendance');

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

  const breadcrumbs = useMemo(() => {
    const crumbs: BreadcrumbItem[] = [
      { label: 'Kurssit', href: '/dashboard' },
    ];

    if (classData) {
      crumbs.push({ label: classData.name, href: `/class/${classId}` });

      if (activeTab === 'attendance') {
        crumbs.push({ label: 'Läsnäolon kirjaus' });
      } else if (activeTab === 'logs') {
        crumbs.push({ label: 'Läsnäolot' });
      } else if (activeTab === 'statistics') {
        crumbs.push({ label: 'Tilastot' });
      }
    }

    return crumbs;
  }, [classData, classId, activeTab]);

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
    <TeacherLayout breadcrumbs={breadcrumbs}>
      {/* `text-3xl`, not `text-4xl`: the dashboard's own h1 is 3xl since slice 5, and two page
          titles at two sizes is the kind of drift a reskin exists to remove. The description is
          real Kurssi data, so unlike the dashboard's dropped sub-line it stays. */}
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold text-heading">{classData.name}</h1>
        {classData.description && (
          <p className="text-muted-foreground">{classData.description}</p>
        )}
      </div>

      <Tabs
        defaultValue="attendance"
        onValueChange={(value) => setActiveTab(value)}
        className="space-y-8"
      >
          {/* Two layouts, both measured at 320px and 1280px rather than reasoned about.
              From `sm` up: the fit-content pill row the prototype draws, instead of three short
              Finnish labels stretched across a 1280px grid.
              At 320px, all three options were wrong until this one — the old `grid-cols-3` gave
              each label a ~97px column while "Läsnäolon kirjaus" needs ~115px, so the text
              overflowed its own pill and touched the viewport edge; a fit-content row clipped
              "Tilastot" behind a scrollbar nobody can see. Two columns give the longest label
              145px, which fits, and the third pill wraps onto a second row. `h-auto` because
              the shadcn base pins `h-10`, which would clip that second row. */}
          <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-10 sm:w-fit">
            <TabsTrigger value="attendance">Läsnäolon kirjaus</TabsTrigger>
            <TabsTrigger value="logs">Läsnäolot</TabsTrigger>
            <TabsTrigger value="statistics">Tilastot</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            <AttendanceTracking classId={classData.id} />
          </TabsContent>

          <TabsContent value="logs">
            <StudentLogs classId={classData.id} />
          </TabsContent>

          <TabsContent value="statistics">
            <ClassStatistics classId={classData.id} />
          </TabsContent>
        </Tabs>
    </TeacherLayout>
  );
};

export default ClassView;
