import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClasses, useCreateClass } from '@/hooks/useClasses';
import { LogOut, Plus, BookOpen, Settings, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const TeacherDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: classes, isLoading: classesLoading } = useClasses();
  const createClassMutation = useCreateClass();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [className, setClassName] = useState('');
  const [classDescription, setClassDescription] = useState('');

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

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

  const handleOpenClass = (classId: string) => {
    navigate(`/class/${classId}`);
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Opettajan näkymä</h1>
            <p className="text-muted-foreground mt-1">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSettings}>
              <Settings className="w-4 h-4 mr-2" />
              Asetukset
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Kirjaudu ulos
            </Button>
          </div>
        </div>

        <div className="mb-6">
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
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Kurssin nimi</Label>
                  <Input
                    id="className"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="Ohjelmointi 1"
                  />
                </div>
                <div className="space-y-2">
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
                <Button onClick={handleCreateClass}>Luo kurssi</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Kurssit</h2>
          {classesLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-muted-foreground">Ladataan kursseja...</p>
                </div>
              </CardContent>
            </Card>
          ) : !classes || classes.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  Ei kursseja vielä. Luo ensimmäinen kurssisi yllä olevasta painikkeesta.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((cls) => (
                <Card
                  key={cls.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleOpenClass(cls.id)}
                >
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <BookOpen className="w-6 h-6 text-primary mt-1" />
                      <div className="flex-1">
                        <CardTitle className="text-lg">{cls.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {cls.description || 'Ei kuvausta'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Luotu: {format(new Date(cls.created_at), 'PPP', { locale: fi })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
