import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { logClassAttendance } from '@/lib/classes';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';

interface AttendanceTrackingProps {
  classId: string;
}

const AttendanceTracking = ({ classId }: AttendanceTrackingProps) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Virhe',
        description: 'Etunimi ja sukunimi ovat pakollisia',
        variant: 'destructive',
      });
      return;
    }

    const record = logClassAttendance(classId, firstName, lastName);

    toast({
      title: 'Läsnäolo kirjattu',
      description: `${firstName} ${lastName} - ${format(new Date(record.timestamp), 'PPP p', { locale: fi })}`,
    });

    setFirstName('');
    setLastName('');
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Etunimi</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Esim. Matti"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sukunimi</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Esim. Meikäläinen"
                autoComplete="off"
              />
            </div>
          </div>

          <Button type="submit" className="w-full md:w-auto">
            <UserPlus className="w-4 h-4 mr-2" />
            Kirjaa läsnäolo
          </Button>
        </form>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Ohje:</strong> Syötä opiskelijan etu- ja sukunimi ja paina "Kirjaa läsnäolo" -painiketta.
            Läsnäolo kirjataan nykyisellä aikaleimalla. Voit tarkastella kaikkia kirjauksia "Opiskelijan lokit" -välilehdeltä.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceTracking;
