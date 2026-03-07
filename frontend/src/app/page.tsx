"use client";

import { useEffect, useState, useCallback } from "react";
import { Nav } from "@/components/nav";
import { ChartCard, ChartCardSkeleton } from "@/components/chart-card";
import {
  OIByStrikeChart,
  VolumeByStrikeChart,
  PCRChart,
  SpotChart,
  StraddleChart,
  OIChangeChart,
} from "@/components/charts";
import { CandlestickChart } from "@/components/candlestick-chart";
import { AnomalyTimeline, AnomalyList } from "@/components/ml-panels";
import { GreeksSummary, IVSmileChart, ParityList, MispricingChart } from "@/components/greeks-panels";
import { useInferences } from "@/hooks/use-inferences";
import { fetchAPI } from "@/lib/api";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { Activity, TrendingUp, BarChart3, ChevronDown } from "lucide-react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, useDefaultLayout } from "react-resizable-panels";

type Overview = {
  total_rows: number;
  date_range: { start: string; end: string };
  expiries: string[];
  strike_range: { min: number; max: number };
  symbols: string[];
};

const TABS = [
  { key: "overview", label: "Options Data", icon: BarChart3 },
  { key: "greeks", label: "Greeks & Parity", icon: TrendingUp },
  { key: "ml", label: "Intelligence", icon: Activity },
] as const;

