"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { ChartCard } from "@/components/chart-card";
import { CandlestickChart } from "@/components/candlestick-chart";
import { PatternSummaryBar, PatternList } from "@/components/candle-patterns";
import { fetchAPI } from "@/lib/api";

type Overview = {
  expiries: string[];
};

type CandlePatternData = {
  candles: {
    datetime: string[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
  };
  patterns: Array<{
    datetime: string;
    pattern: string;
    type: "single" | "multi";
    signal: "bullish" | "bearish" | "neutral";
    description: string;
    inference: string;
    option_impact: { CE: string; PE: string };
    confidence: number;
  }>;
  summary: {
    total_patterns: number;
    bullish: number;
    bearish: number;
    neutral: number;
  };
};

const INTERVALS = [
  { value: "15T", label: "15 min" },
  { value: "30T", label: "30 min" },
  { value: "1H", label: "1 Hour" },
  { value: "1D", label: "Daily" },
];

export default function CandlesPage() {
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [interval, setInterval] = useState("1H");
  const [data, setData] = useState<CandlePatternData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bullish" | "bearish" | "neutral">("all");

  useEffect(() => {
    fetchAPI("/api/overview").then((o: Overview) => {
      setExpiries(o.expiries);
      if (o.expiries.length > 0) setExpiry(o.expiries[0]);
    });
  }, []);

  useEffect(() => {
    if (!expiry) return;
    setLoading(true);
    fetchAPI("/api/candle-patterns", { expiry, interval }).then((d: CandlePatternData) => {
      setData(d);
      setLoading(false);
    });
  }, [expiry, interval]);

  const candleData =
    data?.candles.datetime.map((dt, i) => ({
      datetime: dt,
      open: data.candles.open[i],
      high: data.candles.high[i],
      low: data.candles.low[i],
      close: data.candles.close[i],
    })) ?? [];

  const patternMarkers =
    data?.patterns.map((p) => ({
      datetime: p.datetime,
      pattern: p.pattern,
      signal: p.signal,
    })) ?? [];

  const filteredPatterns =
    filter === "all"
      ? data?.patterns ?? []
      : (data?.patterns ?? []).filter((p) => p.signal === filter);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg)] text-xs">
      <Nav />
      <main className="flex-1 p-2 w-full flex flex-col gap-2 overflow-hidden mx-auto">
        <div className="flex items-center justify-between shrink-0 px-1 pt-1 pb-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold tracking-tight">Candles</h1>
            <p className="hidden md:block text-[var(--muted)]">
              Detect single & multi-candle patterns with options impact analysis
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="bg-transparent border border-[var(--border)] rounded px-2 py-1 hover:border-[var(--muted)] transition-colors cursor-pointer outline-none"
            >
              {INTERVALS.map((iv) => (
                <option key={iv.value} value={iv.value} className="bg-[var(--bg)]">
                  {iv.label}
                </option>
              ))}
            </select>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="bg-transparent border border-[var(--border)] rounded px-2 py-1 hover:border-[var(--muted)] transition-colors cursor-pointer outline-none"
            >
              {expiries.map((e) => (
                <option key={e} value={e} className="bg-[var(--bg)]">
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
            Loading...
          </div>
        ) : (
          <div className="flex flex-col flex-1 h-full overflow-hidden">
            {/* Candlestick Chart */}
            <div className="flex-[2] min-h-0 w-full pb-2">
              <ChartCard title="NIFTY Spot Price — Candlestick Chart" className="h-full">
                <div className="absolute inset-0">
                  <CandlestickChart
                    data={candleData}
                    patterns={patternMarkers}
                  />
                </div>
              </ChartCard>
            </div>

            {/* Pattern Summary & Filter */}
            {data && (
              <div className="shrink-0 flex items-center justify-between flex-wrap gap-2 py-2 px-1 border-t border-[var(--border)]">
                <PatternSummaryBar summary={data.summary} />
                <div className="flex gap-1">
                  {(["all", "bullish", "bearish", "neutral"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2 py-0.5 rounded-sm border transition-colors ${
                        filter === f
                          ? "border-[var(--accent)] text-[var(--bg)] bg-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pattern Cards */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar min-h-0 pb-2">
              <PatternList patterns={filteredPatterns} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
