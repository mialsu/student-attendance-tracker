import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import PublicNav from '@/components/PublicNav';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password);
      }

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

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <div className="flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isLogin ? 'Kirjaudu sisään' : 'Rekisteröidy'}</CardTitle>
          <CardDescription>
            {isLogin ? 'Syötä kirjautumistietosi' : 'Luo uusi käyttäjätili'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Sähköposti</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Salasana</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              {isLogin ? 'Kirjaudu' : 'Rekisteröidy'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Ei tiliä? Rekisteröidy' : 'Takaisin kirjautumiseen'}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Auth;
