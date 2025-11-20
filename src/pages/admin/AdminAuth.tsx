import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

const AdminAuth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setEmailError('');

    // Validate email
    if (!validateEmail(email)) {
      return;
    }

    try {
      await login(email, password);

      toast({
        title: 'Kirjautunut sisään',
        description: 'Tervetuloa hallintapaneeliin',
      });
      navigate('/admin/dashboard');
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Väärä sähköposti tai salasana',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-red-200 dark:border-red-800">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-full">
              <ShieldCheck className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-center text-red-600 dark:text-red-400">
            Hallintapaneeli
          </CardTitle>
          <CardDescription className="text-center">
            Kirjaudu sisään hallintapaneeliin
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
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
            >
              Kirjaudu sisään
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuth;
