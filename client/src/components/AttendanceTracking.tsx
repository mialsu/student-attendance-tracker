import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
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
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setSelectedFromDropdown(false);  // Reset when user types
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
                    setTimeout(() => setAutocompleteOpen(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();

                      // If dropdown is open, close it and let user review
                      if (autocompleteOpen && suggestions && suggestions.length > 0) {
                        setAutocompleteOpen(false);
                        return;
                      }

                      // Smart validation before submission
                      handleSmartSubmit();
                    } else if (e.key === 'Escape') {
                      setAutocompleteOpen(false);
                    } else if (e.key === 'ArrowDown' && autocompleteOpen) {
                      // Let dropdown handle arrow navigation
                      return;
                    }
                  }}
                  placeholder="Etunimi Sukunimi"
                  autoComplete="off"
                />
                {suggestions && suggestions.length > 0 && autocompleteOpen && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover p-0 text-popover-foreground shadow-md">
                    <Command>
                      <CommandList>
                        <CommandEmpty>Ei ehdotuksia</CommandEmpty>
                        <CommandGroup>
                          {suggestions.map((student) => (
                            <CommandItem
                              key={student.id}
                              value={student.name}
                              onSelect={() => {
                                setStudentName(student.name);
                                setSelectedFromDropdown(true);  // Mark as selected
                                setAutocompleteOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  studentName.trim().toLowerCase() === student.name.toLowerCase() ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex justify-between items-center w-full">
                                <span>{student.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {student.total_attendance} läsnäoloa
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
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
