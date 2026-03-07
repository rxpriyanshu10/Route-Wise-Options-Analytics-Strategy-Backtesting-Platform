"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

const COLORS = {
  ce: "#22c55e",
  pe: "#ef4444",
  muted: "var(--muted)",
  border: "var(--border)",
  fg: "var(--fg)",
};

export function GreeksSummary({ data }: { data: any }) {
  if (!data?.data?.length) return <div className="text-[var(--muted)] text-center py-4">No data</div>;

  const rows = data.data;
  // Find ATM or nearest-to-ATM strike
  const atm = rows.reduce((best: any, r: any) => {
    if (!best) return r;
    return Math.abs(r.strike - r.spot_close) < Math.abs(best.strike - best.spot_close) ? r : best;
  }, null);

  if (!atm) return null;

  const greeks = [
    { label: "Delta", ce: atm.delta_CE, pe: atm.delta_PE },
    { label: "Gamma", ce: atm.gamma_CE, pe: atm.gamma_PE },
    { label: "Theta", ce: atm.theta_CE, pe: atm.theta_PE },
    { label: "Vega", ce: atm.vega_CE, pe: atm.vega_PE },
    { label: "IV%", ce: atm.iv_CE, pe: atm.iv_PE },
  ];

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="flex items-center justify-between text-[var(--muted)] font-mono">
        <span>ATM {atm.strike}</span>
        <span>{atm.T_days?.toFixed(1)}d to exp</span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 font-mono">
        <span className="text-[var(--muted)]"></span>
        <span className="text-[#22c55e] text-right">CE</span>
        <span className="text-[#ef4444] text-right">PE</span>
        {greeks.map((g) => (
          <>
            <span key={g.label} className="text-[var(--muted)]">{g.label}</span>
            <span className="text-right">{g.ce != null ? (typeof g.ce === "number" ? g.ce.toFixed(4) : g.ce) : "—"}</span>
            <span className="text-right">{g.pe != null ? (typeof g.pe === "number" ? g.pe.toFixed(4) : g.pe) : "—"}</span>
          </>
        ))}
      </div>
    </div>
  );
}

export function IVSmileChart({ data, height = "100%" }: { data: any; height?: string | number }) {
  if (!data?.data?.length) return null;

  const chartData = data.data
    .filter((d: any) => d.iv_CE != null || d.iv_PE != null)
    .map((d: any) => ({
      strike: d.strike,
      iv_CE: d.iv_CE,
      iv_PE: d.iv_PE,
    }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="strike" tick={{ fontSize: 9, fill: COLORS.muted }} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: COLORS.muted }} tickLine={false} unit="%" />
        <Tooltip
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10 }}
        />
        <Line type="monotone" dataKey="iv_CE" stroke={COLORS.ce} dot={false} strokeWidth={1.5} name="IV CE" isAnimationActive={false} />
        <Line type="monotone" dataKey="iv_PE" stroke={COLORS.pe} dot={false} strokeWidth={1.5} name="IV PE" isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ParityList({ data }: { data: any }) {
  if (!data?.opportunities?.length) {
    return <div className="text-[var(--muted)] text-center py-4 text-[10px]">No arbitrage ({data?.threshold ?? 5}pt threshold)</div>;
  }

  const opps = data.opportunities.slice(0, 8);

  return (
    <div className="space-y-1 text-[10px] font-mono overflow-y-auto hidden-scrollbar">
      <div className="flex items-center justify-between text-[var(--muted)]">
        <span>{data.arbitrage_count} opportunities</span>
        <span>threshold: {data.threshold}pts</span>
      </div>
      {opps.map((o: any, i: number) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 px-1.5 py-1 rounded border border-[var(--border)] bg-[var(--bg)]"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                o.signal === "call_overpriced" ? "bg-[#ef4444]" : "bg-[#22c55e]"
              }`}
            />
            <span>{o.strike}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={o.mispricing > 0 ? "text-[#ef4444]" : "text-[#22c55e]"}>
              {o.mispricing > 0 ? "+" : ""}{o.mispricing}pts
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MispricingChart({ data, height = "100%" }: { data: any; height?: string | number }) {
  if (!data?.all?.length) return null;

  const chartData = data.all.map((d: any) => ({
    strike: d.strike,
    mispricing: d.mispricing,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="strike" tick={{ fontSize: 9, fill: COLORS.muted }} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: COLORS.muted }} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10 }}
        />
        <ReferenceLine y={0} stroke={COLORS.muted} strokeDasharray="3 3" />
        <Bar
          dataKey="mispricing"
          name="Mispricing"
          isAnimationActive={false}
          fill={COLORS.ce}
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
