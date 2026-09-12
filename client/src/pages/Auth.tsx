import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import PublicNav from '@/components/PublicNav';
import { BarChart3, CheckCircle2, Eye, EyeOff, UserPlus } from 'lucide-react';

/**
 * What the aside says, and why it is a list of functions rather than a pitch.
 *
 * US-2 asks the login screen to "plainly describe what the app does, so that it feels like a
 * personal utility and not a sales pitch", and AC8 makes "no sales copy" a criterion. These three
 * are the app's three functions, named with the same words the rest of the UI uses — the glossary
 * in `client/CONTEXT.md`, not a synonym for it.
 */
const FUNCTIONS = [
  { icon: UserPlus, title: 'Läsnäolon kirjaus', detail: 'Nimellä, 1–50 kerralla' },
  { icon: CheckCircle2, title: 'Suoritusmerkinnät', detail: 'Kurssisuoritus opiskelijakohtaisesti' },
  { icon: BarChart3, title: 'Tilastot', detail: 'Päivä- ja kuukausitasolla' },
] as const;

/** The one sentence that survives to 320px. Below `shell` it is the whole aside. */
const LEDE = 'Kaikki kurssisi samassa näkymässä: läsnäolot, suoritusmerkinnät ja tilastot.';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  /**
   * The in-flight state `DESIGN.md:151` asks for in both modes of this surface.
   *
   * `useMutation` rather than a `useState` boolean because `isPending` is the vocabulary the
   * other six mutations in this app already use — `TeacherDashboard.tsx:211`,
   * `AttendanceTracking.tsx:389` and four in `StudentLogs.tsx`. Nothing is invalidated here: the
   * auth context owns the user, so the mutation is carrying the pending flag and nothing else.
   */
  const submitMutation = useMutation({
    mutationFn: () =>
      isLogin ? login(email, password) : signup(email, password, registrationCode),
  });

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Sähköpostin tulee olla oikeassa muodossa');
      return false;
    }
    setEmailError('');
    return true;
  };

  // Validate password match for signup
  const validatePasswords = (): boolean => {
    if (!isLogin && password !== confirmPassword) {
      setPasswordError('Salasanat eivät täsmää');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setEmailError('');
    setPasswordError('');

    // Validate email
    if (!validateEmail(email)) {
      return;
    }

    // Validate password match for signup
    if (!isLogin && !validatePasswords()) {
      return;
    }

    try {
      await submitMutation.mutateAsync();

      toast({
        title: isLogin ? 'Kirjautunut sisään' : 'Rekisteröity onnistuneesti',
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || (isLogin ? 'Väärä sähköposti tai salasana' : 'Rekisteröinti epäonnistui'),
        variant: 'destructive',
      });
    }
  };

  const submitLabel = submitMutation.isPending
    ? (isLogin ? 'Kirjaudutaan...' : 'Rekisteröidään...')
    : (isLogin ? 'Kirjaudu' : 'Rekisteröidy');

  // Reset form when switching between login and signup
  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRegistrationCode('');
    setEmailError('');
    setPasswordError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNav />

      <div className="grid flex-1 shell:grid-cols-2">
        {/*
          One element, two shapes, rather than two elements swapping under `hidden`.

          Below `shell` (940px, src/lib/breakpoints.ts) the Owner's call was that the lede survives
          and the rest does not: a phone gets the sentence as muted text above the form, so US-2 is
          served at both widths, and it costs three lines instead of a full-height panel the form
          would sit below. The prototype hides the aside outright at this width, which left AC8's
          copy unreadable on a phone (`prototype/index.html:457`).

          Keeping ONE node for the lede is deliberate: rendering it twice behind `hidden shell:block`
          and `shell:hidden` would put the same string in the DOM twice, which is the duplicate-text
          trap slice 3 hit in `e2e/auth.spec.ts`. Here the element never moves; only its skin does.

          `bg-auth-aside` is the gradient, defined in tailwind.config.ts from two tokens so that
          tokens-contrast.test.ts can gate it. Text is `--primary-foreground` at full opacity — the
          prototype's opacity:.85 on the small print measured 2.86:1 and is gone.
        */}
        <aside
          className="
            px-4 pb-2 pt-6 text-muted-foreground
            shell:flex shell:flex-col shell:justify-center shell:gap-10
            shell:bg-auth-aside shell:px-12 shell:py-16 shell:text-primary-foreground
          "
        >
          {/*
            A <p>, not a heading, and that is not laziness. The document's one <h1> is the form's
            "Kirjaudu sisään" — what a screen-reader user navigating by heading wants on a login
            page. The aside precedes it in DOM order, so a heading here would be an h2 above the
            h1. Display type is what this is; display type is what it is marked as.
          */}
          <p className="hidden shell:block shell:max-w-[15ch] shell:text-4xl shell:font-bold shell:leading-tight">
            Läsnäolojen kirjaus kursseille.
          </p>

          <p className="shell:max-w-[42ch] shell:text-lg shell:leading-relaxed">{LEDE}</p>

          <ul className="hidden shell:flex shell:flex-col shell:gap-5">
            {FUNCTIONS.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-foreground/20"
                >
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  {/*
                    Two lines, one list item. Slice 3's finding: accessible names concatenate with
                    no separator, so "Suoritusmerkinnät" + "Kurssisuoritus…" would announce as one
                    run-together word. A block <b> and a block <span> put a line box between them,
                    which is what the name computation reads as a space.
                  */}
                  <b className="block font-semibold">{title}</b>
                  <span className="block text-sm shell:text-primary-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="grid place-items-center px-4 py-8 shell:py-12">
          <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold leading-none tracking-tight">
                {isLogin ? 'Kirjaudu sisään' : 'Rekisteröidy'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLogin ? 'Syötä kirjautumistietosi' : 'Luo uusi käyttäjätili'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Sähköposti</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Salasana</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Piilota salasana" : "Näytä salasana"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Vahvista salasana</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPassword ? "Piilota salasana" : "Näytä salasana"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registrationCode">Rekisteröintikoodi</Label>
                  <Input
                    id="registrationCode"
                    type="text"
                    autoComplete="off"
                    value={registrationCode}
                    onChange={(e) => setRegistrationCode(e.target.value)}
                    placeholder="Syötä 16-merkkinen koodi"
                    aria-describedby="registrationCodeHint"
                    required
                  />
                  {/*
                    The prototype's hint here read "Saat koodin koulusi pääkäyttäjältä." — a role
                    ADR-0003 deleted. There is no pääkäyttäjä: codes are issued from the command
                    line by whoever has database access, which is why the admin endpoints are gone.
                    Replaced with three facts a teacher can act on, each from the code rather than
                    from the prototype: single-use and 24 hours are INV-6
                    (`registration_code_service.py:18`), one address is INV-7 (`:142`) and is the
                    refusal she is most likely to hit by typing a different address.
                  */}
                  <p id="registrationCodeHint" className="text-sm text-muted-foreground">
                    Kertakäyttöinen, voimassa 24 tuntia ja sidottu yhteen sähköpostiosoitteeseen.
                  </p>
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
              {submitLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleToggleMode}
            >
              {isLogin ? 'Ei tiliä? Rekisteröidy' : 'Takaisin kirjautumiseen'}
            </Button>
          </form>
        </main>
      </div>
    </div>
  );
};

export default Auth;
