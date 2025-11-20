import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegistrationCodes } from '@/hooks/useRegistrationCodes';
import { Ticket, CheckCircle, Clock, Loader2 } from 'lucide-react';

const AdminDashboard = () => {
  const { data: codes, isLoading } = useRegistrationCodes();

  const stats = {
    total: codes?.length || 0,
    available: codes?.filter((c) => !c.used).length || 0,
    used: codes?.filter((c) => c.used).length || 0,
  };

  const statCards = [
    {
      title: 'Yhteensä',
      value: stats.total,
      icon: Ticket,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/20',
    },
    {
      title: 'Käytettävissä',
      value: stats.available,
      icon: Clock,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/20',
    },
    {
      title: 'Käytetty',
      value: stats.used,
      icon: CheckCircle,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            Kojelauta
          </h2>
          <p className="text-muted-foreground mt-1">
            Yleiskatsaus rekisteröintikoodeihin
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.title} className="border-red-100 dark:border-red-900/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs font-medium">
                      {stat.title}
                    </CardDescription>
                    <div className={`p-2 rounded-full ${stat.bgColor}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${stat.color}`}>
                    {stat.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
