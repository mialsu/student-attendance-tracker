import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAttendance, useDeleteAttendance } from '@/hooks/useAttendance';
import { ChevronLeft, ChevronRight, Trash2, Loader2, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface StudentLogsProps {
  classId: string;
}

const ITEMS_PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 500;

const StudentLogs = ({ classId }: StudentLogsProps) => {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState(''); // User's input
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Debounced value for API
  const [includeLegacy, setIncludeLegacy] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1); // Reset to first page when search changes
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Calculate skip for server-side pagination
  const skip = (currentPage - 1) * ITEMS_PER_PAGE;

  // Fetch attendance records with filters
  const { data: paginatedResponse, isLoading } = useAttendance(classId, {
    skip,
    limit: ITEMS_PER_PAGE,
    student_name: debouncedSearch || undefined,
    legacy: includeLegacy || undefined,
  });

  const deleteAttendanceMutation = useDeleteAttendance();

  // Extract records and pagination info
  const records = paginatedResponse?.items || [];
  const total = paginatedResponse?.total || 0;

  // Group records by student
  const groupedRecords = useMemo(() => {
    if (!records || records.length === 0) return [];

    const groups = new Map<string, typeof records>();

    records.forEach(record => {
      const key = `${record.student_last_name}|${record.student_first_name}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    });

    // Convert to array and sort by last name
    return Array.from(groups.entries())
      .map(([key, records]) => {
        const [lastName, firstName] = key.split('|');
        return {
          student_first_name: firstName,
          student_last_name: lastName,
          records: records.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ),
          total_attendance: records.length,
        };
      })
      .sort((a, b) => a.student_last_name.localeCompare(b.student_last_name));
  }, [records]);

  const handleDeleteRecord = async (recordId: string, classId: string) => {
    try {
      await deleteAttendanceMutation.mutateAsync({ recordId, classId });
      toast({
        title: 'Merkintä poistettu',
        description: 'Läsnäolomerkintä on poistettu onnistuneesti',
      });
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Merkinnän poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setIncludeLegacy(false);
    setCurrentPage(1);
  };

  const hasActiveFilters = searchInput || includeLegacy;

  // Calculate pagination info from total count
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Opiskelijoiden läsnäolot</CardTitle>
          <CardDescription>
            Näet kaikki opiskelijat ja heidän läsnäolomerkintänsä kurssilla
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-muted-foreground">Ladataan lokeja...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opiskelijoiden läsnäolot</CardTitle>
        <CardDescription>
          Näet kaikki opiskelijat ja heidän läsnäolomerkintänsä kurssilla
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filter Controls */}
        <div className="space-y-3 p-4 rounded-lg border bg-muted/50">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Etsi opiskelijan nimellä..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleClearFilters}
                title="Tyhjennä suodattimet"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-legacy"
              checked={includeLegacy}
              onCheckedChange={(checked) => {
                setIncludeLegacy(checked as boolean);
                setCurrentPage(1); // Reset to first page on filter change
              }}
            />
            <Label
              htmlFor="include-legacy"
              className="text-sm font-normal cursor-pointer"
            >
              Näytä myös vanhat opiskelijat (ensimmäinen läsnäolo yli 5 vuotta sitten)
            </Label>
          </div>
        </div>

        {/* Records List */}
        {!records || records.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {hasActiveFilters
              ? 'Ei läsnäoloja löytynyt valituilla suodattimilla'
              : 'Ei läsnäoloja kirjattu vielä tälle kurssille'
            }
          </p>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {groupedRecords.map((student, index) => (
              <AccordionItem
                key={index}
                value={`student-${index}`}
                className="border rounded-lg bg-secondary"
              >
                <AccordionTrigger className="px-3 hover:no-underline hover:bg-secondary/80">
                  <div className="flex justify-between items-center w-full pr-2">
                    <span className="font-medium">
                      {student.student_last_name}, {student.student_first_name}
                    </span>
                    <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full font-semibold">
                      {student.total_attendance}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="space-y-2">
                    {student.records.map((record) => (
                      <div
                        key={record.id}
                        className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm"
                      >
                        <span>{format(new Date(record.timestamp), 'PPP p', { locale: fi })}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRecord(record.id, classId)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Pagination Controls */}
        {total > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={!hasPrevPage}
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
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!hasNextPage}
            >
              Seuraava
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Results count */}
        {total > 0 && (
          <p className="text-sm text-muted-foreground text-center pt-2">
            Yhteensä {total} merkintä{total !== 1 ? 'ä' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentLogs;
