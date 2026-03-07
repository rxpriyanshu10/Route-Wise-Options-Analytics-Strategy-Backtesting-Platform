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
        <div className="flex items-center gap-4 text-[11px] font-mono text-(--muted)">
          <span>
            SPOT <span className="text-(--fg)">{data.spot?.toFixed(2)}</span>
          </span>
          <span>
            ATM <span className="text-(--fg)">{data.atm}</span>
          </span>
          <span>{data.datetime}</span>
        </div>
        <button
          onClick={() => setShowGreeks(!showGreeks)}
          className="text-[11px] font-mono px-2 py-0.5 border border-(--border) rounded text-(--muted) hover:text-(--fg) hover:border-(--muted) transition-colors"
        >
          {showGreeks ? "Hide Greeks" : "Show Greeks"}
        </button>
      </div>

      <div className="overflow-x-auto border border-(--border) rounded">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="text-(--muted) uppercase tracking-widest">
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-1.5 px-2 border-b border-r border-(--border) bg-[#0d1f0d]/30 text-green-500/70">
                Calls
              </th>
              <th className="py-1.5 px-2 border-b border-(--border) bg-(--card)">
                Strike
              </th>
              <th colSpan={showGreeks ? 6 : 4} className="text-center py-1.5 px-2 border-b border-l border-(--border) bg-[#1f0d0d]/30 text-red-500/70">
                Puts
              </th>
            </tr>
            <tr className="text-(--muted) border-b border-(--border)">
              {showGreeks && <th className="py-1 px-1.5 text-right">Delta</th>}
              <th className="py-1 px-1.5 text-right">IV%</th>
              <th className="py-1 px-1.5 text-right">Vol</th>
              <th className="py-1 px-1.5 text-right">OI</th>
              <th className="py-1 px-1.5 text-right border-r border-(--border)">Price</th>
              {showGreeks && <th className="py-1 px-1.5 text-right border-r border-(--border)">Gamma</th>}
              <th className="py-1 px-2 text-center bg-(--card)">Strike</th>
              {showGreeks && <th className="py-1 px-1.5 text-left border-l border-(--border)">Theta</th>}
              <th className="py-1 px-1.5 text-left border-l border-(--border)">Price</th>
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
                  className={`border-b border-(--border) hover:bg-(--card) transition-colors ${
                    isATM ? "bg-(--card)" : ""
                  }`}
                >
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-right text-(--muted)">
                      {fmt(row.ce_delta, 3)}
                    </td>
                  )}
                  <td className="py-1 px-1.5 text-right text-(--muted)">
                    {fmt(row.ce_iv, 1)}
                  </td>
                  <td className="py-1 px-1.5 text-right text-(--muted)">
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
                    className={`py-1 px-1.5 text-right border-r border-(--border) font-medium ${
                      isITM_CE ? "text-green-400" : "text-(--fg)"
                    }`}
                  >
                    {fmt(row.ce_price)}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-right text-(--muted) border-r border-(--border)">
                      {fmt(row.gamma, 4)}
                    </td>
                  )}
                  <td
                    className={`py-1 px-2 text-center font-semibold bg-(--card) ${
                      isATM
                        ? "text-yellow-400"
                        : "text-(--fg)"
                    }`}
                  >
                    {row.strike}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-left text-(--muted) border-l border-(--border)">
                      {fmt(row.theta, 2)}
                    </td>
                  )}
                  <td
                    className={`py-1 px-1.5 text-left border-l border-(--border) font-medium ${
                      isITM_PE ? "text-red-400" : "text-(--fg)"
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
                  <td className="py-1 px-1.5 text-left text-(--muted)">
                    {fmtInt(row.pe_volume)}
                  </td>
                  <td className="py-1 px-1.5 text-left text-(--muted)">
                    {fmt(row.pe_iv, 1)}
                  </td>
                  {showGreeks && (
                    <td className="py-1 px-1.5 text-left text-(--muted)">
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