function ResizeHandle({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) {
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

function ChartRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`h-full flex gap-2 ${className || ""}`}>{children}</div>;
}

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
  const [anomalyData, setAnomalyData] = useState<any>(null);
  const [greeksData, setGreeksData] = useState<any>(null);
  const [parityData, setParityData] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [heatmapMetric, setHeatmapMetric] = useState("oi_CE");
  const [rightPanelTab, setRightPanelTab] = useState<"overview" | "greeks" | "ml">("overview");
  const { insights, loading: insightsLoading, fetchInferences } = useInferences();

  // Persisted layouts — storage must be undefined during SSR
  const [storage, setStorage] = useState<Storage | undefined>(undefined);
  useEffect(() => { setStorage(localStorage); }, []);
  const mainLayout = useDefaultLayout({ id: "dashboard-main", storage });
  const overviewLayout = useDefaultLayout({ id: "dashboard-overview", storage });
  const greeksLayout = useDefaultLayout({ id: "dashboard-greeks", storage });
  const mlLayout = useDefaultLayout({ id: "dashboard-ml", storage });

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

    setOiData(null);
    setVolumeData(null);
    setPcrData(null);
    setSpotData(null);
    setStraddleData(null);
    setOiChangeData(null);
    setCandleData(null);
    setAnomalyData(null);
    setGreeksData(null);
    setParityData(null);
    const params = { expiry };

    fetchAPI("/api/oi-by-strike", params).then(setOiData).catch(console.error);
    fetchAPI("/api/volume-by-strike", params).then(setVolumeData).catch(console.error);
    fetchAPI("/api/pcr-timeseries", params).then(setPcrData).catch(console.error);
    fetchAPI("/api/spot-timeseries", params).then(setSpotData).catch(console.error);
    fetchAPI("/api/straddle-price", params).then(setStraddleData).catch(console.error);
    fetchAPI("/api/oi-change", params).then(setOiChangeData).catch(console.error);
    fetchAPI("/api/candle-patterns", { ...params, interval: candleInterval }).then(setCandleData).catch(console.error);
    fetchAPI("/api/anomalies", params).then(setAnomalyData).catch(console.error);
    fetchAPI("/api/greeks", params).then(setGreeksData).catch(console.error);
    fetchAPI("/api/parity-arbitrage", params).then(setParityData).catch(console.error);
  }, [expiry, candleInterval]);

  // Separate effect for heatmap metric — only refetches heatmap data
  useEffect(() => {
    if (!expiry) return;
    setHeatmapData(null);
    fetchAPI("/api/activity-heatmap", { expiry, metric: heatmapMetric }).then(setHeatmapData).catch(console.error);
  }, [expiry, heatmapMetric]);

  const requestInferences = useCallback(() => {
    const panels: { id: string; title: string; summary: string }[] = [];

    if (anomalyData) {
      panels.push({
        id: "anomalies",
        title: "Anomaly Detection",
        summary: `${anomalyData.anomaly_count} anomalies detected out of ${anomalyData.total_snapshots} snapshots. Top anomalous timestamps: ${(anomalyData.anomalies || []).slice(0, 3).map((a: any) => `${a.datetime} (score: ${a.anomaly_score?.toFixed(3)})`).join(", ")}.`,
      });
    }
    if (greeksData?.data?.length) {
      const atm = greeksData.data.reduce((best: any, r: any) =>
        !best || Math.abs(r.strike - r.spot_close) < Math.abs(best.strike - best.spot_close) ? r : best, null);
      if (atm) {
        panels.push({
          id: "greeks",
          title: "ATM Greeks & IV",
          summary: `ATM strike ${atm.strike}, spot ${atm.spot_close}, ${atm.T_days}d to expiry. CE: IV=${atm.iv_CE}%, delta=${atm.delta_CE}, theta=${atm.theta_CE}, vega=${atm.vega_CE}. PE: IV=${atm.iv_PE}%, delta=${atm.delta_PE}, theta=${atm.theta_PE}, vega=${atm.vega_PE}.`,
        });

        const calls = greeksData.data.map((d: any) => d.iv_CE).filter((iv: number) => !isNaN(iv));
        const puts = greeksData.data.map((d: any) => d.iv_PE).filter((iv: number) => !isNaN(iv));
        if (calls.length && puts.length) {
          panels.push({
            id: "ivSmile",
            title: "IV Smile (Volatility Skew)",
            summary: `Analyzed ${greeksData.data.length} strikes. CE IV ranges: ${Math.min(...calls).toFixed(1)}% to ${Math.max(...calls).toFixed(1)}%. PE IV ranges: ${Math.min(...puts).toFixed(1)}% to ${Math.max(...puts).toFixed(1)}%. Check for skewness compared to ATM IV of CE: ${atm.iv_CE}%, PE: ${atm.iv_PE}%.`,
          });
        }
      }
    }
    if (parityData) {
      const topOpps = (parityData.opportunities || []).slice(0, 3);
      panels.push({
        id: "parity",
        title: "Put-Call Parity & Arbitrage",
        summary: `${parityData.arbitrage_count} arbitrage opportunities (>${parityData.threshold}pt threshold) across ${parityData.total_strikes} strikes. Top: ${topOpps.map((o: any) => `strike ${o.strike}: ${o.mispricing}pts ${o.signal}`).join("; ")}.`,
      });
    }
    if (pcrData) {
      const lastPcr = pcrData.pcr_oi?.[pcrData.pcr_oi.length - 1];
      const firstPcr = pcrData.pcr_oi?.[0];
      panels.push({
        id: "pcr",
        title: "Put-Call Ratio",
        summary: `PCR (OI) moved from ${firstPcr?.toFixed(2)} to ${lastPcr?.toFixed(2)} over ${pcrData.datetime?.length} snapshots. ${lastPcr > 1 ? "Bearish bias (PCR > 1)." : lastPcr < 0.7 ? "Bullish bias (PCR < 0.7)." : "Neutral range."}`,
      });
    }
    if (oiData) {
      const maxCeIdx = oiData.oi_CE.indexOf(Math.max(...oiData.oi_CE));
      const maxPeIdx = oiData.oi_PE.indexOf(Math.max(...oiData.oi_PE));
      panels.push({
        id: "oi",
        title: "Open Interest by Strike",
        summary: `Highest CE OI at strike ${oiData.strikes[maxCeIdx]} (${oiData.oi_CE[maxCeIdx].toLocaleString()}). Highest PE OI at strike ${oiData.strikes[maxPeIdx]} (${oiData.oi_PE[maxPeIdx].toLocaleString()}). Total strikes: ${oiData.strikes.length}.`,
      });
    }
    if (oiChangeData) {
      panels.push({
        id: "oiChange",
        title: "OI Change Over Time",
        summary: `OI change tracked over ${oiChangeData.datetime?.length || 0} snapshots. Tracks CE and PE open interest delta to detect buildup/unwinding patterns.`,
      });
    }

    if (panels.length > 0) fetchInferences(panels);
  }, [anomalyData, greeksData, parityData, pcrData, oiData, oiChangeData, fetchInferences]);

  useEffect(() => {
    if (anomalyData && pcrData && oiData) {
      requestInferences();
    }
  }, [anomalyData, pcrData, oiData, requestInferences]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-(--bg) text-sm font-sans">
      <Nav />
      <main className="flex-1 p-2 w-full flex flex-col gap-2 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-2 py-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Terminal</h1>
            {overview && (
              <span className="text-(--muted) text-xs font-medium">
                {overview.symbols.join(", ")} · {overview.total_rows.toLocaleString()} pts
              </span>
            )}
          </div>
          {overview && (
            <div className="relative">
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="appearance-none bg-(--card) border border-(--border) rounded-md px-3 py-1.5 pr-7 hover:border-(--ring) text-(--fg) cursor-pointer outline-none text-xs"
              >
                {overview.expiries.map((e) => (
                  <option key={e} value={e} className="bg-(--bg)">
                    {e}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-(--muted)" />
            </div>
          )}
        </div>

        {/* Main resizable layout */}
        <PanelGroup orientation="horizontal" defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged} className="flex-1 min-h-0">
          {/* Left Panel: Candlestick Chart */}
          <Panel defaultSize={55} minSize={30}>
            <div className="h-full flex flex-col gap-2">
              {candleData ? (
                <ChartCard
                  title="NIFTY Spot / Candles"
                  className="flex-1"
                  headerRight={
                    <div className="flex items-center gap-1">
                      {["15T", "30T", "1H", "1D"].map((iv) => (
                        <button
                          key={iv}
                          onClick={() => setCandleInterval(iv)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                            candleInterval === iv
                              ? "bg-(--border) text-(--fg)"
                              : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
                          }`}
                        >
                          {iv === "15T" ? "15m" : iv === "30T" ? "30m" : iv}
                        </button>
                      ))}
                    </div>
                  }
                >
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
                          inference: p.inference,
                        }))}
                      />
                    </div>
                  </div>
                </ChartCard>
              ) : (
                <ChartCardSkeleton className="flex-1" />
              )}
            </div>
          </Panel>

          <ResizeHandle />

          {/* Right Panel: Tabbed panels */}
          <Panel defaultSize={45} minSize={25}>
            <div className="h-full flex flex-col gap-2">
              {/* Tabs */}
              <div className="flex gap-1 shrink-0 px-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = rightPanelTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setRightPanelTab(tab.key as any)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                        active
                          ? "bg-(--border) text-(--fg)"
                          : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
                      }`}
                    >
                      <Icon size={12} strokeWidth={active ? 2 : 1.5} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Panel content - resizable vertical panels per tab */}
              <div className="flex-1 min-h-0">
                {rightPanelTab === "overview" && (
                  <PanelGroup orientation="vertical" defaultLayout={overviewLayout.defaultLayout} onLayoutChanged={overviewLayout.onLayoutChanged} className="h-full">
                    <Panel defaultSize={30} minSize={15} id="ov-row1">
                      <ChartRow>
                        {spotData ? (
                          <ChartCard title="Spot & ATM" className="flex-1">
                            <div className="absolute inset-0">
                              <SpotChart data={spotData} height="100%" />
                            </div>
                          </ChartCard>
                        ) : (
                          <ChartCardSkeleton className="flex-1" />
                        )}
                        {pcrData ? (
                          <ChartCard title="PCR" className="flex-1" insight={insights.pcr} insightLoading={insightsLoading}>
                            <div className="absolute inset-0">
                              <PCRChart data={pcrData} height="100%" />
                            </div>
                          </ChartCard>
                        ) : (
                          <ChartCardSkeleton className="flex-1" />
                        )}
                      </ChartRow>
                    </Panel>
                    <ResizeHandle direction="vertical" />
                    <Panel defaultSize={30} minSize={15} id="ov-row2">
                      <ChartRow>
                        {oiData ? (
                          <ChartCard title="OI by Strike" className="flex-1" insight={insights.oi} insightLoading={insightsLoading}>
                            <div className="absolute inset-0">
                              <OIByStrikeChart data={oiData} height="100%" />
                            </div>
                          </ChartCard>
                        ) : (
                          <ChartCardSkeleton className="flex-1" />
                        )}
                        {volumeData ? (
                          <ChartCard title="Vol by Strike" className="flex-1">
                            <div className="absolute inset-0">
                              <VolumeByStrikeChart data={volumeData} height="100%" />
                            </div>
                          </ChartCard>
                        ) : (
                          <ChartCardSkeleton className="flex-1" />
                        )}
                      </ChartRow>
                    </Panel>
                    <ResizeHandle direction="vertical" />
                    <Panel defaultSize={40} minSize={15} id="ov-row3">
                      <ChartRow>
                        {oiChangeData ? (
                          <ChartCard title="OI Change" className="flex-1" insight={insights.oiChange} insightLoading={insightsLoading}>
                            <div className="absolute inset-0">
                              <OIChangeChart data={oiChangeData} height="100%" />
                            </div>
                          </ChartCard>
                        ) : (
                          <ChartCardSkeleton className="flex-1" />
                        )}
                        <ChartCard title="" className="flex-1">
                          <div className="flex items-center justify-between mb-1.5 shrink-0">
                            <h3 className="font-mono text-(--muted) text-[11px] uppercase tracking-wider">
                              Activity Heatmap
                            </h3>
                            <div className="flex items-center gap-1">
                              {([
                                { key: "oi_CE", label: "OI CE" },
                                { key: "oi_PE", label: "OI PE" },
                                { key: "volume_CE", label: "Vol CE" },
                                { key: "volume_PE", label: "Vol PE" },
                              ] as const).map((m) => (
                                <button
                                  key={m.key}
                                  onClick={() => setHeatmapMetric(m.key)}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                                    heatmapMetric === m.key
                                      ? "bg-(--border) text-(--fg)"
                                      : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1 min-h-0 relative">
                            <div className="absolute inset-0">
                              {heatmapData?.data?.length ? (
                                <ActivityHeatmap
                                  data={heatmapData.data}
                                  atm={heatmapData.atm}
                                  label={heatmapMetric.startsWith("oi") ? "OI" : "Volume"}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full">
                                  <div className="skeleton w-full h-full rounded" />
                                </div>
                              )}
                            </div>
                          </div>
                        </ChartCard>
                      </ChartRow>
                    </Panel>
                  </PanelGroup>
                )}

                {rightPanelTab === "greeks" && (
                  <PanelGroup orientation="vertical" defaultLayout={greeksLayout.defaultLayout} onLayoutChanged={greeksLayout.onLayoutChanged} className="h-full">
                    <Panel defaultSize={50} minSize={20} id="gk-row1">
                      <ChartRow>
                        <ChartCard title="ATM Greeks" className="flex-1" insight={insights.greeks} insightLoading={insightsLoading}>
                          {greeksData ? (
                            <GreeksSummary data={greeksData} />
                          ) : (
                            <div className="skeleton h-full min-h-15" />
                          )}
                        </ChartCard>
                        <ChartCard title="IV Smile" className="flex-1" insight={insights.ivSmile} insightLoading={insightsLoading}>
                          {greeksData ? (
                            <div className="absolute inset-0">
                              <IVSmileChart data={greeksData} height="100%" />
                            </div>
                          ) : (
                            <div className="skeleton h-full min-h-15" />
                          )}
                        </ChartCard>
                      </ChartRow>
                    </Panel>
                    <ResizeHandle direction="vertical" />
                    <Panel defaultSize={50} minSize={20} id="gk-row2">
                      <ChartRow>
                        <ChartCard title="Arbitrage" className="flex-1" insight={insights.parity} insightLoading={insightsLoading}>
                          {parityData ? (
                            <ParityList data={parityData} />
                          ) : (
                            <div className="skeleton h-full min-h-15" />
                          )}
                        </ChartCard>
                        <ChartCard title="Mispricing" className="flex-1">
                          {parityData ? (
                            <div className="absolute inset-0">
                              <MispricingChart data={parityData} height="100%" />
                            </div>
                          ) : (
                            <div className="skeleton h-full min-h-15" />
                          )}
                        </ChartCard>
                      </ChartRow>
                    </Panel>
                  </PanelGroup>
                )}

                {rightPanelTab === "ml" && (
                  <PanelGroup orientation="vertical" defaultLayout={mlLayout.defaultLayout} onLayoutChanged={mlLayout.onLayoutChanged} className="h-full">
                    <Panel defaultSize={50} minSize={20} id="ml-row1">
                      <ChartCard title="Anomalies" className="h-full" insight={insights.anomalies} insightLoading={insightsLoading}>
                        {anomalyData ? (
                          <AnomalyList anomalies={anomalyData?.anomalies} />
                        ) : (
                          <div className="skeleton h-full min-h-15" />
                        )}
                      </ChartCard>
                    </Panel>
                    <ResizeHandle direction="vertical" />
                    <Panel defaultSize={50} minSize={20} id="ml-row2">
                      {anomalyData ? (
                        <ChartCard title="Anomaly Score" className="h-full">
                          <div className="absolute inset-0">
                            <AnomalyTimeline data={anomalyData} height="100%" />
                          </div>
                        </ChartCard>
                      ) : (
                        <ChartCardSkeleton className="h-full" />
                      )}
                    </Panel>
                  </PanelGroup>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}