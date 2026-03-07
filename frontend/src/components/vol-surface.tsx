"use client";

import { useMemo, useRef, useState, useEffect } from "react";

type SurfacePoint = {
  datetime: string;
  strike: number;
  T_days: number;
  iv_CE: number | null;
  iv_PE: number | null;
};

type Props = {
  data: SurfacePoint[];
  mode: "CE" | "PE";
  atm?: number;
};

function interpolateColor(t: number): string {
  // Cool-to-hot: deep blue -> cyan -> green -> yellow -> red
  const stops = [
    [15, 23, 65],    // deep navy
    [20, 80, 160],   // blue
    [20, 160, 160],  // cyan
    [40, 180, 60],   // green
    [220, 200, 20],  // yellow
    [220, 80, 20],   // orange
    [180, 20, 20],   // red
  ];
  const idx = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = idx - lo;
  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f);
  return `rgb(${r},${g},${b})`;
}

export function VolSurface({ data, mode, atm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 300 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    strike: number;
    time: string;
    iv: number;
    tDays: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setDims({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { grid, strikes, times, minIV, maxIV } = useMemo(() => {
    const key = mode === "CE" ? "iv_CE" : "iv_PE";
    const valid = data.filter((d) => d[key] != null);
    if (valid.length === 0) return { grid: [], strikes: [], times: [], minIV: 0, maxIV: 1 };

    const strikeSet = new Set(valid.map((d) => d.strike));
    const timeSet = new Set(valid.map((d) => d.datetime));
    const sortedStrikes = Array.from(strikeSet).sort((a, b) => a - b);
    const sortedTimes = Array.from(timeSet).sort();

    let min = Infinity, max = -Infinity;
    const map = new Map<string, number>();
    for (const d of valid) {
      const iv = d[key]!;
      map.set(`${d.datetime}|${d.strike}`, iv);
      if (iv < min) min = iv;
      if (iv > max) max = iv;
    }

    const gridData: { strike: number; time: string; iv: number; tDays: number; ti: number; si: number }[] = [];
    for (let ti = 0; ti < sortedTimes.length; ti++) {
      for (let si = 0; si < sortedStrikes.length; si++) {
        const iv = map.get(`${sortedTimes[ti]}|${sortedStrikes[si]}`);
        if (iv != null) {
          const point = valid.find((d) => d.datetime === sortedTimes[ti] && d.strike === sortedStrikes[si]);
          gridData.push({
            strike: sortedStrikes[si],
            time: sortedTimes[ti],
            iv,
            tDays: point?.T_days ?? 0,
            ti,
            si,
          });
        }
      }
    }

    return { grid: gridData, strikes: sortedStrikes, times: sortedTimes, minIV: min, maxIV: max };
  }, [data, mode]);

  if (grid.length === 0) return <div className="text-(--muted) text-center py-8 text-[11px]">No IV surface data</div>;

  const margin = { top: 10, right: 70, bottom: 36, left: 50 };
  const { width, height } = dims;
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cellW = plotW / times.length;
  const cellH = plotH / strikes.length;

  // Scale bar dimensions
  const scaleW = 12;
  const scaleH = plotH;
  const scaleX = width - margin.right + 16;
  const scaleSteps = 50;

  // X-axis: show every Nth label
  const xLabelStep = Math.max(1, Math.floor(times.length / 8));
  // Y-axis: show every Nth label
  const yLabelStep = Math.max(1, Math.floor(strikes.length / 10));

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const scaleX2 = width / rect.width;
          const scaleY = height / rect.height;
          const svgX = mx * scaleX2;
          const svgY = my * scaleY;
          const ti = Math.floor((svgX - margin.left) / cellW);
          const si = Math.floor((svgY - margin.top) / cellH);
          if (ti >= 0 && ti < times.length && si >= 0 && si < strikes.length) {
            const point = grid.find((g) => g.ti === ti && g.si === si);
            if (point) {
              setTooltip({ x: mx, y: my, strike: point.strike, time: point.time, iv: point.iv, tDays: point.tDays });
              return;
            }
          }
          setTooltip(null);
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Cells */}
        {grid.map((g, i) => {
          const t = maxIV > minIV ? (g.iv - minIV) / (maxIV - minIV) : 0.5;
          return (
            <rect
              key={i}
              x={margin.left + g.ti * cellW}
              y={margin.top + g.si * cellH}
              width={cellW + 0.5}
              height={cellH + 0.5}
              fill={interpolateColor(t)}
            />
          );
        })}

        {/* ATM line */}
        {atm && strikes.includes(atm) && (
          <line
            x1={margin.left}
            x2={margin.left + plotW}
            y1={margin.top + strikes.indexOf(atm) * cellH + cellH / 2}
            y2={margin.top + strikes.indexOf(atm) * cellH + cellH / 2}
            stroke="white"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.5}
          />
        )}

        {/* X-axis labels (time) */}
        {times.map((t, i) => {
          if (i % xLabelStep !== 0) return null;
          return (
            <text
              key={i}
              x={margin.left + i * cellW + cellW / 2}
              y={height - margin.bottom + 14}
              fill="var(--muted)"
              fontSize={8}
              textAnchor="middle"
              fontFamily="monospace"
            >
              {t.slice(5, 16)}
            </text>
          );
        })}

        {/* Y-axis labels (strikes) */}
        {strikes.map((s, i) => {
          if (i % yLabelStep !== 0) return null;
          return (
            <text
              key={i}
              x={margin.left - 6}
              y={margin.top + i * cellH + cellH / 2 + 3}
              fill="var(--muted)"
              fontSize={8}
              textAnchor="end"
              fontFamily="monospace"
            >
              {s}
            </text>
          );
        })}

        {/* X-axis title */}
        <text
          x={margin.left + plotW / 2}
          y={height - 4}
          fill="var(--muted)"
          fontSize={9}
          textAnchor="middle"
          fontFamily="monospace"
        >
          Time
        </text>

        {/* Y-axis title */}
        <text
          x={12}
          y={margin.top + plotH / 2}
          fill="var(--muted)"
          fontSize={9}
          textAnchor="middle"
          fontFamily="monospace"
          transform={`rotate(-90, 12, ${margin.top + plotH / 2})`}
        >
          Strike
        </text>

        {/* Color scale bar */}
        {Array.from({ length: scaleSteps }, (_, i) => {
          const t = i / (scaleSteps - 1);
          return (
            <rect
              key={i}
              x={scaleX}
              y={margin.top + (1 - t) * scaleH - scaleH / scaleSteps}
              width={scaleW}
              height={scaleH / scaleSteps + 0.5}
              fill={interpolateColor(t)}
            />
          );
        })}
        <text x={scaleX + scaleW + 4} y={margin.top + 6} fill="var(--muted)" fontSize={8} fontFamily="monospace">
          {maxIV.toFixed(0)}%
        </text>
        <text x={scaleX + scaleW + 4} y={margin.top + scaleH} fill="var(--muted)" fontSize={8} fontFamily="monospace">
          {minIV.toFixed(0)}%
        </text>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 text-[11px] font-mono rounded border px-2 py-1.5"
          style={{
            left: Math.min(tooltip.x + 12, width - 140),
            top: Math.max(tooltip.y - 60, 0),
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="text-(--muted)">{tooltip.time.slice(0, 16)}</div>
          <div>Strike: <span className="text-(--fg)">{tooltip.strike}</span></div>
          <div>IV: <span className="text-(--fg)">{tooltip.iv.toFixed(1)}%</span></div>
          <div className="text-(--muted)">{tooltip.tDays.toFixed(1)}d to exp</div>
        </div>
      )}
    </div>
  );
}
