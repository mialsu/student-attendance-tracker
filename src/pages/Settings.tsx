import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, LogOut, Mail, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { user, logout, updateEmail, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!user || !user.isTeacher) {
    navigate('/auth');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

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

    const success = await updateEmail(newEmail, emailPassword);

    if (success) {
      toast({
        title: 'Sähköposti päivitetty',
        description: 'Sähköpostiosoitteesi on päivitetty onnistuneesti',
      });
      setEmailPassword('');
    } else {
      toast({
        title: 'Virhe',
        description: 'Sähköpostin päivitys epäonnistui. Tarkista salasanasi tai sähköposti on jo käytössä.',
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

    const success = await updatePassword(currentPassword, newPassword);

    if (success) {
      toast({
        title: 'Salasana päivitetty',
        description: 'Salasanasi on päivitetty onnistuneesti',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast({
        title: 'Virhe',
        description: 'Salasanan päivitys epäonnistui. Tarkista nykyinen salasanasi.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Asetukset</h1>
              <p className="text-muted-foreground mt-1">Hallinnoi tiliäsi</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Kirjaudu ulos
          </Button>
        </div>

        <Tabs defaultValue="email" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email" className="gap-2">
              <Mail className="w-4 h-4" />
              Sähköposti
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-2">
              <Lock className="w-4 h-4" />
              Salasana
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Vaihda sähköpostiosoite</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Päivitä kirjautumiseen käytettävä sähköpostiosoite
              </p>
            </div>

            <form onSubmit={handleEmailChange} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="newEmail" className="text-sm font-medium">
                    Uusi sähköposti
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="uusi@esimerkki.fi"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="emailPassword" className="text-sm font-medium">
                  Vahvista salasanallasi
                </Label>
                <Input
                  id="emailPassword"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Syötä nykyinen salasanasi"
                />
                <p className="text-xs text-muted-foreground">
                  Tarvitsemme salasanasi varmistaaksemme, että olet sinä
                </p>
              </div>

              <Button type="submit" size="lg">
                Tallenna sähköposti
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="password" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Vaihda salasana</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Päivitä tilisi salasana. Salasanan tulee olla vähintään 8 merkkiä pitkä.
              </p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPasswordChange" className="text-sm font-medium">
                    Nykyinen salasana
                  </Label>
                  <Input
                    id="currentPasswordChange"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Syötä nykyinen salasanasi"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">
                    Uusi salasana
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Syötä uusi salasana"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Vahvista uusi salasana
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Vahvista uusi salasana"
                  />
                  <p className="text-xs text-muted-foreground">
                    Salasanan tulee olla vähintään 8 merkkiä pitkä
                  </p>
                </div>
              </div>

              <Button type="submit" size="lg">
                Tallenna salasana
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
