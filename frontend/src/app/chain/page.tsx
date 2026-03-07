"use client";

import { useEffect, useState, useMemo } from "react";
import { Nav } from "@/components/nav";
import { fetchAPI } from "@/lib/api";
import { ChevronDown, ArrowUpDown, Minus, BarChart3, Layers } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { VolSurface } from "@/components/vol-surface";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";

type ChainRow = {
  strike: number;
  ce_price: number;
  ce_oi: number;
  ce_volume: number;
  ce_iv: number | null;
  ce_delta: number | null;
  ce_gamma: number | null;
  ce_theta: number | null;
  ce_vega: number | null;
  pe_price: number;
  pe_oi: number;
  pe_volume: number;
  pe_iv: number | null;
  pe_delta: number | null;
  pe_gamma: number | null;
  pe_theta: number | null;
  pe_vega: number | null;
};

type ChainData = {
  spot: number;
  atm: number;
  datetime: string;
  expiry: string;
  chain: ChainRow[];
};

type Overview = {
  expiries: string[];
  symbols: string[];
};

const CE_COLS = [
  { key: "ce_oi", label: "OI", format: "int" },
  { key: "ce_volume", label: "Volume", format: "int" },
  { key: "ce_iv", label: "IV", format: "pct" },
  { key: "ce_delta", label: "Delta", format: "dec4" },
  { key: "ce_gamma", label: "Gamma", format: "dec4" },
  { key: "ce_theta", label: "Theta", format: "dec2" },
  { key: "ce_vega", label: "Vega", format: "dec4" },
  { key: "ce_price", label: "LTP", format: "dec2" },
] as const;

const PE_COLS = [
  { key: "pe_price", label: "LTP", format: "dec2" },
  { key: "pe_vega", label: "Vega", format: "dec4" },
  { key: "pe_theta", label: "Theta", format: "dec2" },
  { key: "pe_gamma", label: "Gamma", format: "dec4" },
  { key: "pe_delta", label: "Delta", format: "dec4" },
  { key: "pe_iv", label: "IV", format: "pct" },
  { key: "pe_volume", label: "Volume", format: "int" },
  { key: "pe_oi", label: "OI", format: "int" },
] as const;

function fmt(value: number | null | undefined, format: string): string {
  if (value == null || (typeof value === "number" && isNaN(value))) return "-";
  switch (format) {
    case "int":
      return value >= 100000
        ? (value / 100000).toFixed(2) + "L"
        : value >= 1000
          ? (value / 1000).toFixed(1) + "K"
          : value.toLocaleString();
    case "pct":
      return value.toFixed(1) + "%";
    case "dec2":
      return value.toFixed(2);
    case "dec4":
      return value.toFixed(4);
    default:
      return String(value);
  }
}

function ResizeHandle() {
  return (
    <PanelResizeHandle
      className="group relative flex items-center justify-center h-1.5"
    >
      <div
        className="rounded-full bg-(--border) group-hover:bg-(--muted) group-data-resize-handle-active:bg-(--ring) transition-all duration-150 h-0.5 w-8 group-hover:w-12 group-hover:h-1"
      />
    </PanelResizeHandle>
  );
}

