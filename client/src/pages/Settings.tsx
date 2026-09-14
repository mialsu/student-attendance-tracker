import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TeacherLayout } from '@/components/layouts/TeacherLayout';

const Settings = () => {
  const { user, updateEmail, updatePassword } = useAuth();
  const { toast } = useToast();

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (user) {
      setNewEmail(user.email);
    }
  }, [user]);

  /*
    The in-flight state `DESIGN.md:149` asks for, and the reason both forms carry one: before
    slice 7 neither submit disabled, so three clicks on *Tallenna sähköposti* sent three
    `PUT /api/auth/email` — measured in the browser at both viewports, not inferred.

    `useMutation` rather than a `useState` boolean because `isPending` is the vocabulary the other
    six mutations in this app already use (`AttendanceTracking.tsx:389`,
    `TeacherDashboard.tsx:211`, four in `StudentLogs.tsx`). Nothing is invalidated here — the auth
    context owns the user — so each mutation carries the pending flag and nothing else.
  */
  const emailMutation = useMutation({
    mutationFn: () => updateEmail(newEmail, emailPassword),
  });

  const passwordMutation = useMutation({
    mutationFn: () => updatePassword(currentPassword, newPassword),
  });

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmail.trim()) {
      toast({
        title: 'Virhe',
        description: 'Sähköposti ei voi olla tyhjä',
        variant: 'destructive',
      });
      return;
    }

    if (!emailPassword) {
      toast({
        title: 'Virhe',
        description: 'Syötä nykyinen salasana vahvistaaksesi muutoksen',
        variant: 'destructive',
      });
      return;
    }

    try {
      await emailMutation.mutateAsync();
      toast({
        title: 'Sähköposti päivitetty',
        description: 'Sähköpostiosoitteesi on päivitetty onnistuneesti',
      });
      setEmailPassword('');
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Sähköpostin päivitys epäonnistui. Tarkista salasanasi tai sähköposti on jo käytössä.',
        variant: 'destructive',
      });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Virhe',
        description: 'Täytä kaikki kentät',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Virhe',
        description: 'Uudet salasanat eivät täsmää',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Virhe',
        description: 'Salasanan tulee olla vähintään 8 merkkiä pitkä',
        variant: 'destructive',
      });
      return;
    }

    try {
      await passwordMutation.mutateAsync();
      toast({
        title: 'Salasana päivitetty',
        description: 'Salasanasi on päivitetty onnistuneesti',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Salasanan päivitys epäonnistui. Tarkista nykyinen salasanasi.',
        variant: 'destructive',
      });
    }
  };

  return (
    <TeacherLayout breadcrumbs={[
      { label: 'Kurssit', href: '/dashboard' },
      { label: 'Asetukset' }
    ]}>
      {/* `text-3xl`, not the `text-4xl` this page shipped with: slice 5 set the page-title size
          and `ClassView.tsx:77` already records the reasoning. Settings was the last surface
          still a size larger than the other two. */}
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold text-heading">Asetukset</h1>
        <p className="text-muted-foreground">Hallitse tilisi tietoja ja turvallisuutta.</p>
      </div>

      {/* Two stacked cards, not the two tabs this page shipped with — the Owner's call on
          2026-09-11 against `prototype/index.html:735`. Two settings do not need a tab bar, and
          a tab hid half the surface behind a click. 620px is the prototype's own
          `.settings-grid` width; the tabbed version ran to `max-w-3xl`, wider than any field
          here needs. */}
      <div className="max-w-[620px] space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Mail aria-hidden="true" className="h-5 w-5 text-primary" />
              Sähköposti
            </CardTitle>
            <CardDescription>Vaihda kirjautumiseen käytettävä sähköposti.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailChange} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="currentEmail" className="text-sm font-medium">
                  Nykyinen sähköposti
                </Label>
                <Input
                  id="currentEmail"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="newEmail" className="text-sm font-medium">
                  Uusi sähköposti
                </Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="uusi@esimerkki.fi"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="emailPassword" className="text-sm font-medium">
                  Vahvista salasanallasi
                </Label>
                <Input
                  id="emailPassword"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Syötä nykyinen salasanasi"
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">
                  Tarvitsemme salasanasi varmistaaksemme, että olet sinä
                </p>
              </div>

              <Button type="submit" size="lg" disabled={emailMutation.isPending}>
                {emailMutation.isPending ? 'Tallennetaan...' : 'Tallenna sähköposti'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Lock aria-hidden="true" className="h-5 w-5 text-primary" />
              Salasana
            </CardTitle>
            {/* The prototype writes "Kaikki **muut** istunnot kirjautuvat ulos"
                (`prototype/index.html:747`) and the word is wrong: `auth_service.py:218` revokes
                every refresh token this teacher holds, this browser's included, so her own
                session ends too — within the 15 minutes her in-memory access token has left.
                INV-8, guarded by `test_update_password_revokes_every_existing_session`. */}
            <CardDescription>
              Vaihda salasana. Kaikki istunnot kirjautuvat ulos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="currentPasswordChange" className="text-sm font-medium">
                  Nykyinen salasana
                </Label>
                <Input
                  id="currentPasswordChange"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Syötä nykyinen salasanasi"
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="newPassword" className="text-sm font-medium">
                  Uusi salasana
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Syötä uusi salasana"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Vahvista uusi salasana
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Vahvista uusi salasana"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Salasanan tulee olla vähintään 8 merkkiä pitkä
                </p>
              </div>

              <Button type="submit" size="lg" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Tallennetaan...' : 'Tallenna salasana'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </TeacherLayout>
  );
};

export default Settings;
