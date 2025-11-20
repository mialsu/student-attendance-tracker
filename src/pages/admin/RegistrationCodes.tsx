import { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRegistrationCodes, useCreateRegistrationCode, useRevokeRegistrationCode } from '@/hooks/useRegistrationCodes';
import { Plus, Copy, XCircle, Loader2, CheckCircle, Clock, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const RegistrationCodes = () => {
  const { toast } = useToast();
  const { data: codes, isLoading } = useRegistrationCodes();
  const createCodeMutation = useCreateRegistrationCode();
  const revokeCodeMutation = useRevokeRegistrationCode();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [emailRestriction, setEmailRestriction] = useState('');

  const handleCreateCode = async () => {
    if (!emailRestriction.trim()) {
      toast({
        title: 'Virhe',
        description: 'Sähköpostiosoite on pakollinen',
        variant: 'destructive',
      });
      return;
    }

    try {
      const newCode = await createCodeMutation.mutateAsync({
        email_restriction: emailRestriction.trim(),
      });

      toast({
        title: 'Koodi luotu',
        description: `Uusi rekisteröintikoodi luotu onnistuneesti`,
      });

      setEmailRestriction('');
      setIsCreateDialogOpen(false);

      // Copy code to clipboard
      await navigator.clipboard.writeText(newCode.code);
      toast({
        title: 'Kopioitu leikepöydälle',
        description: 'Rekisteröintikoodi on kopioitu leikepöydälle',
      });
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Koodin luominen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: 'Kopioitu',
        description: 'Koodi kopioitu leikepöydälle',
      });
    } catch {
      toast({
        title: 'Virhe',
        description: 'Kopiointi epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän koodin? Käytettyjä koodeja ei voi poistaa.')) {
      return;
    }

    try {
      await revokeCodeMutation.mutateAsync(codeId);
      toast({
        title: 'Koodi poistettu',
        description: 'Rekisteröintikoodi on poistettu onnistuneesti',
      });
    } catch (error: any) {
      toast({
        title: 'Virhe',
        description: error.response?.data?.detail || 'Koodin poistaminen epäonnistui',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (code: { used: boolean }) => {
    if (code.used) {
      return (
        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Käytetty</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <Clock className="h-4 w-4" />
        <span className="text-sm font-medium">Käytettävissä</span>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Rekisteröintikoodit
            </h2>
            <p className="text-muted-foreground mt-1">
              Hallitse opettajien rekisteröintikoodeja
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700">
                <Plus className="mr-2 h-4 w-4" />
                Luo uusi koodi
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Luo uusi rekisteröintikoodi</DialogTitle>
                <DialogDescription>
                  Luo uusi koodi opettajan rekisteröitymistä varten. Koodi on sidottu yhteen sähköpostiosoitteeseen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Sähköpostiosoite <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="esim. opettaja@koulu.fi"
                    value={emailRestriction}
                    onChange={(e) => setEmailRestriction(e.target.value)}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Koodi toimii vain tälle sähköpostiosoitteelle.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEmailRestriction('');
                  }}
                >
                  Peruuta
                </Button>
                <Button
                  onClick={handleCreateCode}
                  disabled={createCodeMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {createCodeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Luodaan...
                    </>
                  ) : (
                    'Luo koodi'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-red-100 dark:border-red-900/20">
          <CardHeader>
            <CardTitle>Kaikki koodit</CardTitle>
            <CardDescription>
              {codes?.length || 0} rekisteröintikoodia yhteensä
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
              </div>
            ) : codes && codes.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Koodi</TableHead>
                      <TableHead>Tila</TableHead>
                      <TableHead>Sähköpostiosoite</TableHead>
                      <TableHead>Luotu</TableHead>
                      <TableHead>Käytetty</TableHead>
                      <TableHead className="text-right">Toiminnot</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono text-sm">
                          {code.code}
                        </TableCell>
                        <TableCell>{getStatusBadge(code)}</TableCell>
                        <TableCell>
                          {code.email_restriction}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(code.created_at), 'dd.MM.yyyy HH:mm', {
                            locale: fi,
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {code.used_at
                            ? format(new Date(code.used_at), 'dd.MM.yyyy HH:mm', {
                                locale: fi,
                              })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyCode(code.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {!code.used && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteCode(code.id)}
                                disabled={revokeCodeMutation.isPending}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                                title="Poista koodi"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Ei rekisteröintikoodeja. Luo ensimmäinen koodi yllä olevasta napista.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default RegistrationCodes;
