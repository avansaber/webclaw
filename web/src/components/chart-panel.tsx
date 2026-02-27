"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  type PieLabelRenderProps,
} from "recharts";

// ── Theme Colors ─────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(47, 96%, 53%)",   // yellow
  "hsl(0, 84%, 60%)",    // red
  "hsl(262, 83%, 58%)",  // purple
  "hsl(24, 95%, 53%)",   // orange
  "hsl(199, 89%, 48%)",  // sky
  "hsl(330, 81%, 60%)",  // pink
];

// ── Types ────────────────────────────────────────────────────────────────────

export type ChartType = "bar" | "line" | "area" | "pie" | "donut";

export interface ChartConfig {
  type: ChartType;
  title: string;
  description?: string;
  data: Record<string, unknown>[];
  xKey?: string;        // key for x-axis
  yKeys?: string[];     // keys for y-axis values
  nameKey?: string;     // key for labels in pie
  valueKey?: string;    // key for values in pie
  stacked?: boolean;
  compact?: boolean;    // smaller card
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatAxisValue(value: unknown): string {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function formatTooltipValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

// ── Chart Wrapper ────────────────────────────────────────────────────────────

function ChartWrapper({ config, children }: { config: ChartConfig; children: React.ReactNode }) {
  return (
    <Card className={config.compact ? "" : ""}>
      <CardHeader className={config.compact ? "pb-2" : ""}>
        <CardTitle className={config.compact ? "text-sm" : "text-base"}>{config.title}</CardTitle>
        {config.description && <CardDescription className="text-xs">{config.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={config.compact ? 200 : 300}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Bar Chart ────────────────────────────────────────────────────────────────

function BarChartView({ config }: { config: ChartConfig }) {
  const xKey = config.xKey || Object.keys(config.data[0] || {})[0] || "name";
  const yKeys = config.yKeys || Object.keys(config.data[0] || {}).filter((k) => k !== xKey);

  return (
    <ChartWrapper config={config}>
      <BarChart data={config.data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <YAxis tickFormatter={formatAxisValue} tick={{ fontSize: 12 }} />
        <Tooltip formatter={formatTooltipValue} />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} stackId={config.stacked ? "stack" : undefined} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ChartWrapper>
  );
}

// ── Line Chart ───────────────────────────────────────────────────────────────

function LineChartView({ config }: { config: ChartConfig }) {
  const xKey = config.xKey || Object.keys(config.data[0] || {})[0] || "name";
  const yKeys = config.yKeys || Object.keys(config.data[0] || {}).filter((k) => k !== xKey);

  return (
    <ChartWrapper config={config}>
      <LineChart data={config.data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatAxisValue} tick={{ fontSize: 12 }} />
        <Tooltip formatter={formatTooltipValue} />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ChartWrapper>
  );
}

// ── Area Chart ───────────────────────────────────────────────────────────────

function AreaChartView({ config }: { config: ChartConfig }) {
  const xKey = config.xKey || Object.keys(config.data[0] || {})[0] || "name";
  const yKeys = config.yKeys || Object.keys(config.data[0] || {}).filter((k) => k !== xKey);

  return (
    <ChartWrapper config={config}>
      <AreaChart data={config.data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatAxisValue} tick={{ fontSize: 12 }} />
        <Tooltip formatter={formatTooltipValue} />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} stackId={config.stacked ? "stack" : undefined} />
        ))}
      </AreaChart>
    </ChartWrapper>
  );
}

// ── Pie / Donut Chart ────────────────────────────────────────────────────────

function PieChartView({ config }: { config: ChartConfig }) {
  const nameKey = config.nameKey || "name";
  const valueKey = config.valueKey || "value";
  const isDonut = config.type === "donut";

  return (
    <ChartWrapper config={config}>
      <PieChart>
        <Pie
          data={config.data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius={isDonut ? "55%" : 0}
          outerRadius="80%"
          label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${(((props.percent as number | undefined) ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {config.data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={formatTooltipValue} />
        <Legend />
      </PieChart>
    </ChartWrapper>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function ChartPanel({ config }: { config: ChartConfig }) {
  if (!config.data || config.data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{config.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  switch (config.type) {
    case "bar": return <BarChartView config={config} />;
    case "line": return <LineChartView config={config} />;
    case "area": return <AreaChartView config={config} />;
    case "pie":
    case "donut": return <PieChartView config={config} />;
    default: return <BarChartView config={config} />;
  }
}

// ── Metric Card ──────────────────────────────────────────────────────────────

export interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down" | "flat"; value: string };
  icon?: React.ReactNode;
}

export function MetricCard({ label, value, trend, icon }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
        {trend && (
          <p className={`text-xs ${trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-600" : "text-muted-foreground"}`}>
            {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}{trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