export default function ChainPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [expiry, setExpiry] = useState("");
  const [data, setData] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [strikeRange, setStrikeRange] = useState(10);
  const [showIV, setShowIV] = useState(true);
  const [showVolSurface, setShowVolSurface] = useState(false);
  const [volSurfaceMode, setVolSurfaceMode] = useState<"CE" | "PE">("CE");
  const [volSurfaceData, setVolSurfaceData] = useState<any>(null);

  useEffect(() => {
    fetchAPI("/api/overview").then((d) => {
      setOverview(d);
      if (d.expiries.length > 0) setExpiry(d.expiries[0]);
    });
  }, []);

  useEffect(() => {
    if (!expiry) return;
    setLoading(true);
    fetchAPI("/api/option-chain", { expiry })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
    fetchAPI("/api/iv-surface", { expiry })
      .then(setVolSurfaceData)
      .catch(console.error);
  }, [expiry]);

  const filteredChain = useMemo(() => {
    if (!data?.chain.length) return [];
    const atm = data.atm;
    const sorted = [...data.chain].sort((a, b) => a.strike - b.strike);
    const atmIdx = sorted.findIndex((r) => r.strike >= atm);
    const start = Math.max(0, atmIdx - strikeRange);
    const end = Math.min(sorted.length, atmIdx + strikeRange + 1);
    return sorted.slice(start, end);
  }, [data, strikeRange]);

  const totalCeOi = useMemo(() => filteredChain.reduce((s, r) => s + r.ce_oi, 0), [filteredChain]);
  const totalPeOi = useMemo(() => filteredChain.reduce((s, r) => s + r.pe_oi, 0), [filteredChain]);
  const pcr = totalCeOi > 0 ? (totalPeOi / totalCeOi).toFixed(2) : "-";

  const ivChartData = useMemo(() => {
    return filteredChain
      .filter((r) => r.ce_iv != null || r.pe_iv != null)
      .map((r) => ({
        strike: r.strike,
        "CE IV": r.ce_iv,
        "PE IV": r.pe_iv,
      }));
  }, [filteredChain]);

  const hasTopPanels = (showIV && data && ivChartData.length > 0) || (showVolSurface && data && volSurfaceData?.data?.length > 0);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-(--bg) text-xs">
      <Nav />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-(--border) shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold tracking-tight">Option Chain</h1>
            {data && (
              <div className="flex items-center gap-3 text-(--muted)">
                <span>
                  NIFTY <span className="text-(--fg) font-medium">{data.spot.toFixed(2)}</span>
                </span>
                <span className="text-(--border)">|</span>
                <span>
                  ATM <span className="text-(--fg) font-medium">{data.atm}</span>
                </span>
                <span className="text-(--border)">|</span>
                <span>
                  PCR <span className={`font-medium ${Number(pcr) > 1 ? "text-(--red)" : Number(pcr) < 0.7 ? "text-(--green)" : "text-(--fg)"}`}>{pcr}</span>
                </span>
                <span className="text-(--border)">|</span>
                <span>{data.datetime.slice(0, 16)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIV(!showIV)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                showIV ? "bg-(--border) text-(--fg)" : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
              }`}
            >
              <BarChart3 size={12} />
              IV Chart
            </button>
            <button
              onClick={() => setShowVolSurface(!showVolSurface)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                showVolSurface ? "bg-(--border) text-(--fg)" : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
              }`}
            >
              <Layers size={12} />
              Vol Surface
            </button>
            <div className="flex items-center gap-1.5 text-(--muted)">
              <ArrowUpDown size={12} />
              <select
                value={strikeRange}
                onChange={(e) => setStrikeRange(Number(e.target.value))}
                className="appearance-none bg-(--card) border border-(--border) rounded-md px-2 py-1 pr-6 hover:border-(--ring) text-(--fg) cursor-pointer outline-none"
              >
                {[5, 10, 15, 20, 30].map((n) => (
                  <option key={n} value={n} className="bg-(--bg)">{n} strikes</option>
                ))}
              </select>
            </div>
            {overview && (
              <div className="relative">
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="appearance-none bg-(--card) border border-(--border) rounded-md px-3 py-1 pr-7 hover:border-(--ring) text-(--fg) cursor-pointer outline-none"
                >
                  {overview.expiries.map((e) => (
                    <option key={e} value={e} className="bg-(--bg)">{e}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-(--muted)" />
              </div>
            )}
          </div>
        </div>

        {/* Resizable content area */}
        <PanelGroup orientation="vertical" className="flex-1 min-h-0">
          {hasTopPanels && (
            <>
              <Panel defaultSize={35} minSize={15} collapsible>
                <div className="h-full overflow-auto hidden-scrollbar">
                  {showIV && data && ivChartData.length > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[11px] font-mono uppercase tracking-widest text-(--muted)">Implied Volatility by Strike</h3>
                        <div className="flex items-center gap-4 text-[11px] font-mono">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-0.5 rounded bg-[#22c55e]" /> CE IV
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-0.5 rounded bg-[#ef4444]" /> PE IV
                          </span>
                        </div>
                      </div>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={ivChartData} margin={{ top: 4, right: 12, bottom: 0, left: -16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="strike" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} unit="%" domain={["auto", "auto"]} />
                            <Tooltip
                              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}
                              labelStyle={{ color: "var(--muted)" }}
                              formatter={(value: number) => value?.toFixed(1) + "%"}
                            />
                            <ReferenceLine x={data.atm} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "ATM", position: "top", fill: "var(--muted)", fontSize: 9 }} />
                            <Line type="monotone" dataKey="CE IV" stroke="#22c55e" dot={{ r: 2, fill: "#22c55e", strokeWidth: 0 }} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                            <Line type="monotone" dataKey="PE IV" stroke="#ef4444" dot={{ r: 2, fill: "#ef4444", strokeWidth: 0 }} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {showVolSurface && data && volSurfaceData?.data?.length > 0 && (
                    <div className="px-4 py-3 border-t border-(--border)">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[11px] font-mono uppercase tracking-widest text-(--muted)">Volatility Surface</h3>
                        <div className="flex items-center gap-1">
                          {(["CE", "PE"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setVolSurfaceMode(m)}
                              className={`px-2.5 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                                volSurfaceMode === m ? "bg-(--border) text-(--fg)" : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
                              }`}
                            >{m}</button>
                          ))}
                        </div>
                      </div>
                      <div className="h-60">
                        <VolSurface data={volSurfaceData.data} mode={volSurfaceMode} atm={data.atm} />
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
              <ResizeHandle />
            </>
          )}

          <Panel defaultSize={hasTopPanels ? 65 : 100} minSize={30}>
            <div className="h-full overflow-auto hidden-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-2">
                    <div className="skeleton w-48 h-3" />
                    <div className="skeleton w-32 h-3" />
                  </div>
                </div>
              ) : !data?.chain.length ? (
                <div className="flex items-center justify-center h-full text-(--muted)">No data available</div>
              ) : (
                <table className="w-full border-collapse text-[11px] font-mono">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-(--bg)">
                      <th colSpan={CE_COLS.length} className="text-center py-1.5 text-[11px] uppercase tracking-widest font-medium text-(--blue) border-b border-(--border)">Calls</th>
                      <th className="border-b border-(--border) bg-(--bg)" />
                      <th colSpan={PE_COLS.length} className="text-center py-1.5 text-[11px] uppercase tracking-widest font-medium text-(--red) border-b border-(--border)">Puts</th>
                    </tr>
                    <tr className="bg-(--card) border-b border-(--border)">
                      {CE_COLS.map((col) => (
                        <th key={col.key} className="px-2 py-1.5 text-right text-[9px] uppercase tracking-wider text-(--muted) font-medium">{col.label}</th>
                      ))}
                      <th className="px-3 py-1.5 text-center text-[9px] uppercase tracking-wider text-(--fg) font-semibold bg-(--border) min-w-[72px]">Strike</th>
                      {PE_COLS.map((col) => (
                        <th key={col.key} className="px-2 py-1.5 text-right text-[9px] uppercase tracking-wider text-(--muted) font-medium">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChain.map((row) => {
                      const isATM = row.strike === data.atm;
                      const isITMCall = row.strike < data.spot;
                      const isITMPut = row.strike > data.spot;
                      return (
                        <tr key={row.strike} className={`border-b border-(--border) transition-colors hover:bg-(--card-hover) ${isATM ? "bg-[#27272a]/60" : ""}`}>
                          {CE_COLS.map((col) => {
                            const val = row[col.key as keyof ChainRow] as number | null;
                            return (
                              <td key={col.key} className={`px-2 py-1.5 text-right tabular-nums ${isITMCall ? "bg-(--blue)/[0.04]" : ""} ${col.key === "ce_price" ? "text-(--fg) font-medium" : "text-(--accent)"}`}>
                                {val != null ? fmt(val, col.format) : <Minus size={10} className="inline text-(--border)" />}
                              </td>
                            );
                          })}
                          <td className={`px-3 py-1.5 text-center font-semibold tabular-nums ${isATM ? "bg-(--amber)/10 text-(--amber)" : "bg-(--border)/40 text-(--fg)"}`}>{row.strike}</td>
                          {PE_COLS.map((col) => {
                            const val = row[col.key as keyof ChainRow] as number | null;
                            return (
                              <td key={col.key} className={`px-2 py-1.5 text-right tabular-nums ${isITMPut ? "bg-(--red)/[0.04]" : ""} ${col.key === "pe_price" ? "text-(--fg) font-medium" : "text-(--accent)"}`}>
                                {val != null ? fmt(val, col.format) : <Minus size={10} className="inline text-(--border)" />}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0">
                    <tr className="bg-(--card) border-t border-(--border) font-medium">
                      {CE_COLS.map((col) => (
                        <td key={col.key} className="px-2 py-2 text-right tabular-nums">
                          {col.key === "ce_oi" ? <span className="text-(--blue)">{fmt(totalCeOi, "int")}</span>
                            : col.key === "ce_volume" ? <span className="text-(--muted)">{fmt(filteredChain.reduce((s, r) => s + r.ce_volume, 0), "int")}</span>
                            : ""}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center text-[9px] uppercase tracking-wider text-(--muted) bg-(--border)/40">Total</td>
                      {PE_COLS.map((col) => (
                        <td key={col.key} className="px-2 py-2 text-right tabular-nums">
                          {col.key === "pe_oi" ? <span className="text-(--red)">{fmt(totalPeOi, "int")}</span>
                            : col.key === "pe_volume" ? <span className="text-(--muted)">{fmt(filteredChain.reduce((s, r) => s + r.pe_volume, 0), "int")}</span>
                            : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
