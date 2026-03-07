"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { ChartCard } from "@/components/chart-card";
import {
  OIByStrikeChart,
  VolumeByStrikeChart,
  PCRChart,
  SpotChart,
  StraddleChart,
} from "@/components/charts";
import { CandlestickChart } from "@/components/candlestick-chart";
import { PatternSummaryBar, PatternList } from "@/components/candle-patterns";
import { DirectionSummary, AnomalyTimeline, AnomalyList } from "@/components/ml-panels";
import { fetchAPI } from "@/lib/api";

type Overview = {
  total_rows: number;
  date_range: { start: string; end: string };
  expiries: string[];
  strike_range: { min: number; max: number };
  symbols: string[];
};

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [expiry, setExpiry] = useState<string>("");
  const [oiData, setOiData] = useState<any>(null);
  const [volumeData, setVolumeData] = useState<any>(null);
  const [pcrData, setPcrData] = useState<any>(null);
  const [spotData, setSpotData] = useState<any>(null);
  const [straddleData, setStraddleData] = useState<any>(null);
  const [oiChangeData, setOiChangeData] = useState<any>(null);
  const [candleData, setCandleData] = useState<any>(null);
  const [candleInterval, setCandleInterval] = useState("1H");
  const [patternFilter, setPatternFilter] = useState<"all" | "bullish" | "bearish" | "neutral">("all");
  const [anomalyData, setAnomalyData] = useState<any>(null);
  const [directionData, setDirectionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/api/overview").then((data) => {
      setOverview(data);
      if (data.expiries.length > 0) {
        setExpiry(data.expiries[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!expiry) return;
    setLoading(true);
    const params = { expiry };
    Promise.all([
      fetchAPI("/api/oi-by-strike", params),
      fetchAPI("/api/volume-by-strike", params),
      fetchAPI("/api/pcr-timeseries", params),
      fetchAPI("/api/spot-timeseries", params),
      fetchAPI("/api/straddle-price", params),
      fetchAPI("/api/oi-change", params),
      fetchAPI("/api/candle-patterns", { ...params, interval: candleInterval }),
      fetchAPI("/api/anomalies", params),
      fetchAPI("/api/direction", params),
    ]).then(([oi, vol, pcr, spot, straddle, oiChange, candles, anomalies, direction]) => {
      setOiData(oi);
      setVolumeData(vol);
      setPcrData(pcr);
      setSpotData(spot);
      setStraddleData(straddle);
      setOiChangeData(oiChange);
      setCandleData(candles);
      setAnomalyData(anomalies);
      setDirectionData(direction);
      setLoading(false);
    });
  }, [expiry, candleInterval]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg)] text-xs">
      <Nav />
      <main className="flex-1 p-2 w-full flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between shrink-0 px-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold tracking-tight">Terminal</h1>
            {overview && (
              <span className="text-[var(--muted)]">
                {overview.symbols.join(", ")} &middot; {overview.total_rows.toLocaleString()} pts
              </span>
            )}
          </div>
          {overview && (
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="bg-transparent border border-[var(--border)] rounded px-2 py-1 hover:border-[var(--muted)] transition-colors cursor-pointer outline-none"
            >
              {overview.expiries.map((e) => (
                <option key={e} value={e} className="bg-[var(--bg)]">{e}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>
        ) : (
          <div className="flex-1 flex gap-2 h-full overflow-hidden">
            {/* Left Column: Primary Chart */}
            <div className="flex-[3] flex flex-col gap-2 min-w-0">
              {candleData && (
                <ChartCard title="" className="flex-1">
                  <div className="flex items-center justify-between mb-2 shrink-0 px-1">
                    <h3 className="font-mono text-[var(--muted)] text-[10px] uppercase tracking-wider">
                      NIFTY Spot / Candles
                    </h3>
                    <select
                      value={candleInterval}
                      onChange={(e) => setCandleInterval(e.target.value)}
                      className="bg-transparent border border-[var(--border)] rounded px-1.5 py-0.5 hover:border-[var(--muted)] transition-colors cursor-pointer outline-none text-[10px]"
                    >
                      <option value="15T" className="bg-[var(--bg)]">15m</option>
                      <option value="30T" className="bg-[var(--bg)]">30m</option>
                      <option value="1H" className="bg-[var(--bg)]">1H</option>
                      <option value="1D" className="bg-[var(--bg)]">1D</option>
                    </select>
                  </div>
                  <div className="flex-1 min-h-0 relative">
                    <div className="absolute inset-0">
                      <CandlestickChart
                        data={candleData.candles.datetime.map((dt: string, i: number) => ({
                          datetime: dt,
                          open: candleData.candles.open[i],
                          high: candleData.candles.high[i],
                          low: candleData.candles.low[i],
                          close: candleData.candles.close[i],
                        }))}
                        patterns={candleData.patterns.map((p: any) => ({
                          datetime: p.datetime,
                          pattern: p.pattern,
                          signal: p.signal,
                        }))}
                      />
                    </div>
                  </div>
                </ChartCard>
              )}

              {/* Pattern Indicators (Shrink 0) */}
              {candleData && candleData.patterns.length > 0 && (
                <div className="shrink-0 space-y-2 max-h-[25%] overflow-y-auto hidden-scrollbar">
                  <div className="flex items-center justify-between gap-3 sticky top-0 bg-[var(--bg)] z-10 py-1">
                    <PatternSummaryBar summary={candleData.summary} />
                    <div className="flex gap-1">
                      {(["all", "bullish", "bearish", "neutral"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setPatternFilter(f)}
                          className={`px-2 py-0.5 rounded-sm border transition-colors ${
                            patternFilter === f
                              ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                          }`}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PatternList
                    patterns={
                      patternFilter === "all"
                        ? candleData.patterns
                        : candleData.patterns.filter((p: any) => p.signal === patternFilter)
                    }
                  />
                </div>
              )}
            </div>

            {/* Right Column: Mini Charts Grid */}
            <div className="flex-[2] grid grid-cols-2 grid-rows-4 gap-2 min-w-0">
              {/* ML Inference Panels */}
              <ChartCard title="ML Direction">
                <DirectionSummary data={directionData} />
              </ChartCard>
              <ChartCard title="Anomalies">
                <AnomalyList anomalies={anomalyData?.anomalies} />
              </ChartCard>

              {spotData && (
                <ChartCard title="Spot & ATM">
                  <div className="absolute inset-0"><SpotChart data={spotData} height="100%" /></div>
                </ChartCard>
              )}
              {pcrData && (
                <ChartCard title="PCR">
                  <div className="absolute inset-0"><PCRChart data={pcrData} height="100%" /></div>
                </ChartCard>
              )}
              {oiData && (
                <ChartCard title="OI by Strike">
                  <div className="absolute inset-0"><OIByStrikeChart data={oiData} height="100%" /></div>
                </ChartCard>
              )}
              {volumeData && (
                <ChartCard title="Vol by Strike">
                  <div className="absolute inset-0"><VolumeByStrikeChart data={volumeData} height="100%" /></div>
                </ChartCard>
              )}
              {oiChangeData && (
                <ChartCard title="Anomaly Score" className="col-span-2">
                  <div className="absolute inset-0"><AnomalyTimeline data={anomalyData} height="100%" /></div>
                </ChartCard>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
