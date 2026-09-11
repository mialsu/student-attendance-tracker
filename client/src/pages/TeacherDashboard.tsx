/**
 * The course dashboard — spec 0006 slice 5.
 *
 * A reskin, with two things that are corrections rather than styling:
 *
 * 1. **A course card is a `Link`.** It was a `<Card onClick>`, which renders a `div`: no role, no
 *    tab stop, nothing announced. The entire course list was mouse-only, on the surface whose
 *    whole job is picking a Kurssi. `DESIGN.md` §3 has described this state as "the Kurssi list,
 *    each card a link" since the inventory was written — the markup just never agreed. The
 *    prototype does not help here and errs the other way: `prototype/index.html:583` is a
 *    `<button>` that navigates.
 * 2. **The root breadcrumb reads "Kurssit", not "Dashboard".** The English word was rendering on
 *    every signed-in surface, not just this one, so it is fixed at all three call sites rather
 *    than the one this slice owns — one wrong word shared by three callers is still one fault
 *    (`ANTI-PATTERNS.md`, "the smallest diff in the wrong place"). `DESIGN.md` §1's claim that the
 *    404 is the only English in the app was wrong while this stood.
 *
 * Three things the prototype's dashboard carries that are deliberately **not** here:
 *
 * - **The "Aktiivinen" / "Arkistoitu" badge** (`prototype/index.html:602`). `Class.active` is
 *   explicitly out of scope for 0006 and has no screen anywhere; a badge would be this app's first
 *   surface for it, invented from mock data.
 * - **The page sub-line** ("Kolme aktiivista kurssia · 63 oppilasta yhteensä"). It serves no user
 *   story, duplicates what the cards already say, and its copy is wrong twice — `active` again,
 *   and *oppilas* where this app's glossary says **opiskelija** (`CONTEXT.md`; `opiskelij*`
 *   appears 35 times in `src/`, `oppila*` zero).
 * - **The per-course icons** (code brackets, a ruler, an atom). Mock data dressed as a field the
 *   schema does not have. One `BookOpen`, as the sidebar already uses for the same rows.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClasses, useCreateClass } from '@/hooks/useClasses';
import { Plus, BookOpen, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TeacherLayout } from '@/components/layouts/TeacherLayout';
import { QueryErrorState } from '@/components/QueryErrorState';
import type { Class } from '@/api/types';

/**
 * What the card announces itself as.
 *
 * Built explicitly because name computation concatenates descendant text with **no separator**:
 * left to the browser this card reads "Matematiikka MAA512 opiskelijaa35 läsnäoloa". That is the
 * same defect `AppShell.test.tsx` caught in the sidebar, and the same fix. The visible course name
 * is still the name's leading substring, so WCAG 2.5.3 holds.
 *
 * Each count is optional because the type is: `attendance_count` and `student_count` are additive
 * fields on the class list (`api/types.ts`), and a card that says "undefined opiskelijaa" is worse
 * than one that says nothing.
 */
function courseCardLabel(cls: Class): string {
  const parts = [cls.name];
  if (cls.student_count !== undefined) {
    parts.push(`${cls.student_count} opiskelijaa`);
  }
  if (cls.attendance_count !== undefined) {
    parts.push(`${cls.attendance_count} läsnäoloa`);
  }
  return parts.join(', ');
}

/** One count and its unit. `tabular-nums` keeps the figures aligned down a column of cards. */
const CardCount = ({ value, unit }: { value: number; unit: string }) => (
  <span>
    <b className="font-bold tabular-nums text-foreground">{value}</b> {unit}
  </span>
);

