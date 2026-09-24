"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PieChart as PieChartIcon } from "lucide-react";

const INDIGO = "#4f46e5";

const STATUS_COLORS: Record<string, string> = {
  Completed: "#059669",
  "In Progress": "#4f46e5",
  "Not Started": "#94a3b8",
  Disqualified: "#e11d48",
};

interface TooltipEntry {
  name?: string;
  value?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-popover-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-popover-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function AverageScoreByAssessmentChart({ data }: { data: { name: string; avgScore: number }[] }) {
  if (data.length === 0) return <EmptyState icon={PieChartIcon} title="No completed attempts yet" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
        <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="avgScore" name="Avg score" fill={INDIGO} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <EmptyState icon={PieChartIcon} title="No attempts yet" />;
  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#94a3b8"} stroke="var(--card)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[d.name] ?? "#94a3b8" }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium text-foreground">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HardestQuestionsChart({ data }: { data: { name: string; correctRate: number }[] }) {
  if (data.length === 0) return <EmptyState icon={PieChartIcon} title="Not enough answers yet" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={220}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="correctRate" name="Correct rate" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
