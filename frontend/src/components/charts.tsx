"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area,
  ComposedChart,
} from "recharts";

const COLORS = {
  ce: "#3b82f6",
  pe: "#ef4444",
  spot: "#22c55e",
  straddle: "#f59e0b",
  neutral: "#888",
};

const axisStyle = { fontSize: 11, fill: "#888" };
const tooltipStyle = {
  contentStyle: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#aaa" },
};

export function OIByStrikeChart({ data, height = 300 }: { data: { strikes: number[]; oi_CE: number[]; oi_PE: number[] }, height?: number | string }) {
  const chartData = data.strikes.map((s, i) => ({
    strike: s,
    "Call OI": data.oi_CE[i],
    "Put OI": data.oi_PE[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="strike" tick={axisStyle} />
        <YAxis tick={axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="Call OI" fill={COLORS.ce} opacity={0.8} />
        <Bar isAnimationActive={false} dataKey="Put OI" fill={COLORS.pe} opacity={0.8} />
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="strike" tick={axisStyle} />
        <YAxis tick={axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="Call Vol" fill={COLORS.ce} opacity={0.8} />
        <Bar isAnimationActive={false} dataKey="Put Vol" fill={COLORS.pe} opacity={0.8} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} type="monotone" dataKey="PCR (OI)" stroke={COLORS.ce} dot={false} strokeWidth={2} />
        <Line isAnimationActive={false} type="monotone" dataKey="PCR (Volume)" stroke={COLORS.pe} dot={false} strokeWidth={2} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
        <YAxis domain={["auto", "auto"]} tick={axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} type="monotone" dataKey="Spot" stroke={COLORS.spot} dot={false} strokeWidth={2} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tick={axisStyle} />
        <YAxis yAxisId="right" orientation="right" tick={axisStyle} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area isAnimationActive={false} yAxisId="left" type="monotone" dataKey="Straddle" fill={COLORS.straddle} stroke={COLORS.straddle} fillOpacity={0.2} />
        <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="Spot" stroke={COLORS.spot} dot={false} strokeWidth={2} />
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="CE OI Change" fill={COLORS.ce} opacity={0.7} />
        <Bar isAnimationActive={false} dataKey="PE OI Change" fill={COLORS.pe} opacity={0.7} />
      </BarChart>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis dataKey={xKey} tick={axisStyle} interval="preserveStartEnd" />
          <YAxis tick={axisStyle} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {yKeys.map((key, i) =>
            type === "line" ? (
              <Line isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} />
            ) : type === "area" ? (
              <Area isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} />
            ) : (
              <Bar isAnimationActive={false} key={key} dataKey={key} fill={colors[i % colors.length]} opacity={0.8} />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