const CourseCard = ({ cls }: { cls: Class }) => (
  <Link
    to={`/class/${cls.id}`}
    aria-label={courseCardLabel(cls)}
    // `motion-safe:` on the lift, which the prototype has no way to express. `A11Y-6` is
    // `[review-only]` and already broken by `animate-fade-in` and `active:scale` elsewhere; this
    // does not fix that row, it just declines to add to it. The colour change is unconditional —
    // a border tint is not motion.
    className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Card className="flex h-full flex-col gap-4 p-5 transition-colors group-hover:border-primary motion-safe:transition-all motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:shadow-md">
      {/* `bg-accent` / `text-accent-foreground`, which is the design system's `primary-soft` pair
          as two real tokens. Deliberately NOT `bg-primary/10 text-primary` — `ui/badge.tsx:11`
          records why: an alpha tint has no token behind it, so `tokens-contrast.test.ts` cannot
          express the pair and it measured differently over a card than over the page. */}
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
        <BookOpen className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold leading-snug tracking-tight text-heading">
          {cls.name}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {cls.description || 'Ei kuvausta'}
        </p>
      </div>

      {/* Replaces the creation date this card used to carry. US-8 asks for the two counts, and
          "Luotu: 3. marraskuuta 2025" answers a question nobody opening this screen is asking. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        {cls.student_count !== undefined && (
          <CardCount value={cls.student_count} unit="opiskelijaa" />
        )}
        {cls.attendance_count !== undefined && (
          <CardCount value={cls.attendance_count} unit="läsnäoloa" />
        )}
      </div>
    </Card>
  </Link>
);

const TeacherDashboard = () => {
  const { toast } = useToast();
  const {
    data: classes,
    isLoading: classesLoading,
    // `error` used to be dropped here, which is what made a failed load render the empty
    // state — "Ei kursseja vielä" to a teacher who owns a Kurssi. DESIGN.md §3, spec 0006.
    error: classesError,
    refetch: refetchClasses,
  } = useClasses();
  const createClassMutation = useCreateClass();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [className, setClassName] = useState('');
  const [classDescription, setClassDescription] = useState('');

  const handleCreateClass = async () => {
    if (!className.trim()) {
      toast({
        title: 'Virhe',
        description: 'Kurssin nimi on pakollinen',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createClassMutation.mutateAsync({
        name: className,
        description: classDescription || undefined,
      });

      toast({
        title: 'Kurssi luotu',
        description: `Kurssi "${className}" on luotu onnistuneesti`,
      });
      setClassName('');
      setClassDescription('');
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Kurssin luominen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  return (
    <TeacherLayout breadcrumbs={[{ label: 'Kurssit' }]}>
      {/* `flex-wrap`, because at 320px the title and the button cannot share a row. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-heading">Kurssit</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Lisää uusi kurssi
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Luo uusi kurssi</DialogTitle>
              <DialogDescription>
                Lisää kurssin tiedot ja aloita läsnäolojen seuranta
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <Label htmlFor="className">Kurssin nimi</Label>
                <Input
                  id="className"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Ohjelmointi 1"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="classDescription">Kuvaus (valinnainen)</Label>
                <Textarea
                  id="classDescription"
                  value={classDescription}
                  onChange={(e) => setClassDescription(e.target.value)}
                  placeholder="Kurssin lyhyt kuvaus"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Peruuta
              </Button>
              {/* The pending label follows the logging form's own convention
                  (`AttendanceTracking.tsx:309`, "Kirjataan..."), and the disable is what stops a
                  second POST from a double-click. */}
              <Button onClick={handleCreateClass} disabled={createClassMutation.isPending}>
                {createClassMutation.isPending ? 'Luodaan...' : 'Luo kurssi'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        {classesLoading ? (
          <Card>
            <CardContent className="py-12">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-muted-foreground">Ladataan kursseja...</p>
              </div>
            </CardContent>
          </Card>
        ) : classesError ? (
          <Card>
            <CardContent className="py-12">
              <QueryErrorState
                message="Kurssien lataaminen epäonnistui"
                onRetry={() => void refetchClasses()}
              />
            </CardContent>
          </Card>
        ) : !classes || classes.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              {/* The sentence is the one that shipped, split across a heading and its line. It
                  still points at the button above rather than carrying a second one: with no
                  courses there is no grid for the dashed affordance to sit in, and two create
                  controls on one screen contradicts "one primary CTA per view". */}
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground">
                  <BookOpen className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold text-heading">Ei kursseja vielä</h2>
                <p className="max-w-sm text-muted-foreground">
                  Luo ensimmäinen kurssisi yllä olevasta painikkeesta.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((cls) => (
              <CourseCard key={cls.id} cls={cls} />
            ))}

            {/* A button among links, and that is the correct pair of semantics: the cards
                navigate, this one opens a dialog. `aria-label` again for the concatenation — the
                subtitle is supplementary and does not belong in the control's name. */}
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              aria-label="Uusi kurssi"
              className="flex min-h-[11rem] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-input p-5 text-center transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-heading">Uusi kurssi</span>
              <span className="text-sm text-muted-foreground">
                Aloita uuden kurssin seuranta
              </span>
            </button>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default TeacherDashboard;
