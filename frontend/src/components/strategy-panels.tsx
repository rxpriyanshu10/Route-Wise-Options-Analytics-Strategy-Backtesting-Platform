"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";

const COLORS = {
  ce: "#22c55e",
  pe: "#ef4444",
  muted: "var(--muted)",
  border: "var(--border)",
  fg: "var(--fg)",
  blue: "#3b82f6",
  amber: "#f59e0b",
};

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#f59e0b",
};

type Leg = {
  type: string;
  strike: number;
  action: string;
  qty: number;
  premium: number;
  iv?: number | null;
  delta?: number | null;
  theta?: number | null;
  vega?: number | null;
  gamma?: number | null;
};

type Strategy = {
  id: string;
  name: string;
  sentiment: string;
  description: string;
  legs: Leg[];
  net_premium: number;
  max_profit: number;
  max_loss: number;
  breakevens: number[];
  risk_reward: number | null;
  net_greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  payoff: {
    spot_range: number[];
    pnl: number[];
  };
};

type BacktestResult = {
  entry_datetime: string;
  exit_datetime: string;
  num_snapshots: number;
  equity_curve: { datetime: string; spot: number; pnl: number }[];
  exit_legs: any[];
  metrics: {
    total_pnl: number;
    max_profit: number;
    max_loss: number;
    max_drawdown: number;
    win_rate: number;
    sharpe: number;
    profit_factor: number | null;
  };
  strategy: {
    id: string;
    name: string;
    sentiment: string;
    legs: Leg[];
    net_premium: number;
  };
  error?: string;
};

