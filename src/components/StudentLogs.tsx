import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { getClassAttendanceSummary, getStudentAttendanceInClass, ClassAttendanceRecord } from '@/lib/classes';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { deleteAttendanceRecord } from '@/lib/classes';
import { useToast } from '@/hooks/use-toast';

interface StudentLogsProps {
  classId: string;
}

const ITEMS_PER_PAGE = 20;

const StudentLogsList = ({
  logs,
  onDelete
}: {
  logs: ClassAttendanceRecord[];
  onDelete: (recordId: string) => void;
}) => {
  const [currentPage, setCurrentPage] = useState(1);

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(log.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
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

const StudentLogs = ({ classId }: StudentLogsProps) => {
  const [summary, setSummary] = useState<Array<{ firstName: string; lastName: string; count: number }>>([]);
  const { toast } = useToast();

  const loadSummary = useCallback(() => {
    setSummary(getClassAttendanceSummary(classId));
  }, [classId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleDeleteRecord = (recordId: string) => {
    if (deleteAttendanceRecord(recordId)) {
      toast({
        title: 'Merkintä poistettu',
        description: 'Läsnäolomerkintä on poistettu onnistuneesti',
      });
      loadSummary();
    } else {
      toast({
        title: 'Virhe',
        description: 'Merkinnän poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opiskelijoiden läsnäololokit</CardTitle>
        <CardDescription>
          Näet kaikki opiskelijat ja heidän läsnäolomerkintänsä kurssilla
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Ei läsnäoloja kirjattu vielä tälle kurssille
          </p>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {summary.map((student, index) => {
              const logs = getStudentAttendanceInClass(classId, student.firstName, student.lastName);
              return (
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
                    <StudentLogsList
                      logs={logs}
                      onDelete={handleDeleteRecord}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentLogs;
