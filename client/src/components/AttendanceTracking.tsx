import { useId, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useCreateAttendance } from '@/hooks/useAttendance';
import { useStudentAutocomplete } from '@/hooks/useStudents';
import { useDebounce } from '@/hooks/useDebounce';
import { UserPlus, Check, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';

interface AttendanceTrackingProps {
  classId: string;
}

const AttendanceTracking = ({ classId }: AttendanceTrackingProps) => {
  const [studentName, setStudentName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [selectedFromDropdown, setSelectedFromDropdown] = useState(false);
  const { toast } = useToast();
  const createAttendanceMutation = useCreateAttendance();
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Debounce student name for autocomplete
  const debouncedName = useDebounce(studentName, 300);

  // Fetch autocomplete suggestions
  const { data: suggestions } = useStudentAutocomplete(
    classId,
    debouncedName,
    autocompleteOpen && debouncedName.length >= 2
  );

  // Which suggestion the keyboard has nominated. -1 is "none", and it is the state the list
  // opens in: ARIA's combobox pattern nominates nothing until a key asks for it, so Enter on a
  // freshly-opened list still means "submit what I typed" rather than "take the first row".
  const [activeIndex, setActiveIndex] = useState(-1);
  const fieldId = useId();
  const listboxId = `${fieldId}-suggestions`;
  const optionId = (index: number) => `${fieldId}-suggestion-${index}`;

  // Open means "there is a list on screen". `autocompleteOpen` alone was also true while the
  // request was in flight and while it came back empty, which is why it cannot drive
  // `aria-expanded`.
  const listOpen = autocompleteOpen && (suggestions?.length ?? 0) > 0;

  // US-14, and only when the answer is really in: `suggestions` is undefined until the request
  // resolves, and `debouncedName` lags the field by 300ms, so both have to agree with what is
  // typed before this may claim nobody matches.
  const noMatch =
    autocompleteOpen &&
    studentName.trim().length >= 2 &&
    debouncedName.trim() === studentName.trim() &&
    suggestions?.length === 0;

  const step = (current: number, delta: number) => {
    const count = suggestions?.length ?? 0;
    if (count === 0) return -1;
    if (current < 0) return delta > 0 ? 0 : count - 1;
    return (current + delta + count) % count;
  };

  const closeList = () => {
    setAutocompleteOpen(false);
    setActiveIndex(-1);
  };

  const accept = (student: { name: string }) => {
    setStudentName(student.name);
    setSelectedFromDropdown(true);  // Mark as selected
    closeList();
  };

  const handleSmartSubmit = () => {
    const trimmedName = studentName.trim();

    // Empty check (existing validation)
    if (!trimmedName) {
      toast({
        title: 'Virhe',
        description: 'Opiskelijan nimi on pakollinen',
        variant: 'destructive',
      });
      return;
    }

    // Case 1: User selected from dropdown → Safe to submit
    if (selectedFromDropdown) {
      submitButtonRef.current?.click();
      return;
    }

    // Case 2: Check if input exactly matches an existing student
    const exactMatch = suggestions?.find(
      (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (exactMatch) {
      // Exact match found → Safe to submit
      submitButtonRef.current?.click();
      return;
    }

    // Case 3: Check if input is a partial match (potential typo)
    const partialMatches = suggestions?.filter(
      (s) => s.name.toLowerCase().includes(trimmedName.toLowerCase())
    );

    if (partialMatches && partialMatches.length > 0) {
      // Looks like a partial match → Show warning
      toast({
        title: 'Tarkista nimi',
        description: `Löytyi ${partialMatches.length} vastaavaa opiskelijaa. Valitse listalta tai kirjoita koko nimi.`,
        variant: 'default',
      });
      setAutocompleteOpen(true);  // Reopen dropdown to show matches
      return;
    }

    // Case 4: Truly new student (no matches) → Allow submission
    // This creates a new student in the system
    submitButtonRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentName.trim()) {
      toast({
        title: 'Virhe',
        description: 'Opiskelijan nimi on pakollinen',
        variant: 'destructive',
      });
      return;
    }

    if (quantity < 1 || quantity > 50) {
      toast({
        title: 'Virhe',
        description: 'Määrän tulee olla välillä 1-50',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create timestamp from selected date + current time
      const timestamp = new Date(selectedDate);
      timestamp.setHours(new Date().getHours());
      timestamp.setMinutes(new Date().getMinutes());
      timestamp.setSeconds(new Date().getSeconds());

      const record = await createAttendanceMutation.mutateAsync({
        classId,
        data: {
          student_name: studentName.trim(),
          quantity,
          timestamp: timestamp.toISOString(),
        },
      });

      const quantityText = record.quantity_created && record.quantity_created > 1
        ? ` (${record.quantity_created} merkintää)`
        : '';

      toast({
        title: 'Läsnäolo kirjattu',
        description: `${studentName}${quantityText}`,
      });

      // Reset form but keep the selected date
      setStudentName('');
      setQuantity(1);
      setSelectedFromDropdown(false);
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Läsnäolon kirjaaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kirjaa opiskelijan läsnäolo</CardTitle>
        <CardDescription>
          Syötä opiskelijan nimi ja kirjaa läsnäolo kurssille
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Date Picker */}
          <div className="space-y-3">
            <Label htmlFor="attendance-date">Päivämäärä</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="attendance-date"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP', { locale: fi }) : 'Valitse päivämäärä'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  locale={fi}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Student Name with Autocomplete */}
            <div className="space-y-3">
              <Label htmlFor="studentName">Opiskelijan nimi</Label>
              <div className="relative">
                <Input
                  id="studentName"
                  value={studentName}
                  role="combobox"
                  aria-expanded={listOpen}
                  aria-controls={listOpen ? listboxId : undefined}
                  aria-activedescendant={
                    listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
                  }
                  aria-autocomplete="list"
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setSelectedFromDropdown(false);  // Reset when user types
                    setActiveIndex(-1);              // a new query has a new list
                    if (e.target.value.length >= 2) {
                      setAutocompleteOpen(true);
                    } else {
                      setAutocompleteOpen(false);
                    }
                  }}
                  onFocus={() => {
                    if (studentName.length >= 2) {
                      setAutocompleteOpen(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay closing to allow clicking on suggestions
                    setTimeout(() => closeList(), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      // The list is a sibling of this input, not its parent, so nothing else is
                      // listening for these: before 2026-09-11 this branch returned and let a
                      // `Command` that never had focus "handle" them, which meant nothing moved.
                      if (!listOpen) {
                        if (studentName.length >= 2) setAutocompleteOpen(true);
                        return;
                      }
                      e.preventDefault();
                      setActiveIndex((current) => step(current, e.key === 'ArrowDown' ? 1 : -1));
                      return;
                    }

                    if (e.key === 'Enter') {
                      e.preventDefault();

                      // An option is nominated: Enter accepts it and the form stays put. Submit
                      // is a second, deliberate Enter.
                      if (listOpen && activeIndex >= 0) {
                        const chosen = suggestions?.[activeIndex];
                        if (chosen) accept(chosen);
                        return;
                      }

                      // If dropdown is open, close it and let user review
                      if (listOpen) {
                        closeList();
                        return;
                      }

                      // Smart validation before submission
                      handleSmartSubmit();
                    } else if (e.key === 'Escape') {
                      closeList();
                    }
                  }}
                  placeholder="Etunimi Sukunimi"
                  autoComplete="off"
                />
                {listOpen && (
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label="Opiskelijaehdotukset"
                    className="absolute z-50 w-full mt-1 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    {(suggestions ?? []).map((student, index) => (
                      <li
                        key={student.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={index === activeIndex}
                        // The tally would otherwise run into the name in the accessible name —
                        // "Väinö Nieminen7 läsnäoloa". The visible name is the leading substring
                        // of this one, which is what WCAG 2.5.3 asks for.
                        aria-label={`${student.name}, ${student.total_attendance} läsnäoloa`}
                        // mousedown, not click: the input's blur would otherwise close the list
                        // out from under the pointer. preventDefault keeps focus in the field.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          accept(student);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          'flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm',
                          index === activeIndex && 'bg-accent text-accent-foreground'
                        )}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            studentName.trim().toLowerCase() === student.name.toLowerCase() ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex justify-between items-center w-full">
                          <span>{student.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {student.total_attendance} läsnäoloa
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {noMatch && (
                  <p role="status" className="mt-2 text-xs text-muted-foreground">
                    Ei osumia — nimellä <strong>{studentName.trim()}</strong> luodaan uusi
                    opiskelija.
                  </p>
                )}
              </div>
            </div>

            {/* Quantity Input */}
            <div className="space-y-3">
              <Label htmlFor="quantity">Määrä</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitButtonRef.current?.click();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Kirjaa 1-50 läsnäoloa kerralla
              </p>
            </div>
          </div>

          <Button
            ref={submitButtonRef}
            type="submit"
            className="w-full md:w-auto"
            disabled={createAttendanceMutation.isPending}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {createAttendanceMutation.isPending ? 'Kirjataan...' : 'Kirjaa läsnäolo'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Ohje:</strong> Ala kirjoittaa opiskelijan nimeä nähdäksesi ehdotuksia.
            Voit myös kirjoittaa uuden nimen manuaalisesti. Määrä-kentällä voit kirjata
            useita läsnäoloja kerralla (esim. korjaukset tai aiemmat tunnit).
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceTracking;
