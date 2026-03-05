import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, ColumnDef, ExpandableConfig, RowAction } from '@/components/ui/data-table';
import { useAttendanceSummary, useDeleteAttendance } from '@/hooks/useAttendance';
import { useUpdateStudent, useDeleteStudent, useMergeStudent } from '@/hooks/useStudents';
import { studentsApi } from '@/api/students';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ChevronLeft, ChevronRight, Trash2, Loader2, Search, X, MoreVertical, Check, Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import type { AttendanceSummary } from '@/api/types';

interface StudentLogsProps {
  classId: string;
}

const ITEMS_PER_PAGE = 20;

const StudentLogs = ({ classId }: StudentLogsProps) => {
  const { toast } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');

  // Mutation hooks
  const deleteAttendanceMutation = useDeleteAttendance();
  const updateStudentMutation = useUpdateStudent();
  const deleteStudentMutation = useDeleteStudent();
  const mergeStudentMutation = useMergeStudent();

  // Dialog state management
  const [deleteStudentDialogState, setDeleteStudentDialogState] = useState({
    open: false,
    studentId: null as string | null,
    studentName: '',
    attendanceCount: 0,
  });

  const [deleteAttendanceDialogState, setDeleteAttendanceDialogState] = useState({
    open: false,
    recordId: null as string | null,
    timestamp: '',
  });

  // Edit state
  interface EditingState {
    studentId: string;
    originalName: string;
    editedName: string;
    isSubmitting: boolean;
  }
  const [editingStudent, setEditingStudent] = useState<EditingState | null>(null);

  // Merge dialog state
  interface MergeDialogState {
    open: boolean;
    targetStudent: {
      id: string;
      name: string;
      totalAttendance: number;
      courseCredit: boolean;
    } | null;
    duplicateStudent: {
      id: string;
      name: string;
      totalAttendance: number;
      courseCredit: boolean;
    } | null;
  }
  const [mergeDialogState, setMergeDialogState] = useState<MergeDialogState>({
    open: false,
    targetStudent: null,
    duplicateStudent: null,
  });

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 500);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // Calculate skip for pagination
  const skip = (currentPage - 1) * ITEMS_PER_PAGE;

  // Fetch attendance summary with search, pagination, and sorting
  const { data: paginatedResponse, isLoading } = useAttendanceSummary(classId, {
    skip,
    limit: ITEMS_PER_PAGE,
    search: debouncedSearch || undefined,
    sort_by: 'attendance_desc', // Sort by most attendances first
  });

  // Edit handlers
  const handleStartEdit = (student: AttendanceSummary) => {
    setEditingStudent({
      studentId: student.student_id,
      originalName: student.student_name,
      editedName: student.student_name,
      isSubmitting: false,
    });
  };

  const handleCancelEdit = () => {
    setEditingStudent(null);
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;

    const trimmedName = editingStudent.editedName.trim();

    // Validation
    if (!trimmedName) {
      toast({
        title: 'Virhe',
        description: 'Nimi ei voi olla tyhjä',
        variant: 'destructive',
      });
      return;
    }

    // No change - just exit edit mode
    if (trimmedName === editingStudent.originalName) {
      setEditingStudent(null);
      return;
    }

    // Set submitting state
    setEditingStudent({ ...editingStudent, isSubmitting: true });

    try {
      // Attempt to update student name
      await updateStudentMutation.mutateAsync({
        studentId: editingStudent.studentId,
        data: { name: trimmedName },
      });

      // Success
      setEditingStudent(null);
      toast({
        title: 'Nimi päivitetty',
        description: 'Opiskelijan nimi on päivitetty onnistuneesti',
      });
    } catch (error) {
      // Check if duplicate error
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;

      if (errorMessage?.includes('already exists in this class')) {
        // Duplicate detected - initiate merge flow
        await handleDuplicateDetected(trimmedName);
      } else {
        // Other error
        setEditingStudent({ ...editingStudent, isSubmitting: false });
        toast({
          title: 'Virhe',
          description: errorMessage || 'Nimen päivitys epäonnistui',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDuplicateDetected = async (newName: string) => {
    if (!editingStudent) return;

    try {
      // Fetch duplicate student by exact name search
      const duplicateResponse = await studentsApi.list(classId, {
        search: newName,
        limit: 50,
      });

      // Find exact match (case-insensitive)
      const duplicate = duplicateResponse.items.find(
        (s) =>
          s.name.toLowerCase() === newName.toLowerCase() && s.id !== editingStudent.studentId
      );

      if (!duplicate) {
        throw new Error('Duplicate student not found');
      }

      // Get current student details
      const currentStudent = students.find((s) => s.student_id === editingStudent.studentId);
      if (!currentStudent) {
        throw new Error('Current student not found');
      }

      // Show merge dialog
      setMergeDialogState({
        open: true,
        targetStudent: {
          id: editingStudent.studentId,
          name: newName,
          totalAttendance: currentStudent.total_attendance,
          courseCredit: currentStudent.course_credit_received,
        },
        duplicateStudent: {
          id: duplicate.id,
          name: duplicate.name,
          totalAttendance: duplicate.total_attendance || 0,
          courseCredit: duplicate.course_credit_received,
        },
      });

      // Keep edit mode open
      setEditingStudent({ ...editingStudent, isSubmitting: false });
    } catch (error) {
      setEditingStudent({ ...editingStudent, isSubmitting: false });
      toast({
        title: 'Virhe',
        description: 'Duplikaatin tarkistus epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergeDialogState.targetStudent || !mergeDialogState.duplicateStudent) return;

    try {
      await mergeStudentMutation.mutateAsync({
        targetStudentId: mergeDialogState.targetStudent.id,
        duplicateStudentId: mergeDialogState.duplicateStudent.id,
      });

      // Success
      setMergeDialogState({ open: false, targetStudent: null, duplicateStudent: null });
      setEditingStudent(null);

      const totalMerged =
        (mergeDialogState.targetStudent.totalAttendance || 0) +
        (mergeDialogState.duplicateStudent.totalAttendance || 0);

      toast({
        title: 'Opiskelijat yhdistetty',
        description: `${mergeDialogState.duplicateStudent.name} yhdistetty onnistuneesti. Yhteensä ${totalMerged} läsnäoloa.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;

      toast({
        title: 'Virhe',
        description: errorMessage || 'Opiskelijoiden yhdistäminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  // Handler for toggling course credit
  const handleToggleCourseCredit = async (studentId: string, currentValue: boolean) => {
    try {
      await updateStudentMutation.mutateAsync({
        studentId,
        data: { course_credit_received: !currentValue },
      });
      toast({
        title: 'Suoritusmerkintä päivitetty',
        description: 'Opiskelijan suoritusmerkintä on päivitetty onnistuneesti',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;
      toast({
        title: 'Virhe',
        description: errorMessage || 'Suoritusmerkinnän päivitys epäonnistui',
        variant: 'destructive',
      });
    }
  };

  // Handler for delete student confirmation
  const handleConfirmDeleteStudent = async () => {
    if (!deleteStudentDialogState.studentId) return;

    try {
      await deleteStudentMutation.mutateAsync(deleteStudentDialogState.studentId);
      toast({
        title: 'Opiskelija poistettu',
        description: `${deleteStudentDialogState.studentName} ja ${deleteStudentDialogState.attendanceCount} läsnäolomerkintää poistettu`,
      });
      setDeleteStudentDialogState({ open: false, studentId: null, studentName: '', attendanceCount: 0 });
    } catch (error) {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;
      toast({
        title: 'Virhe',
        description: errorMessage || 'Opiskelijan poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  // Handler for opening delete attendance dialog
  const handleDeleteAttendanceClick = (record: { id: string; timestamp: string }) => {
    setDeleteAttendanceDialogState({
      open: true,
      recordId: record.id,
      timestamp: format(new Date(record.timestamp), 'PPP p', { locale: fi }),
    });
  };

  // Handler for delete attendance confirmation
  const handleConfirmDeleteAttendance = async () => {
    if (!deleteAttendanceDialogState.recordId) return;

    try {
      await deleteAttendanceMutation.mutateAsync({
        recordId: deleteAttendanceDialogState.recordId,
        classId,
      });
      toast({
        title: 'Merkintä poistettu',
        description: 'Läsnäolomerkintä on poistettu onnistuneesti',
      });
      setDeleteAttendanceDialogState({ open: false, recordId: null, timestamp: '' });
    } catch (error) {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;
      toast({
        title: 'Virhe',
        description: errorMessage || 'Merkinnän poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteRecord = async (recordId: string, classId: string) => {
    try {
      await deleteAttendanceMutation.mutateAsync({ recordId, classId });
      toast({
        title: 'Merkintä poistettu',
        description: 'Läsnäolomerkintä on poistettu onnistuneesti',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error.response as { data?: { detail?: string } })?.data?.detail
          : undefined;
      toast({
        title: 'Virhe',
        description: errorMessage || 'Merkinnän poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setCurrentPage(1);
  };

  // Extract data from paginated response
  const students = paginatedResponse?.items || [];
  const total = paginatedResponse?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // Column definitions for desktop DataTable
  const studentColumns: ColumnDef<AttendanceSummary>[] = [
    {
      id: 'student_name',
      header: 'Opiskelijan nimi',
      width: 'w-[40%]',
      cell: (row) => {
        const isEditing = editingStudent?.studentId === row.student_id;

        if (isEditing) {
          // Edit mode: Input with Save/Cancel buttons
          return (
            <div className="flex items-center gap-2">
              <Input
                value={editingStudent.editedName}
                onChange={(e) =>
                  setEditingStudent({
                    ...editingStudent,
                    editedName: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="h-8"
                disabled={editingStudent.isSubmitting}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveEdit();
                }}
                disabled={
                  editingStudent.isSubmitting || !editingStudent.editedName.trim()
                }
                className="h-8 w-8"
              >
                {editingStudent.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 text-green-600" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelEdit();
                }}
                disabled={editingStudent.isSubmitting}
                className="h-8 w-8"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          );
        }

        // View mode: Name with edit icon on hover
        return (
          <div className="flex items-center gap-2 group">
            <span className="font-medium">{row.student_name}</span>
            {row.course_credit_received && (
              <Badge variant="default" className="text-xs">
                Suoritus
              </Badge>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit(row);
              }}
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        );
      },
    },
    {
      id: 'total_attendance',
      header: 'Läsnäolot',
      headerAlign: 'center',
      width: 'w-[15%]',
      cell: (row) => (
        <div className="flex justify-center">
          <Badge variant="secondary" className="px-3 py-1 font-semibold">
            {row.total_attendance}
          </Badge>
        </div>
      ),
    },
    {
      id: 'course_credit',
      header: 'Suoritus',
      headerAlign: 'center',
      width: 'w-[20%]',
      cell: (row) => (
        <div
          className="flex justify-center items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={row.course_credit_received}
            onCheckedChange={() =>
              handleToggleCourseCredit(row.student_id, row.course_credit_received)
            }
            disabled={updateStudentMutation.isPending}
            aria-label={`Suoritusmerkintä - ${row.student_name}`}
          />
          {updateStudentMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      ),
    },
  ];

  // Row actions for desktop DataTable
  const studentActions: RowAction<AttendanceSummary>[] = [
    {
      label: 'Poista opiskelija',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'ghost',
      onClick: (student) => {
        setDeleteStudentDialogState({
          open: true,
          studentId: student.student_id,
          studentName: student.student_name,
          attendanceCount: student.total_attendance,
        });
      },
    },
  ];

  // Expandable configuration for desktop DataTable
  const expandableConfig: ExpandableConfig<AttendanceSummary> = {
    getRowId: (row) => row.student_id,
    renderExpanded: (student) => (
      <div className="px-6 py-4 space-y-2 bg-muted/30">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">
          Läsnäolomerkinnät ({student.records.length})
        </h4>
        <div className="space-y-1">
          {student.records.map((record) => (
            <div
              key={record.id}
              className="flex justify-between items-center p-3 rounded-md bg-background border text-sm"
            >
              <span className="font-mono">
                {format(new Date(record.timestamp), 'PPP p', { locale: fi })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteAttendanceClick(record)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    ),
  };

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
          Opiskelijat järjestetty läsnäolomäärän mukaan (eniten läsnäoloja ensin)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search Bar */}
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
          {searchInput && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleClearSearch}
              title="Tyhjennä haku"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Responsive: DataTable on Desktop, Accordion on Mobile */}
        {isDesktop ? (
          <DataTable
            columns={studentColumns}
            data={students}
            isLoading={isLoading}
            expandable={expandableConfig}
            rowActions={studentActions}
            pagination={{
              currentPage,
              totalItems: total,
              pageSize: ITEMS_PER_PAGE,
              onPageChange: setCurrentPage,
            }}
            emptyMessage={
              debouncedSearch
                ? `Ei hakutuloksia haulla "${debouncedSearch}"`
                : 'Ei opiskelijoita vielä'
            }
          />
        ) : (
          <>
            {/* Mobile: Existing Accordion UI */}
            {students.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchInput
                  ? 'Ei opiskelijoita löytynyt haulla'
                  : 'Ei läsnäoloja kirjattu vielä tälle kurssille'}
              </p>
            ) : (
              <Accordion type="single" collapsible className="space-y-3">
                {students.map((student) => (
                  <AccordionItem
                    key={student.student_id}
                    value={student.student_id}
                    className="border rounded-lg bg-secondary"
                  >
                    <AccordionTrigger className="px-3 hover:no-underline hover:bg-secondary/80">
                      <div className="flex justify-between items-center w-full pr-2">
                        {/* Left side: Name and badge */}
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{student.student_name}</span>
                          {student.course_credit_received && (
                            <Badge variant="default" className="text-xs">
                              Suoritus
                            </Badge>
                          )}
                        </div>

                        {/* Right side: Count and menu */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full font-semibold">
                            {student.total_attendance}
                          </span>

                          {/* Context Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Student actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Edit Name */}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(student);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Muokkaa nimeä
                              </DropdownMenuItem>

                              {/* Toggle Course Credit */}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCourseCredit(
                                    student.student_id,
                                    student.course_credit_received
                                  );
                                }}
                                disabled={updateStudentMutation.isPending}
                              >
                                <div className="flex items-center gap-2">
                                  {student.course_credit_received && (
                                    <Check className="h-4 w-4" />
                                  )}
                                  <span>
                                    {student.course_credit_received
                                      ? 'Poista suoritusmerkintä'
                                      : 'Merkitse suoritetuksi'}
                                  </span>
                                </div>
                              </DropdownMenuItem>

                              {/* Delete Student */}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteStudentDialogState({
                                    open: true,
                                    studentId: student.student_id,
                                    studentName: student.student_name,
                                    attendanceCount: student.total_attendance,
                                  });
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Poista opiskelija
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6 pt-0">
                      <div className="space-y-2">
                        {student.records.map((record) => (
                          <div
                            key={record.id}
                            className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm"
                          >
                            <span>
                              {format(new Date(record.timestamp), 'PPP p', { locale: fi })}
                            </span>
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
          </>
        )}

        {/* Pagination Controls (Mobile Only - Desktop uses DataTable pagination) */}
        {!isDesktop && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
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
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage === totalPages}
            >
              Seuraava
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Results Summary (Mobile Only) */}
        {!isDesktop && total > 0 && (
          <p className="text-sm text-muted-foreground text-center pt-2">
            {searchInput ? (
              <>
                Löytyi {total} opiskelija{total !== 1 ? 'a' : ''} haulla "{debouncedSearch}"
              </>
            ) : (
              <>
                Yhteensä {total} opiskelija{total !== 1 ? 'a' : ''}
              </>
            )}
          </p>
        )}

        {/* Delete Student Dialog */}
        <AlertDialog
          open={deleteStudentDialogState.open}
          onOpenChange={(open) =>
            setDeleteStudentDialogState({ ...deleteStudentDialogState, open })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Poista opiskelija?</AlertDialogTitle>
              <AlertDialogDescription>
                Haluatko varmasti poistaa opiskelijan{' '}
                <strong>{deleteStudentDialogState.studentName}</strong>? Tämä poistaa myös
                kaikki <strong>{deleteStudentDialogState.attendanceCount}</strong>{' '}
                läsnäolomerkintää. Tätä toimintoa ei voi perua.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Peruuta</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteStudent}
                disabled={deleteStudentMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteStudentMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Poista
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Attendance Dialog */}
        <AlertDialog
          open={deleteAttendanceDialogState.open}
          onOpenChange={(open) =>
            setDeleteAttendanceDialogState({ ...deleteAttendanceDialogState, open })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Poista läsnäolomerkintä?</AlertDialogTitle>
              <AlertDialogDescription>
                Haluatko varmasti poistaa läsnäolomerkinnän{' '}
                <strong>{deleteAttendanceDialogState.timestamp}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Peruuta</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteAttendance}
                disabled={deleteAttendanceMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteAttendanceMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Poista
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Merge Students Dialog */}
        <AlertDialog
          open={mergeDialogState.open}
          onOpenChange={(open) => {
            if (!open && !mergeStudentMutation.isPending) {
              // User cancelled
              setMergeDialogState({ open: false, targetStudent: null, duplicateStudent: null });
              setEditingStudent(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opiskelija on jo olemassa</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>
                  Opiskelija nimellä <strong>{mergeDialogState.targetStudent?.name}</strong> on jo
                  olemassa tällä kurssilla. Haluatko yhdistää nämä kaksi opiskelijaa?
                </p>

                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Nykyinen opiskelija (pidettävä):
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm">{mergeDialogState.targetStudent?.name}</span>
                      <Badge variant="secondary">
                        {mergeDialogState.targetStudent?.totalAttendance} läsnäoloa
                      </Badge>
                      {mergeDialogState.targetStudent?.courseCredit && (
                        <Badge variant="default">Suoritus</Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Duplikaatti (poistettava):
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm">{mergeDialogState.duplicateStudent?.name}</span>
                      <Badge variant="secondary">
                        {mergeDialogState.duplicateStudent?.totalAttendance} läsnäoloa
                      </Badge>
                      {mergeDialogState.duplicateStudent?.courseCredit && (
                        <Badge variant="default">Suoritus</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Yhdistäminen:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Kaikki läsnäolomerkinnät siirretään duplikaatista nykyiseen</li>
                    <li>
                      Yhteensä{' '}
                      {(mergeDialogState.targetStudent?.totalAttendance || 0) +
                        (mergeDialogState.duplicateStudent?.totalAttendance || 0)}{' '}
                      läsnäoloa
                    </li>
                    <li>
                      Suoritusmerkintä:{' '}
                      {mergeDialogState.targetStudent?.courseCredit ||
                      mergeDialogState.duplicateStudent?.courseCredit
                        ? 'Kyllä'
                        : 'Ei'}
                    </li>
                    <li>Duplikaatti poistetaan pysyvästi</li>
                  </ul>
                </div>

                <p className="text-sm text-destructive font-medium">Tätä toimintoa ei voi perua!</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={mergeStudentMutation.isPending}
                onClick={() => {
                  setMergeDialogState({ open: false, targetStudent: null, duplicateStudent: null });
                  setEditingStudent(null);
                }}
              >
                Peruuta
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmMerge}
                disabled={mergeStudentMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {mergeStudentMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Yhdistä opiskelijat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Mobile Edit Name Dialog */}
        <Dialog
          open={!isDesktop && editingStudent !== null}
          onOpenChange={(open) => {
            if (!open) handleCancelEdit();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Muokkaa opiskelijan nimeä</DialogTitle>
              <DialogDescription>
                Muuta opiskelijan nimeä. Jos nimi on jo olemassa, voit yhdistää opiskelijat.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={editingStudent?.editedName || ''}
                onChange={(e) =>
                  setEditingStudent(
                    editingStudent
                      ? {
                          ...editingStudent,
                          editedName: e.target.value,
                        }
                      : null
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                placeholder="Opiskelijan nimi"
                disabled={editingStudent?.isSubmitting}
                autoFocus
              />
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={editingStudent?.isSubmitting}
                className="w-full sm:w-auto"
              >
                Peruuta
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={
                  editingStudent?.isSubmitting || !editingStudent?.editedName.trim()
                }
                className="w-full sm:w-auto"
              >
                {editingStudent?.isSubmitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Tallenna
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default StudentLogs;
