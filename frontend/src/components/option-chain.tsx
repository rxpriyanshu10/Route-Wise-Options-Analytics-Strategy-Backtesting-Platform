"use client";

import { useMemo, useState } from "react";

type ChainRow = {
  strike: number;
  ce_price: number;
  ce_oi: number;
  ce_volume: number;
  ce_iv: number | null;
  ce_delta: number | null;
  pe_price: number;
  pe_oi: number;
  pe_volume: number;
  pe_iv: number | null;
  pe_delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
};

type OptionChainData = {
  spot: number;
  atm: number;
  datetime: string;
  expiry: string;
  chain: ChainRow[];
};

const fmt = (v: number | null, decimals = 2) =>
  v == null ? "—" : v.toFixed(decimals);

const fmtInt = (v: number) => v.toLocaleString();

export function OptionChainTable({ data }: { data: OptionChainData }) {
  const [showGreeks, setShowGreeks] = useState(false);

  const maxOI = useMemo(() => {
    let max = 0;
    for (const r of data.chain) {
      if (r.ce_oi > max) max = r.ce_oi;
      if (r.pe_oi > max) max = r.pe_oi;
    }
    return max;
  }, [data.chain]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--muted)]">
          <span>
            SPOT <span className="text-[var(--fg)]">{data.spot?.toFixed(2)}</span>
          </span>
          <span>
            ATM <span className="text-[var(--fg)]">{data.atm}</span>
          </span>
          <span>{data.datetime}</span>
        </div>
        <button
          onClick={() => setShowGreeks(!showGreeks)}
          className="text-[10px] font-mono px-2 py-0.5 border border-[var(--border)] rounded text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--muted)] transition-colors"
        >
          {showGreeks ? "Hide Greeks" : "Show Greeks"}
        </button>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] rounded">
        <table className="w-full text-[10px] font-mono border-collapse">
          <thead>
            <tr className="text-[var(--muted)] uppercase tracking-widest">
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-1.5 px-2 border-b border-r border-[var(--border)] bg-[#0d1f0d]/30 text-green-500/70">
                Calls
              </th>
              <th className="py-1.5 px-2 border-b border-[var(--border)] bg-[var(--card)]">
                Strike
              </th>
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-1.5 px-2 border-b border-l border-[var(--border)] bg-[#1f0d0d]/30 text-red-500/70">
                Puts
              </th>
            </tr>
            <tr className="text-[var(--muted)] border-b border-[var(--border)]">
              {showGreeks && <th className="py-1 px-1.5 text-right">Delta</th>}
              <th className="py-1 px-1.5 text-right">IV%</th>
              <th className="py-1 px-1.5 text-right">Vol</th>
              <th className="py-1 px-1.5 text-right">OI</th>
              <th className="py-1 px-1.5 text-right border-r border-[var(--border)]">Price</th>
              {showGreeks && <th className="py-1 px-1.5 text-right border-r border-[var(--border)]">Gamma</th>}
              <th className="py-1 px-2 text-center bg-[var(--card)]">Strike</th>
              {showGreeks && <th className="py-1 px-1.5 text-left border-l border-[var(--border)]">Theta</th>}
              <th className="py-1 px-1.5 text-left border-l border-[var(--border)]">Price</th>
              <th className="py-1 px-1.5 text-left">OI</th>
              <th className="py-1 px-1.5 text-left">Vol</th>
              <th className="py-1 px-1.5 text-left">IV%</th>
              {showGreeks && <th className="py-1 px-1.5 text-left">Delta</th>}
            </tr>
          </thead>
          <tbody>
            {data.chain.map((row) => {
              const isATM = row.strike === data.atm;
              const isITM_CE = row.strike < data.spot;
              const isITM_PE = row.strike > data.spot;
              const ceOIBar = maxOI > 0 ? (row.ce_oi / maxOI) * 100 : 0;
              const peOIBar = maxOI > 0 ? (row.pe_oi / maxOI) * 100 : 0;

              return (
                <tr
                  key={row.strike}
                  className={`border-b border-[var(--border)] hover:bg-[var(--card)] transition-colors ${
                    isATM ? "bg-[var(--card)]" : ""
                  }`}
                >
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-right text-[var(--muted)]">
                      {fmt(row.ce_delta, 3)}
                    </td>
                  )}
                  <td className="py-1 px-1.5 text-right text-[var(--muted)]">
                    {fmt(row.ce_iv, 1)}
                  </td>
                  <td className="py-1 px-1.5 text-right text-[var(--muted)]">
                    {fmtInt(row.ce_volume)}
                  </td>
                  <td className="py-1 px-1.5 text-right relative">
                    <div
                      className="absolute inset-y-0 right-0 bg-green-500/10"
                      style={{ width: `${ceOIBar}%` }}
                    />
                    <span className="relative">{fmtInt(row.ce_oi)}</span>
                  </td>
                  <td
                    className={`py-1 px-1.5 text-right border-r border-[var(--border)] font-medium ${
                      isITM_CE ? "text-green-400" : "text-[var(--fg)]"
                    }`}
                  >
                    {fmt(row.ce_price)}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-right text-[var(--muted)] border-r border-[var(--border)]">
                      {fmt(row.gamma, 4)}
                    </td>
                  )}
                  <td
                    className={`py-1 px-2 text-center font-semibold bg-[var(--card)] ${
                      isATM
                        ? "text-yellow-400"
                        : "text-[var(--fg)]"
                    }`}
                  >
                    {row.strike}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-left text-[var(--muted)] border-l border-[var(--border)]">
                      {fmt(row.theta, 2)}
                    </td>
                  )}
                  <td
                    className={`py-1 px-1.5 text-left border-l border-[var(--border)] font-medium ${
                      isITM_PE ? "text-red-400" : "text-[var(--fg)]"
                    }`}
                  >
                    {fmt(row.pe_price)}
                  </td>
                  <td className="py-1 px-1.5 text-left relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-red-500/10"
                      style={{ width: `${peOIBar}%` }}
                    />
                    <span className="relative">{fmtInt(row.pe_oi)}</span>
                  </td>
                  <td className="py-1 px-1.5 text-left text-[var(--muted)]">
                    {fmtInt(row.pe_volume)}
                  </td>
                  <td className="py-1 px-1.5 text-left text-[var(--muted)]">
                    {fmt(row.pe_iv, 1)}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-left text-[var(--muted)]">
                      {fmt(row.pe_delta, 3)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
