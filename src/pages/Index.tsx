import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCheck, Users } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Läsnäolojen kirjaus</h1>
          <p className="text-lg text-muted-foreground">
            Valitse alla olevista vaihtoehdoista
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <Link to="/attendance">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <UserCheck className="w-12 h-12 text-primary mb-4" />
                <CardTitle>Kirjaa läsnäolo</CardTitle>
                <CardDescription>
                  Opiskelijat voivat kirjata läsnäolonsa tästä
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Avaa kirjausnäkymä</Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/auth">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <Users className="w-12 h-12 text-primary mb-4" />
                <CardTitle>Opettajan näkymä</CardTitle>
                <CardDescription>
                  Kirjaudu sisään nähdäksesi läsnäolot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">Kirjaudu sisään</Button>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Index;
