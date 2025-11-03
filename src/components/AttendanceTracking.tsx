import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateAttendance } from '@/hooks/useAttendance';
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
  const createAttendanceMutation = useCreateAttendance();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Virhe',
        description: 'Etunimi ja sukunimi ovat pakollisia',
        variant: 'destructive',
      });
      return;
    }

    try {
      const record = await createAttendanceMutation.mutateAsync({
        classId,
        data: {
          student_first_name: firstName.trim(),
          student_last_name: lastName.trim(),
        },
      });

      const attendanceText = record.total_attendance
        ? `Yhteensä ${record.total_attendance} läsnäoloa`
        : '';

      toast({
        title: 'Läsnäolo kirjattu',
        description: `${firstName} ${lastName}${attendanceText ? ` - ${attendanceText}` : ''}`,
      });

      setFirstName('');
      setLastName('');
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

          <Button type="submit" className="w-full md:w-auto" disabled={createAttendanceMutation.isPending}>
            <UserPlus className="w-4 h-4 mr-2" />
            {createAttendanceMutation.isPending ? 'Kirjataan...' : 'Kirjaa läsnäolo'}
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