export function StrategyList({
  strategies,
  selected,
  onSelect,
}: {
  strategies: Strategy[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (!strategies.length) {
    return (
      <div className="text-(--muted) text-center py-4 text-[11px]">
        No strategies available
      </div>
    );
  }

  return (
    <div className="space-y-1.5 overflow-y-auto hidden-scrollbar">
      {strategies.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer ${
            selected === s.id
              ? "border-(--ring) bg-(--card-hover)"
              : "border-(--border) bg-(--bg) hover:border-(--ring)"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-mono font-semibold">{s.name}</span>
            <span
              className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
              style={{
                color: SENTIMENT_COLORS[s.sentiment],
                background: `${SENTIMENT_COLORS[s.sentiment]}15`,
              }}
            >
              {s.sentiment}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-(--muted)">
            <span>{s.legs.length} legs</span>
            <span
              className={
                s.net_premium >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
              }
            >
              {s.net_premium >= 0 ? "Credit" : "Debit"}{" "}
              {Math.abs(s.net_premium).toFixed(2)}
            </span>
            <span>R:R {s.risk_reward ?? "N/A"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function StrategyDetail({ strategy }: { strategy: Strategy }) {
  return (
    <div className="space-y-3 text-[11px]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-semibold text-sm">{strategy.name}</span>
          <span
            className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
            style={{
              color: SENTIMENT_COLORS[strategy.sentiment],
              background: `${SENTIMENT_COLORS[strategy.sentiment]}15`,
            }}
          >
            {strategy.sentiment}
          </span>
        </div>
        <p className="text-(--muted) text-[10px]">{strategy.description}</p>
      </div>

      {/* Legs table */}
      <div className="border border-(--border) rounded-md overflow-hidden">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="bg-(--card) text-(--muted)">
              <th className="px-2 py-1 text-left">Leg</th>
              <th className="px-2 py-1 text-right">Strike</th>
              <th className="px-2 py-1 text-right">Premium</th>
              <th className="px-2 py-1 text-right">IV%</th>
              <th className="px-2 py-1 text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {strategy.legs.map((leg, i) => (
              <tr key={i} className="border-t border-(--border)">
                <td className="px-2 py-1">
                  <span
                    className={
                      leg.action === "buy"
                        ? "text-[#22c55e]"
                        : "text-[#ef4444]"
                    }
                  >
                    {leg.action.toUpperCase()}
                  </span>{" "}
                  {leg.qty > 1 ? `${leg.qty}x ` : ""}
                  {leg.type}
                </td>
                <td className="px-2 py-1 text-right">{leg.strike}</td>
                <td className="px-2 py-1 text-right">{leg.premium}</td>
                <td className="px-2 py-1 text-right">
                  {leg.iv != null ? `${leg.iv}%` : "—"}
                </td>
                <td className="px-2 py-1 text-right">
                  {leg.delta != null ? leg.delta.toFixed(4) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {
            label: "Max Profit",
            value: strategy.max_profit.toFixed(2),
            color: "#22c55e",
          },
          {
            label: "Max Loss",
            value: strategy.max_loss.toFixed(2),
            color: "#ef4444",
          },
          {
            label: "Breakeven",
            value: strategy.breakevens.map((b) => b.toFixed(0)).join(", ") || "—",
            color: "var(--fg)",
          },
          {
            label: "Net Premium",
            value: strategy.net_premium.toFixed(2),
            color: strategy.net_premium >= 0 ? "#22c55e" : "#ef4444",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5"
          >
            <div className="text-[9px] text-(--muted) uppercase">{m.label}</div>
            <div className="font-mono text-[11px]" style={{ color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Net Greeks */}
      <div className="flex gap-3 text-[10px] font-mono text-(--muted)">
        <span>
          Delta:{" "}
          <span className="text-(--fg)">
            {strategy.net_greeks.delta.toFixed(4)}
          </span>
        </span>
        <span>
          Gamma:{" "}
          <span className="text-(--fg)">
            {strategy.net_greeks.gamma.toFixed(6)}
          </span>
        </span>
        <span>
          Theta:{" "}
          <span className="text-(--fg)">
            {strategy.net_greeks.theta.toFixed(4)}
          </span>
        </span>
        <span>
          Vega:{" "}
          <span className="text-(--fg)">
            {strategy.net_greeks.vega.toFixed(4)}
          </span>
        </span>
      </div>
    </div>
  );
}

export function PayoffChart({
  payoff,
  height = "100%",
}: {
  payoff: { spot_range: number[]; pnl: number[] };
  height?: string | number;
}) {
  const data = payoff.spot_range.map((s, i) => ({
    spot: s,
    pnl: payoff.pnl[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="50%" stopColor="#22c55e" stopOpacity={0} />
            <stop offset="50%" stopColor="#ef4444" stopOpacity={0} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="spot"
          tick={{ fontSize: 9, fill: COLORS.muted }}
          tickLine={false}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <YAxis
          tick={{ fontSize: 9, fill: COLORS.muted }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            fontSize: 10,
          }}
          formatter={(value: number) => [value.toFixed(2), "P&L"]}
          labelFormatter={(label) => `Spot: ${Number(label).toFixed(0)}`}
        />
        <ReferenceLine y={0} stroke={COLORS.muted} strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="pnl"
          stroke={COLORS.blue}
          fill="url(#pnlGradient)"
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BacktestEquityCurve({
  data,
  height = "100%",
}: {
  data: { datetime: string; spot: number; pnl: number }[];
  height?: string | number;
}) {
  const chartData = data.map((d) => ({
    datetime: d.datetime.split(" ")[1] || d.datetime,
    pnl: d.pnl,
    spot: d.spot,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartData}
        margin={{ top: 4, right: 8, bottom: 0, left: -10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="datetime"
          tick={{ fontSize: 8, fill: COLORS.muted }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: COLORS.muted }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            fontSize: 10,
          }}
          formatter={(value: number, name: string) => [
            value.toFixed(2),
            name === "pnl" ? "P&L" : "Spot",
          ]}
        />
        <ReferenceLine y={0} stroke={COLORS.muted} strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="pnl"
          stroke={COLORS.blue}
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BacktestMetrics({ metrics }: { metrics: BacktestResult["metrics"] }) {
  const items = [
    {
      label: "Total P&L",
      value: metrics.total_pnl.toFixed(2),
      color: metrics.total_pnl >= 0 ? "#22c55e" : "#ef4444",
    },
    {
      label: "Max Profit",
      value: metrics.max_profit.toFixed(2),
      color: "#22c55e",
    },
    {
      label: "Max Loss",
      value: metrics.max_loss.toFixed(2),
      color: "#ef4444",
    },
    {
      label: "Max Drawdown",
      value: metrics.max_drawdown.toFixed(2),
      color: "#ef4444",
    },
    {
      label: "Win Rate",
      value: `${metrics.win_rate.toFixed(1)}%`,
      color: metrics.win_rate >= 50 ? "#22c55e" : "#ef4444",
    },
    {
      label: "Sharpe",
      value: metrics.sharpe.toFixed(2),
      color: metrics.sharpe >= 1 ? "#22c55e" : metrics.sharpe >= 0 ? "#f59e0b" : "#ef4444",
    },
    {
      label: "Profit Factor",
      value: metrics.profit_factor?.toFixed(2) ?? "N/A",
      color:
        metrics.profit_factor != null && metrics.profit_factor >= 1
          ? "#22c55e"
          : "#ef4444",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((m) => (
        <div
          key={m.label}
          className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5"
        >
          <div className="text-[9px] text-(--muted) font-mono uppercase">
            {m.label}
          </div>
          <div className="font-mono text-[11px]" style={{ color: m.color }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

type CustomLeg = {
  type: "CE" | "PE";
  strike: string;
  action: "buy" | "sell";
  qty: string;
  premium: string;
};

const EMPTY_LEG: CustomLeg = { type: "CE", strike: "", action: "buy", qty: "1", premium: "" };

export function CustomStrategyBuilder({
  strikes,
  onCompute,
  payoff,
  loading,
}: {
  strikes: number[];
  onCompute: (legs: { type: string; strike: number; action: string; qty: number; premium: number }[]) => void;
  payoff: { spot_range: number[]; pnl: number[]; max_profit: number; max_loss: number; breakevens: number[] } | null;
  loading: boolean;
}) {
  const [legs, setLegs] = useState<CustomLeg[]>([{ ...EMPTY_LEG }, { ...EMPTY_LEG, type: "PE" }]);

  const addLeg = () => setLegs((prev) => [...prev, { ...EMPTY_LEG }]);
  const removeLeg = (idx: number) => setLegs((prev) => prev.filter((_, i) => i !== idx));
  const updateLeg = (idx: number, field: keyof CustomLeg, value: string) => {
    setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const handleCompute = useCallback(() => {
    const parsed = legs
      .filter((l) => l.strike && l.premium)
      .map((l) => ({
        type: l.type,
        strike: parseFloat(l.strike),
        action: l.action,
        qty: parseInt(l.qty) || 1,
        premium: parseFloat(l.premium),
      }));
    if (parsed.length > 0) onCompute(parsed);
  }, [legs, onCompute]);

  return (
    <div className="space-y-3 text-[11px]">
      <div className="space-y-1.5">
        {legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={leg.action}
              onChange={(e) => updateLeg(i, "action", e.target.value)}
              className="bg-(--bg) border border-(--border) rounded px-1.5 py-1 text-[10px] font-mono outline-none cursor-pointer"
            >
              <option value="buy">BUY</option>
              <option value="sell">SELL</option>
            </select>
            <select
              value={leg.type}
              onChange={(e) => updateLeg(i, "type", e.target.value)}
              className="bg-(--bg) border border-(--border) rounded px-1.5 py-1 text-[10px] font-mono outline-none cursor-pointer"
            >
              <option value="CE">CE</option>
              <option value="PE">PE</option>
            </select>
            <select
              value={leg.strike}
              onChange={(e) => updateLeg(i, "strike", e.target.value)}
              className="bg-(--bg) border border-(--border) rounded px-1.5 py-1 text-[10px] font-mono outline-none cursor-pointer flex-1 min-w-0"
            >
              <option value="">Strike</option>
              {strikes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Qty"
              value={leg.qty}
              onChange={(e) => updateLeg(i, "qty", e.target.value)}
              className="bg-(--bg) border border-(--border) rounded px-1.5 py-1 text-[10px] font-mono outline-none w-12 text-center"
            />
            <input
              type="number"
              placeholder="Premium"
              value={leg.premium}
              onChange={(e) => updateLeg(i, "premium", e.target.value)}
              className="bg-(--bg) border border-(--border) rounded px-1.5 py-1 text-[10px] font-mono outline-none w-20"
            />
            {legs.length > 1 && (
              <button
                onClick={() => removeLeg(i)}
                className="text-(--muted) hover:text-[#ef4444] transition-colors cursor-pointer p-0.5"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={addLeg}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-(--border) text-(--muted) hover:text-(--fg) hover:border-(--ring) text-[10px] font-mono cursor-pointer transition-colors"
        >
          <Plus size={10} /> Add Leg
        </button>
        <button
          onClick={handleCompute}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-(--fg) text-(--bg) hover:opacity-90 font-medium text-[11px] shadow-sm uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50"
        >
          <Calculator size={12} /> Compute Payoff
        </button>
      </div>

      {payoff && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
            <div className="text-[9px] text-(--muted) uppercase">Max Profit</div>
            <div className="font-mono text-[11px] text-[#22c55e]">{payoff.max_profit.toFixed(2)}</div>
          </div>
          <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
            <div className="text-[9px] text-(--muted) uppercase">Max Loss</div>
            <div className="font-mono text-[11px] text-[#ef4444]">{payoff.max_loss.toFixed(2)}</div>
          </div>
          <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
            <div className="text-[9px] text-(--muted) uppercase">Breakeven</div>
            <div className="font-mono text-[11px]">{payoff.breakevens.map((b) => b.toFixed(0)).join(", ") || "—"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
