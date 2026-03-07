"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, AreaChart, Area,
  ComposedChart,
} from "recharts";

const COLORS = {
  ce: "#3b82f6",
  pe: "#ef4444",
  spot: "#22c55e",
  straddle: "#f59e0b",
  neutral: "#71717a",
};

const axisStyle = { fontSize: 9, fill: "#71717a" };
const tooltipStyle = {
  contentStyle: {
    background: "#0c0c0e",
    border: "1px solid #27272a",
    borderRadius: 8,
    fontSize: 11,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#a1a1aa" },
};

export function OIByStrikeChart({ data, height = 300 }: { data: { strikes: number[]; oi_CE: number[]; oi_PE: number[] }, height?: number | string }) {
  const chartData = data.strikes.map((s, i) => ({
    strike: s,
    "Call OI": data.oi_CE[i],
    "Put OI": data.oi_PE[i],
  }));

  const formatYAxis = (tickItem: number) => {
    if (Math.abs(tickItem) >= 1000000) return (tickItem / 1000000).toFixed(1) + 'M';
    if (Math.abs(tickItem) >= 1000) return (tickItem / 1000).toFixed(1) + 'k';
    return tickItem.toString();
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="strike" tick={axisStyle} tickLine={false} />
        <YAxis tick={axisStyle} tickLine={false} tickFormatter={formatYAxis} />
        <Tooltip {...tooltipStyle} />
        <Bar isAnimationActive={false} dataKey="Call OI" fill={COLORS.ce} opacity={0.85} radius={[2, 2, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="Put OI" fill={COLORS.pe} opacity={0.85} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeByStrikeChart({ data, height = 300 }: { data: { strikes: number[]; volume_CE: number[]; volume_PE: number[] }, height?: number | string }) {
  const chartData = data.strikes.map((s, i) => ({
    strike: s,
    "Call Vol": data.volume_CE[i],
    "Put Vol": data.volume_PE[i],
  }));

  const formatYAxis = (tickItem: number) => {
    if (Math.abs(tickItem) >= 1000000) return (tickItem / 1000000).toFixed(1) + 'M';
    if (Math.abs(tickItem) >= 1000) return (tickItem / 1000).toFixed(1) + 'k';
    return tickItem.toString();
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="strike" tick={axisStyle} tickLine={false} />
        <YAxis tick={axisStyle} tickLine={false} tickFormatter={formatYAxis} />
        <Tooltip {...tooltipStyle} />
        <Bar isAnimationActive={false} dataKey="Call Vol" fill={COLORS.ce} opacity={0.85} radius={[2, 2, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="Put Vol" fill={COLORS.pe} opacity={0.85} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PCRChart({ data, height = 300 }: { data: { datetime: string[]; pcr_oi: number[]; pcr_volume: number[] }, height?: number | string }) {
  const chartData = data.datetime.map((d, i) => ({
    time: d.slice(5),
    "PCR (OI)": data.pcr_oi[i],
    "PCR (Volume)": data.pcr_volume[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Line isAnimationActive={false} type="monotone" dataKey="PCR (OI)" stroke={COLORS.ce} dot={false} strokeWidth={1.5} />
        <Line isAnimationActive={false} type="monotone" dataKey="PCR (Volume)" stroke={COLORS.pe} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SpotChart({ data, height = 300 }: { data: { datetime: string[]; spot_close: number[]; atm: number[] }, height?: number | string }) {
  const chartData = data.datetime.map((d, i) => ({
    time: d.slice(5),
    Spot: data.spot_close[i],
    ATM: data.atm[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={["auto", "auto"]} tick={axisStyle} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Line isAnimationActive={false} type="monotone" dataKey="Spot" stroke={COLORS.spot} dot={false} strokeWidth={1.5} />
        <Line isAnimationActive={false} type="monotone" dataKey="ATM" stroke={COLORS.neutral} dot={false} strokeWidth={1} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StraddleChart({ data, height = 300 }: { data: { datetime: string[]; straddle: number[]; spot_close: number[] }, height?: number | string }) {
  const chartData = data.datetime.map((d, i) => ({
    time: d.slice(5),
    Straddle: data.straddle[i],
    Spot: data.spot_close[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tick={axisStyle} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} />
        <Area isAnimationActive={false} yAxisId="left" type="monotone" dataKey="Straddle" fill={COLORS.straddle} stroke={COLORS.straddle} fillOpacity={0.15} />
        <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="Spot" stroke={COLORS.spot} dot={false} strokeWidth={1.5} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function OIChangeChart({ data, height = 300 }: { data: { datetime: string[]; oi_CE_change: number[]; oi_PE_change: number[] }, height?: number | string }) {
  const chartData = data.datetime.map((d, i) => ({
    time: d.slice(5),
    "CE OI Change": data.oi_CE_change[i],
    "PE OI Change": data.oi_PE_change[i],
  }));

  const formatYAxis = (tickItem: number) => {
    if (Math.abs(tickItem) >= 1000000) return (tickItem / 1000000).toFixed(1) + 'M';
    if (Math.abs(tickItem) >= 1000) return (tickItem / 1000).toFixed(1) + 'k';
    return tickItem.toString();
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="time" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} tickLine={false} tickFormatter={formatYAxis} />
        <Tooltip {...tooltipStyle} />
        <Area isAnimationActive={false} type="monotone" dataKey="CE OI Change" stroke={COLORS.ce} fill={COLORS.ce} fillOpacity={0.2} strokeWidth={1.5} dot={false} />
        <Area isAnimationActive={false} type="monotone" dataKey="PE OI Change" stroke={COLORS.pe} fill={COLORS.pe} fillOpacity={0.2} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Generic chart for AI-generated data
export function DynamicChart({
  data,
  type = "bar",
  xKey,
  yKeys,
  title,
}: {
  data: Record<string, unknown>[];
  type?: "bar" | "line" | "area";
  xKey: string;
  yKeys: string[];
  title?: string;
}) {
  const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4"];

  const ChartComponent = type === "line" ? LineChart : type === "area" ? AreaChart : BarChart;

  return (
    <div>
      {title && <p className="text-sm font-medium text-[var(--muted)] mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          {yKeys.map((key, i) =>
            type === "line" ? (
              <Line isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} dot={false} strokeWidth={1.5} />
            ) : type === "area" ? (
              <Area isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} />
            ) : (
              <Bar isAnimationActive={false} key={key} dataKey={key} fill={colors[i % colors.length]} opacity={0.85} radius={[2, 2, 0, 0]} />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
