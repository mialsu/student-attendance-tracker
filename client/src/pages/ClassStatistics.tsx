import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAttendanceStatistics } from '@/hooks/useAttendance';
import { format } from 'date-fns';
import { fi } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { QueryErrorState } from '@/components/QueryErrorState';

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

  // Which granularity the one chart is drawing. Days first: it is the view the table beside it
  // agrees with, and the one a teacher reads during a course rather than after it.
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');

  // `error` was dropped here, so a failed request rendered "Ei läsnäoloja näytettäväksi" to
  // someone with hundreds of records. DESIGN.md §3, spec 0006.
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useAttendanceStatistics(classId, excludeDates);

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

  // Before the empty check, always: `!stats` is true on failure too, and whichever branch runs
  // first owns the failure.
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tilastot</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState
            message="Tilastojen lataaminen epäonnistui"
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
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

  // The heading names the granularity, which is also how the tests tell the two apart: Recharts
  // draws nothing in jsdom, so the title is the only readable evidence of which dataset is in.
  const chart =
    granularity === 'day'
      ? {
          title: 'Läsnäolot päivittäin (kaavio)',
          description: 'Visuaalinen esitys läsnäoloista päivittäin',
          data: dailyData,
          dataKey: 'displayDate',
        }
      : {
          title: 'Läsnäolot kuukausittain (kaavio)',
          description: 'Visuaalinen esitys läsnäoloista kuukausittain',
          data: monthlyData,
          dataKey: 'displayMonth',
        };

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

      {/* One chart, two granularities (AC9 / US-22). This was two near-identical cards, one per
          granularity, with no toggle: "day/month bar chart" was served by showing both at once.
          The per-day TABLE above stays — a chart cannot be read to the day, and she reads it to
          the day (Owner, 2026-09-11). */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{chart.title}</CardTitle>
            <CardDescription>{chart.description}</CardDescription>
          </div>
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(next) => {
              // Radix clears the value when the active item is pressed again. A chart with no
              // granularity has nothing to draw, so an empty value keeps what is on screen.
              if (next === 'day' || next === 'month') setGranularity(next);
            }}
            variant="outline"
            size="sm"
            // Radix's root is `role="group"` while its single-select items are `role="radio"`,
            // so the group is what lets a screen reader announce "1 of 2" instead of two loose
            // radios. NOTHING GATES THIS: removing the line was measured on 2026-09-11 and the
            // whole walk, axe included, stayed green — axe-core no longer treats `radiogroup` as
            // a required context for `radio`. It is here on judgement, and that gap is in
            // REVIEW-DEBT.md rather than implied by this comment.
            role="radiogroup"
            aria-label="Kaavion jakso"
          >
            <ToggleGroupItem value="day">Päivät</ToggleGroupItem>
            <ToggleGroupItem value="month">Kuukaudet</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {/* max-w-full because ChartContainer carries `aspect-video`, and overriding only the
              height leaves 16:9 driving the WIDTH: 400px tall became ~711px wide whatever the
              viewport, so at 320px the page itself scrolled sideways — a WCAG 1.4.10 failure on
              A11Y-7, found by the Playwright sweep on 2026-09-07. The cap changes nothing at
              desktop widths, where 711px already fitted. */}
          <ChartContainer config={chartConfig} className="h-[400px] max-w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={chart.dataKey}
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
