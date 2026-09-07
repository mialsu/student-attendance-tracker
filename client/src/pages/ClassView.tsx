import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
// PROTOTYPE — throwaway, and reachable only on a dev build with ?variant= in the URL.
// See src/components/prototype/lasnaolot/. Remove with the rest of the prototype once a
// direction wins (/prototype, step 6).
import { LasnaolotVariants } from '@/components/prototype/lasnaolot';

const ClassView = () => {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  // `import.meta.env.PROD` is replaced statically by Vite, so this whole branch — and the import
  // above with it — is dead code in a production build rather than a feature flag.
  const showPrototype = !import.meta.env.PROD && Boolean(searchParams.get('variant'));
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
      { label: 'Dashboard', href: '/dashboard' },
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
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-heading mb-3">{classData.name}</h1>
        {classData.description && (
          <p className="text-lg text-muted-foreground">{classData.description}</p>
        )}
      </div>

      <Tabs
        // PROTOTYPE: land straight on Läsnäolot when a ?variant= is requested, since that is the
        // tab the variants replace. Normal behaviour is unchanged.
        defaultValue={showPrototype ? 'logs' : 'attendance'}
        onValueChange={(value) => setActiveTab(value)}
        className="space-y-8"
      >
          <TabsList className="grid w-full max-w-3xl grid-cols-3">
            <TabsTrigger value="attendance">Läsnäolon kirjaus</TabsTrigger>
            <TabsTrigger value="logs">Läsnäolot</TabsTrigger>
            <TabsTrigger value="statistics">Tilastot</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            <AttendanceTracking classId={classData.id} />
          </TabsContent>

          <TabsContent value="logs">
            {showPrototype ? (
              <LasnaolotVariants classId={classData.id} />
            ) : (
              <StudentLogs classId={classData.id} />
            )}
          </TabsContent>

          <TabsContent value="statistics">
            <ClassStatistics classId={classData.id} />
          </TabsContent>
        </Tabs>
    </TeacherLayout>
  );
};

export default ClassView;
