/**
 * *Tilastot*' timeframe: two single date pickers, `Alkaen` and `Päättyen`, empty by default.
 *
 * **Two single pickers rather than one range picker**, deliberately (spec 0008 decision 9). The
 * teacher already operates exactly this control to log attendance — `AttendanceTracking`'s
 * `Popover` + `Calendar mode="single" locale={fi}`, future days disabled — and a `mode="range"`
 * calendar is a second interaction to learn for the same two values. Everything here down to the
 * trigger's `w-full justify-start text-left font-normal` is that component's pattern, so the two
 * surfaces stay one idiom.
 *
 * **The ends cross-disable.** `Alkaen` offers no day after a chosen `Päättyen` and the reverse, so
 * an inverted range is unrepresentable rather than merely refused. The server refuses one anyway
 * with a 422 — the contract does not depend on this component being the only client.
 */
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface StatisticsRangeFilterProps {
  dateFrom?: Date;
  dateTo?: Date;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onClear: () => void;
}

/** One end. Both ends are the same control, so they are the same function. */
interface EndProps {
  id: string;
  label: string;
  value?: Date;
  onChange: (date: Date | undefined) => void;
  /** Days this end may not take, beyond the future ones every end refuses. */
  disabled: (date: Date) => boolean;
}

const RangeEnd = ({ id, label, value, onChange, disabled }: EndProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {/* `P` rather than `PPP`: the short Finnish form (1.9.2026) is what she writes, and at
              320px two long-form dates side by side do not fit. US-21. */}
          {value ? format(value, 'P', { locale: fi }) : 'Valitse päivämäärä'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          // A future day could not contain attendance, so neither end offers one (US-20). The
          // cross-disabling rule for THIS end comes in from the caller.
          disabled={(date) => date > new Date() || disabled(date)}
          initialFocus
          locale={fi}
        />
      </PopoverContent>
    </Popover>
  </div>
);

export const StatisticsRangeFilter = ({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
}: StatisticsRangeFilterProps) => {
  const hasRange = Boolean(dateFrom || dateTo);

  return (
    // A `fieldset` with a `legend`, so a screen reader announces the two pickers as one control
    // rather than two loose buttons. `Aikaväli` is the group's name, which is why it is not also
    // a heading — that would announce twice.
    <fieldset className="space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Aikaväli
      </legend>

      {/* One column at 320px, two once there is room. `sm:` rather than `md:` because two short
          date buttons fit well before the md breakpoint, and A11Y-7 measures the 320px end. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RangeEnd
          id="statistics-date-from"
          label="Alkaen"
          value={dateFrom}
          onChange={onDateFromChange}
          disabled={(date) => (dateTo ? date > dateTo : false)}
        />
        <RangeEnd
          id="statistics-date-to"
          label="Päättyen"
          value={dateTo}
          onChange={onDateToChange}
          disabled={(date) => (dateFrom ? date < dateFrom : false)}
        />
      </div>

      {/* Rendered only with a range set: clearing nothing is not an action, and an always-present
          disabled button is one more thing in the tab order for every teacher who never filters.
          US-5 — getting back to the whole Kurssi is one press, not a second date-picking exercise. */}
      {hasRange && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <X className="mr-2 h-4 w-4" />
          Tyhjennä aikaväli
        </Button>
      )}
    </fieldset>
  );
};

export default StatisticsRangeFilter;
