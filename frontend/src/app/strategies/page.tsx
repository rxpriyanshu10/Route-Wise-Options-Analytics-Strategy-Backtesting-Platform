"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Nav } from "@/components/nav";
import { ChartCard, ChartCardSkeleton } from "@/components/chart-card";
import {
  StrategyList,
  StrategyDetail,
  PayoffChart,
  BacktestEquityCurve,
  BacktestMetrics,
  CustomStrategyBuilder,
} from "@/components/strategy-panels";
import { fetchAPI, postAPI } from "@/lib/api";
import {
  ChevronDown,
  Play,
  Loader2,
  Wrench,
  Library,
  MessageSquare,
  ArrowUp,
  Zap,
  Target,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";

function ResizeHandle({
  direction = "horizontal",
}: {
  direction?: "horizontal" | "vertical";
}) {
  return (
    <PanelResizeHandle
      className={`group relative flex items-center justify-center ${
        direction === "horizontal" ? "w-1.5" : "h-1.5"
      }`}
    >
      <div
        className={`rounded-full bg-(--border) group-hover:bg-(--muted) group-data-resize-handle-active:bg-(--ring) transition-all duration-150 ${
          direction === "horizontal"
            ? "w-0.5 h-8 group-hover:h-12 group-hover:w-1"
            : "h-0.5 w-8 group-hover:w-12 group-hover:h-1"
        }`}
      />
    </PanelResizeHandle>
  );
}

// Optimization charts
function TimespanChart({ data }: { data: any[] }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({
    hold: `${(d.hold_fraction * 100).toFixed(0)}%`,
    avg_pnl: d.avg_pnl,
    win_rate: d.win_rate,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="hold" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10 }} />
        <Bar dataKey="avg_pnl" name="Avg P&L" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.avg_pnl >= 0 ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EntryHourChart({ data }: { data: any[] }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({
    hour: `${d.hour}:00`,
    avg_pnl: d.avg_pnl,
    win_rate: d.win_rate,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10 }} />
        <Bar dataKey="avg_pnl" name="Avg P&L" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.avg_pnl >= 0 ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PnlScatter({ data }: { data: any[] }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="hold_hours" name="Hold (hrs)" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <YAxis dataKey="pnl" name="P&L" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10 }} />
        <Scatter data={data} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} r={3} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

const PROMPT_SUGGESTIONS = [
  "I'm bullish on NIFTY, what should I trade?",
  "Market looks range-bound, suggest a theta strategy",
  "I expect high volatility, recommend a strategy",
  "Bearish outlook — best put strategy?",
  "Iron condor for sideways market",
];

export default function StrategiesPage() {
  const [expiry, setExpiry] = useState("");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"prebuilt" | "custom" | "prompt">("prebuilt");

  // Chain data for custom builder
  const [chainStrikes, setChainStrikes] = useState<number[]>([]);
  const [spot, setSpot] = useState(0);

  // Custom strategy state
  const [customPayoff, setCustomPayoff] = useState<any>(null);
  const [customPayoffLoading, setCustomPayoffLoading] = useState(false);
  const [customLegs, setCustomLegs] = useState<any[]>([]);

  // Backtest state
  const [entryDatetimes, setEntryDatetimes] = useState<string[]>([]);
  const [entryDt, setEntryDt] = useState("");
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  // Prompt state
  const [promptInput, setPromptInput] = useState("");
  const [promptResult, setPromptResult] = useState<any>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Optimization state
  const [optimizeData, setOptimizeData] = useState<any>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // Load expiries
  useEffect(() => {
    fetchAPI("/api/overview").then((data) => {
      setExpiries(data.expiries || []);
      if (data.expiries?.length > 0) setExpiry(data.expiries[0]);
    });
  }, []);

  // Load strategies & chain data when expiry changes
  useEffect(() => {
    if (!expiry) return;
    setLoading(true);
    setStrategies([]);
    setSelectedId(null);
    setBacktestResult(null);
    setCustomPayoff(null);
    setPromptResult(null);
    setOptimizeData(null);

    fetchAPI("/api/strategies", { expiry })
      .then((data) => {
        setStrategies(data.strategies || []);
        setSpot(data.spot || 0);
        if (data.strategies?.length > 0) setSelectedId(data.strategies[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetchAPI("/api/option-chain", { expiry })
      .then((data) => {
        const strikes = (data.chain || []).map((r: any) => r.strike);
        setChainStrikes(strikes);
      })
      .catch(console.error);

    fetchAPI("/api/backtest/datetimes", { expiry })
      .then((dts: string[]) => {
        setEntryDatetimes(dts);
        if (dts.length > 0) setEntryDt(dts[0]);
      })
      .catch(console.error);
  }, [expiry]);

  const selected = strategies.find((s) => s.id === selectedId) || null;

  // Run backtest for prebuilt strategy
  const runBacktest = useCallback(() => {
    if (!selectedId || !entryDt || !expiry) return;
    setBacktestLoading(true);
    setBacktestResult(null);
    fetchAPI("/api/backtest", { expiry, strategy_id: selectedId, entry: entryDt })
      .then(setBacktestResult)
      .catch(console.error)
      .finally(() => setBacktestLoading(false));
  }, [selectedId, entryDt, expiry]);

  // Compute custom payoff
  const computeCustomPayoff = useCallback(
    (legs: any[]) => {
      setCustomLegs(legs);
      setCustomPayoffLoading(true);
      postAPI("/api/strategy-payoff", { legs, spot })
        .then(setCustomPayoff)
        .catch(console.error)
        .finally(() => setCustomPayoffLoading(false));
    },
    [spot]
  );

  // Run backtest for custom strategy
  const runCustomBacktest = useCallback(() => {
    if (!customLegs.length || !entryDt || !expiry) return;
    setBacktestLoading(true);
    setBacktestResult(null);
    postAPI("/api/backtest/custom", { expiry, entry: entryDt, legs: customLegs })
      .then(setBacktestResult)
      .catch(console.error)
      .finally(() => setBacktestLoading(false));
  }, [customLegs, entryDt, expiry]);

  // Submit prompt
  const submitPrompt = useCallback(
    (text: string) => {
      if (!text.trim() || !expiry) return;
      setPromptLoading(true);
      setPromptResult(null);
      setBacktestResult(null);
      setOptimizeData(null);
      fetch("/api/strategy-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, expiry }),
        }).then((r) => r.json())
        .then((data) => {
          setPromptResult(data);
          // Auto-select first recommended strategy
          if (data.recommended?.length > 0) {
            const firstStrat = data.recommended[0].strategy;
            setSelectedId(firstStrat.id);
            // If optimization data came back, set it
            if (data.recommended[0].optimization) {
              setOptimizeData(data.recommended[0].optimization);
            }
          }
        })
        .catch(console.error)
        .finally(() => setPromptLoading(false));
    },
    [expiry]
  );

  // Run optimizer for selected strategy
  const runOptimize = useCallback(() => {
    if (!selectedId || !expiry) return;
    setOptimizeLoading(true);
    setOptimizeData(null);
    fetchAPI("/api/strategy/optimize", { expiry, strategy_id: selectedId })
      .then(setOptimizeData)
      .catch(console.error)
      .finally(() => setOptimizeLoading(false));
  }, [selectedId, expiry]);

  // Auto-run backtest at optimal entry from prompt result
  const runOptimalBacktest = useCallback(
    (entry: string) => {
      if (!selectedId || !expiry) return;
      setBacktestLoading(true);
      setBacktestResult(null);
      fetchAPI("/api/backtest", { expiry, strategy_id: selectedId, entry })
        .then(setBacktestResult)
        .catch(console.error)
        .finally(() => setBacktestLoading(false));
    },
    [selectedId, expiry]
  );

  // Get the prompt-selected strategy for display
  const promptSelectedStrategy = promptResult?.recommended?.find(
    (r: any) => r.strategy.id === selectedId
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-(--bg) text-sm font-sans">
      <Nav />
      <main className="flex-1 p-2 w-full flex flex-col gap-2 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-2 py-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              Strategies & Backtesting
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-0.5 bg-(--card) border border-(--border) rounded-md p-0.5">
              {([
                { key: "prebuilt", label: "Prebuilt", icon: Library },
                { key: "custom", label: "Custom", icon: Wrench },
                { key: "prompt", label: "Prompt", icon: MessageSquare },
              ] as const).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => { setMode(m.key); setBacktestResult(null); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      mode === m.key
                        ? "bg-(--border) text-(--fg)"
                        : "text-(--muted) hover:text-(--fg)"
                    }`}
                  >
                    <Icon size={11} /> {m.label}
                  </button>
                );
              })}
            </div>
            {/* Expiry */}
            {expiries.length > 0 && (
              <div className="relative">
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="appearance-none bg-(--card) border border-(--border) rounded-md px-3 py-1.5 pr-7 hover:border-(--ring) text-(--fg) cursor-pointer outline-none text-xs"
                >
                  {expiries.map((e) => (
                    <option key={e} value={e} className="bg-(--bg)">{e}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-(--muted)" />
              </div>
            )}
          </div>
        </div>

        {/* Main layout */}
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {/* Left panel */}
          <Panel defaultSize={28} minSize={18}>
            <div className="h-full flex flex-col gap-2">
              {mode === "prebuilt" && (
                <ChartCard title="Strategies" className="flex-1">
                  {loading ? (
                    <div className="skeleton w-full h-full rounded" />
                  ) : (
                    <div className="overflow-y-auto hidden-scrollbar h-full">
                      <StrategyList strategies={strategies} selected={selectedId} onSelect={(id) => { setSelectedId(id); setOptimizeData(null); }} />
                    </div>
                  )}
                </ChartCard>
              )}
              {mode === "custom" && (
                <ChartCard title="Build Strategy" className="flex-1">
                  <div className="overflow-y-auto hidden-scrollbar h-full">
                    <CustomStrategyBuilder strikes={chainStrikes} onCompute={computeCustomPayoff} payoff={customPayoff} loading={customPayoffLoading} />
                  </div>
                </ChartCard>
              )}
              {mode === "prompt" && (
                <ChartCard title="Strategy Prompt" className="flex-1">
                  <div className="flex flex-col h-full">
                    {/* Prompt result / suggestions */}
                    <div className="flex-1 overflow-y-auto hidden-scrollbar space-y-2">
                      {!promptResult && !promptLoading && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Zap size={12} className="text-(--muted)" />
                            <span className="text-[10px] text-(--muted)">Describe your market view</span>
                          </div>
                          {PROMPT_SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              onClick={() => { setPromptInput(s); submitPrompt(s); }}
                              className="w-full text-left px-2.5 py-2 rounded-md border border-(--border) bg-(--bg) hover:border-(--ring) text-[10px] text-(--muted) hover:text-(--fg) cursor-pointer transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {promptLoading && (
                        <div className="flex items-center gap-2 py-4">
                          <Loader2 size={14} className="animate-spin text-(--muted)" />
                          <span className="text-[10px] text-(--muted)">Analyzing strategies...</span>
                        </div>
                      )}
                      {promptResult && (
                        <div className="space-y-3">
                          {/* User prompt */}
                          <div className="bg-(--border) rounded-lg rounded-br-sm px-3 py-2 text-[10px] ml-auto max-w-[85%]">
                            {promptResult.prompt}
                          </div>
                          {/* AI response */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
                                style={{
                                  color: promptResult.detected_sentiment === "bullish" ? "#22c55e" : promptResult.detected_sentiment === "bearish" ? "#ef4444" : "#f59e0b",
                                  background: (promptResult.detected_sentiment === "bullish" ? "#22c55e" : promptResult.detected_sentiment === "bearish" ? "#ef4444" : "#f59e0b") + "15",
                                }}
                              >
                                {promptResult.detected_sentiment}
                              </span>
                            </div>
                            <p className="text-[10px] text-(--accent) leading-relaxed">
                              {promptResult.explanation}
                            </p>
                            {/* Recommended strategies */}
                            <div className="space-y-1">
                              {promptResult.recommended?.map((rec: any) => (
                                <button
                                  key={rec.strategy.id}
                                  onClick={() => {
                                    setSelectedId(rec.strategy.id);
                                    setOptimizeData(rec.optimization);
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-md border transition-colors cursor-pointer ${
                                    selectedId === rec.strategy.id
                                      ? "border-(--ring) bg-(--card-hover)"
                                      : "border-(--border) bg-(--bg) hover:border-(--ring)"
                                  }`}
                                >
                                  <div className="flex justify-between text-[10px] font-mono">
                                    <span className="font-semibold">{rec.strategy.name}</span>
                                    {rec.optimization?.best && (
                                      <span className={rec.optimization.best.pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                                        Best: {rec.optimization.best.pnl >= 0 ? "+" : ""}{rec.optimization.best.pnl}
                                      </span>
                                    )}
                                  </div>
                                  {rec.optimization?.best_entry_hour && (
                                    <div className="text-[9px] text-(--muted) mt-0.5">
                                      Best hour: {rec.optimization.best_entry_hour.hour}:00 | Win: {rec.optimization.best_entry_hour.win_rate}%
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Prompt input */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitPrompt(promptInput); setPromptInput(""); }}
                      className="shrink-0 mt-2 flex gap-1.5"
                    >
                      <input
                        ref={promptInputRef}
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        placeholder="Describe your view..."
                        disabled={promptLoading}
                        className="flex-1 bg-(--bg) border border-(--border) rounded-md px-2.5 py-1.5 text-[10px] text-(--fg) placeholder:text-(--muted) outline-none focus:border-(--ring) transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={promptLoading || !promptInput.trim()}
                        className="flex items-center justify-center w-8 h-8 rounded-md bg-(--fg) text-(--bg) shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        <ArrowUp size={14} />
                      </button>
                    </form>
                  </div>
                </ChartCard>
              )}
            </div>
          </Panel>

          <ResizeHandle />

          {/* Right panel */}
          <Panel defaultSize={72} minSize={40}>
            <PanelGroup orientation="vertical" className="h-full">
              {/* Top: Strategy detail + Payoff / Optimization */}
              <Panel defaultSize={55} minSize={25}>
                <div className="h-full flex gap-2">
                  {mode === "prebuilt" || mode === "prompt" ? (
                    <>
                      <ChartCard
                        title="Strategy Detail"
                        className="flex-1"
                        headerRight={
                          mode === "prebuilt" && selectedId ? (
                            <button
                              onClick={runOptimize}
                              disabled={optimizeLoading}
                              className="flex items-center gap-1.5 px-3 py-1 bg-(--fg) text-(--bg) rounded-md text-[11px] font-medium shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                            >
                              {optimizeLoading ? <Loader2 size={12} className="animate-spin" /> : <Target size={12} />}
                              Optimize Strategy
                            </button>
                          ) : undefined
                        }
                      >
                        {selected ? (
                          <div className="overflow-y-auto hidden-scrollbar h-full">
                            <StrategyDetail strategy={selected} />
                          </div>
                        ) : (
                          <div className="text-(--muted) text-center py-8 text-[11px]">
                            {mode === "prompt" ? "Use the prompt to get recommendations" : "Select a strategy"}
                          </div>
                        )}
                      </ChartCard>
                      {/* Right side: Payoff or Optimization */}
                      {optimizeData && !optimizeData.error ? (
                        <div className="flex-1 flex flex-col gap-2">
                          {/* Optimization summary */}
                          <div className="grid grid-cols-3 gap-1.5 shrink-0">
                            <div className="bg-(--card) border border-(--border) rounded-md px-2 py-1.5">
                              <div className="flex items-center gap-1 text-[9px] text-(--muted) font-mono uppercase"><TrendingUp size={9} /> Best P&L</div>
                              <div className="font-mono text-[11px] text-[#22c55e]">{optimizeData.best?.pnl}</div>
                              <div className="text-[8px] text-(--muted) font-mono truncate">{optimizeData.best?.entry?.split(" ")[1]}</div>
                            </div>
                            <div className="bg-(--card) border border-(--border) rounded-md px-2 py-1.5">
                              <div className="flex items-center gap-1 text-[9px] text-(--muted) font-mono uppercase"><Clock size={9} /> Best Hold</div>
                              <div className="font-mono text-[11px]">{(optimizeData.best_timespan?.hold_fraction * 100).toFixed(0)}%</div>
                              <div className="text-[8px] text-(--muted) font-mono">Win: {optimizeData.best_timespan?.win_rate}%</div>
                            </div>
                            <div className="bg-(--card) border border-(--border) rounded-md px-2 py-1.5">
                              <div className="flex items-center gap-1 text-[9px] text-(--muted) font-mono uppercase"><Clock size={9} /> Best Hour</div>
                              <div className="font-mono text-[11px]">{optimizeData.best_entry_hour?.hour}:00</div>
                              <div className="text-[8px] text-(--muted) font-mono">Avg: {optimizeData.best_entry_hour?.avg_pnl}</div>
                            </div>
                          </div>
                          {/* Charts */}
                          <div className="flex-1 min-h-0 flex gap-2">
                            <ChartCard title="P&L by Hold Duration" className="flex-1">
                              <div className="absolute inset-0">
                                <TimespanChart data={optimizeData.timespan_analysis} />
                              </div>
                            </ChartCard>
                            <ChartCard title="P&L by Entry Hour" className="flex-1">
                              <div className="absolute inset-0">
                                <EntryHourChart data={optimizeData.entry_time_analysis} />
                              </div>
                            </ChartCard>
                          </div>
                          {/* Run best backtest button */}
                          {optimizeData.best?.entry && (
                            <button
                              onClick={() => runOptimalBacktest(optimizeData.best.entry)}
                              className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 mt-2 rounded-md bg-(--fg) text-(--bg) font-medium shadow-sm hover:opacity-90 disabled:opacity-50 text-[11px] uppercase tracking-wider cursor-pointer transition-all"
                            >
                              <Play size={12} fill="currentColor" /> Backtest at Optimal Entry
                            </button>
                          )}
                        </div>
                      ) : (
                        <ChartCard title="Payoff at Expiry" className="flex-1">
                          {selected ? (
                            <div className="absolute inset-0">
                              <PayoffChart payoff={selected.payoff} height="100%" />
                            </div>
                          ) : (
                            <div className="text-(--muted) text-center py-8 text-[11px]">
                              Select a strategy to view payoff
                            </div>
                          )}
                        </ChartCard>
                      )}
                    </>
                  ) : (
                    <>
                      <ChartCard title="Custom Payoff at Expiry" className="flex-1">
                        {customPayoff ? (
                          <div className="absolute inset-0">
                            <PayoffChart payoff={customPayoff} height="100%" />
                          </div>
                        ) : (
                          <div className="text-(--muted) text-center py-8 text-[11px]">
                            Define legs and click Compute Payoff
                          </div>
                        )}
                      </ChartCard>
                      <ChartCard title="Custom Legs" className="flex-1">
                        {customLegs.length > 0 ? (
                          <div className="space-y-2 text-[11px]">
                            <div className="border border-(--border) rounded-md overflow-hidden">
                              <table className="w-full text-[10px] font-mono">
                                <thead>
                                  <tr className="bg-(--card) text-(--muted)">
                                    <th className="px-2 py-1 text-left">Leg</th>
                                    <th className="px-2 py-1 text-right">Strike</th>
                                    <th className="px-2 py-1 text-right">Premium</th>
                                    <th className="px-2 py-1 text-right">Qty</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customLegs.map((leg: any, i: number) => (
                                    <tr key={i} className="border-t border-(--border)">
                                      <td className="px-2 py-1">
                                        <span className={leg.action === "buy" ? "text-[#22c55e]" : "text-[#ef4444]"}>
                                          {leg.action.toUpperCase()}
                                        </span>{" "}{leg.type}
                                      </td>
                                      <td className="px-2 py-1 text-right">{leg.strike}</td>
                                      <td className="px-2 py-1 text-right">{leg.premium}</td>
                                      <td className="px-2 py-1 text-right">{leg.qty}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {customPayoff && (
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
                                  <div className="text-[9px] text-(--muted) uppercase">Max Profit</div>
                                  <div className="font-mono text-[11px] text-[#22c55e]">{customPayoff.max_profit.toFixed(2)}</div>
                                </div>
                                <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
                                  <div className="text-[9px] text-(--muted) uppercase">Max Loss</div>
                                  <div className="font-mono text-[11px] text-[#ef4444]">{customPayoff.max_loss.toFixed(2)}</div>
                                </div>
                                <div className="bg-(--bg) border border-(--border) rounded-md px-2 py-1.5">
                                  <div className="text-[9px] text-(--muted) uppercase">Breakeven</div>
                                  <div className="font-mono text-[11px]">{customPayoff.breakevens.map((b: number) => b.toFixed(0)).join(", ") || "—"}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-(--muted) text-center py-8 text-[11px]">No legs defined yet</div>
                        )}
                      </ChartCard>
                    </>
                  )}
                </div>
              </Panel>

              <ResizeHandle direction="vertical" />

              {/* Bottom: Backtest */}
              <Panel defaultSize={45} minSize={20}>
                <div className="h-full flex flex-col gap-2">
                  {/* Backtest controls */}
                  <div className="shrink-0 flex items-center gap-3 px-1">
                    <span className="font-mono text-[11px] text-(--muted) uppercase tracking-wider">Backtest</span>
                    <div className="relative">
                      <select
                        value={entryDt}
                        onChange={(e) => setEntryDt(e.target.value)}
                        className="appearance-none bg-(--card) border border-(--border) rounded-md px-2 py-1 pr-6 hover:border-(--ring) text-(--fg) cursor-pointer outline-none text-[10px] font-mono"
                      >
                        {entryDatetimes.map((dt) => (
                          <option key={dt} value={dt} className="bg-(--bg)">{dt}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-(--muted)" />
                    </div>
                    <button
                      onClick={mode === "custom" ? runCustomBacktest : runBacktest}
                      disabled={
                        (mode === "custom" ? !customLegs.length : !selectedId) ||
                        !entryDt || backtestLoading
                      }
                      className="flex items-center gap-2 px-6 py-1.5 rounded-md bg-(--fg) text-(--bg) font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                    >
                      {backtestLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                      Run Backtest
                    </button>
                    {backtestResult?.metrics && (
                      <span className={`text-[11px] font-mono ${backtestResult.metrics.total_pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        P&L: {backtestResult.metrics.total_pnl >= 0 ? "+" : ""}{backtestResult.metrics.total_pnl.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Backtest results */}
                  <div className="flex-1 min-h-0 flex gap-2">
                    {backtestLoading ? (
                      <>
                        <ChartCardSkeleton className="flex-1" />
                        <ChartCardSkeleton className="flex-1" />
                      </>
                    ) : backtestResult?.error ? (
                      <ChartCard title="Error" className="flex-1">
                        <div className="text-[#ef4444] text-[11px] py-4 text-center">{backtestResult.error}</div>
                      </ChartCard>
                    ) : backtestResult?.equity_curve ? (
                      <>
                        <ChartCard title="Equity Curve" className="flex-[2]">
                          <div className="absolute inset-0">
                            <BacktestEquityCurve data={backtestResult.equity_curve} height="100%" />
                          </div>
                        </ChartCard>
                        <ChartCard title="Metrics" className="flex-1">
                          <div className="overflow-y-auto hidden-scrollbar h-full">
                            <BacktestMetrics metrics={backtestResult.metrics} />
                            {backtestResult.exit_legs && (
                              <div className="mt-3 border-t border-(--border) pt-2">
                                <div className="text-[9px] text-(--muted) font-mono uppercase mb-1">Exit Breakdown</div>
                                <div className="space-y-1">
                                  {backtestResult.exit_legs.map((leg: any, i: number) => (
                                    <div key={i} className="flex justify-between text-[10px] font-mono">
                                      <span>{leg.action.toUpperCase()} {leg.type} {leg.strike}</span>
                                      <span className={leg.leg_pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                                        {leg.leg_pnl >= 0 ? "+" : ""}{leg.leg_pnl.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-2 text-[9px] text-(--muted) font-mono">
                              {backtestResult.num_snapshots} snapshots / {backtestResult.entry_datetime?.split(" ")[0]} to {backtestResult.exit_datetime?.split(" ")[0]}
                            </div>
                          </div>
                        </ChartCard>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-(--muted) text-[11px] font-mono">
                          {mode === "prompt"
                            ? "Describe your view, pick a strategy, then backtest"
                            : mode === "custom"
                            ? "Define custom legs, then select entry time and click Run"
                            : "Select a strategy and entry time, then click Run to backtest"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
