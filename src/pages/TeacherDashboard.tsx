import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getAttendanceSummary, getStudentLogs, AttendanceRecord } from '@/lib/attendance';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';

const ITEMS_PER_PAGE = 20;

const StudentLogs = ({ firstName, lastName }: { firstName: string; lastName: string }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const logs = getStudentLogs(firstName, lastName);
  
  const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = logs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {paginatedLogs.map((log) => (
          <div
            key={log.id}
            className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm"
          >
            <span>{format(new Date(log.timestamp), 'PPP p', { locale: fi })}</span>
          </div>
        ))}
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Edellinen
          </Button>
          <span className="text-sm text-muted-foreground">
            Sivu {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Seuraava
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

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
              <Accordion type="single" collapsible className="space-y-2">
                {summary.map((student, index) => (
                  <AccordionItem 
                    key={index} 
                    value={`student-${index}`}
                    className="border rounded-lg bg-secondary"
                  >
                    <AccordionTrigger className="px-3 hover:no-underline hover:bg-secondary/80">
                      <div className="flex justify-between items-center w-full pr-2">
                        <span className="font-medium">
                          {student.lastName}, {student.firstName}
                        </span>
                        <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full font-semibold">
                          {student.count}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <StudentLogs 
                        firstName={student.firstName} 
                        lastName={student.lastName} 
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboard;
