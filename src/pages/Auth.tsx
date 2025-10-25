import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import PublicNav from '@/components/PublicNav';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const success = isLogin 
      ? await login(email, password)
      : await signup(email, password, isTeacher);
    
    if (success) {
      toast({
        title: isLogin ? 'Kirjautunut sisään' : 'Rekisteröity onnistuneesti',
      });
      navigate(isTeacher ? '/teacher' : '/');
    } else {
      toast({
        title: 'Virhe',
        description: isLogin ? 'Väärä sähköposti tai salasana' : 'Sähköposti on jo käytössä',
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
            {!isLogin && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="teacher"
                  checked={isTeacher}
                  onCheckedChange={(checked) => setIsTeacher(checked as boolean)}
                />
                <Label htmlFor="teacher" className="font-normal">
                  Olen opettaja
                </Label>
              </div>
            )}
            <Button type="submit" className="w-full">
              {isLogin ? 'Kirjaudu' : 'Rekisteröidy'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Ei tiliä? Rekisteröidy' : 'On jo tili? Kirjaudu'}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Auth;
