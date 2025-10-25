import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logAttendance, getStudentAttendanceCount } from '@/lib/attendance';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle } from 'lucide-react';

const StudentAttendance = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Virhe',
        description: 'Syötä etu- ja sukunimi',
        variant: 'destructive',
      });
      return;
    }

    logAttendance(firstName, lastName);
    const count = getStudentAttendanceCount(firstName, lastName);
    setAttendanceCount(count);
    
    toast({
      title: 'Läsnäolo kirjattu!',
      description: `${firstName} ${lastName}`,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Kirjaa läsnäolo</CardTitle>
          <CardDescription>
            Syötä etu- ja sukunimesi kirjataksesi läsnäolosi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Etunimi</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Matti"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sukunimi</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Meikäläinen"
                required
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit(e);
                  }
                }}
              />
            </div>
            <Button type="submit" className="w-full">
              Kirjaa läsnäolo
            </Button>
          </form>

          {attendanceCount !== null && (
            <div className="mt-6 p-4 bg-secondary rounded-lg text-center space-y-2">
              <CheckCircle className="w-12 h-12 text-primary mx-auto" />
              <p className="text-lg font-semibold">
                Läsnäolo kirjattu onnistuneesti!
              </p>
              <p className="text-muted-foreground">
                Sinulla on nyt yhteensä <span className="font-bold text-foreground">{attendanceCount}</span> läsnäoloa
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentAttendance;
