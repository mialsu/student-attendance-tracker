import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAttendanceStatistics } from '@/hooks/useAttendance';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

interface ClassStatisticsProps {
  classId: string;
}

const chartConfig = {
  count: {
    label: 'Läsnäolot',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

const ClassStatistics = ({ classId }: ClassStatisticsProps) => {
  // TODO: Make this configurable via UI settings
  // For now, exclude the bulk log from 2026-02-27
  const excludeDates = ['2026-02-27'];

  const { data: stats, isLoading } = useAttendanceStatistics(classId, excludeDates);

  // Format daily data for chart
  const dailyData = useMemo(() => {
    if (!stats?.daily_stats) return [];
    return stats.daily_stats.map(item => ({
      date: item.date,
      displayDate: format(new Date(item.date), 'P', { locale: fi }),
      count: item.count,
    }));
  }, [stats]);

  // Format monthly data for chart
  const monthlyData = useMemo(() => {
    if (!stats?.monthly_stats) return [];
    return stats.monthly_stats.map(item => ({
      month: item.year_month,
      displayMonth: format(new Date(item.year_month + '-01'), 'LLLL yyyy', { locale: fi }),
      count: item.count,
    }));
  }, [stats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Ladataan tilastoja...</p>
      </div>
    );
  }

  if (!stats || stats.total_records === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tilastot</CardTitle>
          <CardDescription>Ei läsnäoloja näytettäväksi</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Kirjaa opiskelijoiden läsnäoloja nähdäksesi tilastot.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Yhteensä läsnäoloja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_records}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opiskelijoita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_students}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ensimmäinen läsnäolo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.first_date
                ? format(new Date(stats.first_date), 'P', { locale: fi })
                : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Viimeisin läsnäolo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.last_date
                ? format(new Date(stats.last_date), 'P', { locale: fi })
                : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Table */}
      <Card>
        <CardHeader>
          <CardTitle>Läsnäolot päivittäin</CardTitle>
          <CardDescription>
            Kaikki päivät, joilta läsnäoloja on kirjattu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Päivämäärä</TableHead>
                  <TableHead className="text-right">Läsnäolot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyData.map((item) => (
                  <TableRow key={item.date}>
                    <TableCell className="font-medium">{item.displayDate}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Daily Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Läsnäolot päivittäin (kaavio)</CardTitle>
          <CardDescription>
            Visuaalinen esitys läsnäoloista päivittäin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="displayDate"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Monthly Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Läsnäolot kuukausittain (kaavio)</CardTitle>
          <CardDescription>
            Visuaalinen esitys läsnäoloista kuukausittain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="displayMonth"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClassStatistics;
