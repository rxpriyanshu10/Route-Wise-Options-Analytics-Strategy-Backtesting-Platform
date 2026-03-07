"use client";

import { useMemo, useRef, useState, useEffect } from "react";

type HeatmapPoint = {
  datetime: string;
  strike: number;
  value: number;
};

type Props = {
  data: HeatmapPoint[];
  atm?: number;
  label?: string;
  unit?: string;
};

function interpolateColor(t: number): string {
  // Dark-to-bright: black -> purple -> blue -> cyan -> green -> yellow
  const stops = [
    [10, 10, 20],
    [30, 15, 80],
    [20, 60, 160],
    [20, 140, 160],
    [40, 180, 80],
    [180, 200, 40],
    [240, 230, 60],
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

function fmtValue(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

export function ActivityHeatmap({ data, atm, label = "Value", unit = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 300 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    strike: number;
    time: string;
    value: number;
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

  const { grid, strikes, times, minVal, maxVal } = useMemo(() => {
    if (data.length === 0) return { grid: [], strikes: [], times: [], minVal: 0, maxVal: 1 };

    const strikeSet = new Set(data.map((d) => d.strike));
    const timeSet = new Set(data.map((d) => d.datetime));
    const sortedStrikes = Array.from(strikeSet).sort((a, b) => a - b);
    const sortedTimes = Array.from(timeSet).sort();

    let min = Infinity, max = -Infinity;
    const map = new Map<string, number>();
    for (const d of data) {
      map.set(`${d.datetime}|${d.strike}`, d.value);
      if (d.value < min) min = d.value;
      if (d.value > max) max = d.value;
    }

    const gridData: { strike: number; time: string; value: number; ti: number; si: number }[] = [];
    for (let ti = 0; ti < sortedTimes.length; ti++) {
      for (let si = 0; si < sortedStrikes.length; si++) {
        const val = map.get(`${sortedTimes[ti]}|${sortedStrikes[si]}`);
        if (val != null) {
          gridData.push({ strike: sortedStrikes[si], time: sortedTimes[ti], value: val, ti, si });
        }
      }
    }

    return { grid: gridData, strikes: sortedStrikes, times: sortedTimes, minVal: min, maxVal: max };
  }, [data]);

  if (grid.length === 0) return <div className="text-(--muted) text-center py-8 text-[11px]">No heatmap data</div>;

  const margin = { top: 10, right: 70, bottom: 36, left: 50 };
  const { width, height } = dims;
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cellW = plotW / times.length;
  const cellH = plotH / strikes.length;

  const scaleW = 12;
  const scaleH = plotH;
  const scaleX = width - margin.right + 16;
  const scaleSteps = 50;

  const xLabelStep = Math.max(1, Math.floor(times.length / 8));
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
          const sx = width / rect.width;
          const sy = height / rect.height;
          const svgX = mx * sx;
          const svgY = my * sy;
          const ti = Math.floor((svgX - margin.left) / cellW);
          const si = Math.floor((svgY - margin.top) / cellH);
          if (ti >= 0 && ti < times.length && si >= 0 && si < strikes.length) {
            const point = grid.find((g) => g.ti === ti && g.si === si);
            if (point) {
              setTooltip({ x: mx, y: my, strike: point.strike, time: point.time, value: point.value });
              return;
            }
          }
          setTooltip(null);
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {grid.map((g, i) => {
          const t = maxVal > minVal ? (g.value - minVal) / (maxVal - minVal) : 0.5;
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

        {times.map((t, i) => {
          if (i % xLabelStep !== 0) return null;
          return (
            <text key={i} x={margin.left + i * cellW + cellW / 2} y={height - margin.bottom + 14} fill="var(--muted)" fontSize={8} textAnchor="middle" fontFamily="monospace">
              {t.slice(5, 16)}
            </text>
          );
        })}

        {strikes.map((s, i) => {
          if (i % yLabelStep !== 0) return null;
          return (
            <text key={i} x={margin.left - 6} y={margin.top + i * cellH + cellH / 2 + 3} fill="var(--muted)" fontSize={8} textAnchor="end" fontFamily="monospace">
              {s}
            </text>
          );
        })}

        <text x={margin.left + plotW / 2} y={height - 4} fill="var(--muted)" fontSize={9} textAnchor="middle" fontFamily="monospace">
          Time
        </text>
        <text x={12} y={margin.top + plotH / 2} fill="var(--muted)" fontSize={9} textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 12, ${margin.top + plotH / 2})`}>
          Strike
        </text>

        {Array.from({ length: scaleSteps }, (_, i) => {
          const t = i / (scaleSteps - 1);
          return (
            <rect key={i} x={scaleX} y={margin.top + (1 - t) * scaleH - scaleH / scaleSteps} width={scaleW} height={scaleH / scaleSteps + 0.5} fill={interpolateColor(t)} />
          );
        })}
        <text x={scaleX + scaleW + 4} y={margin.top + 6} fill="var(--muted)" fontSize={8} fontFamily="monospace">
          {fmtValue(maxVal)}{unit}
        </text>
        <text x={scaleX + scaleW + 4} y={margin.top + scaleH} fill="var(--muted)" fontSize={8} fontFamily="monospace">
          {fmtValue(minVal)}{unit}
        </text>
      </svg>

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
          <div>{label}: <span className="text-(--fg)">{fmtValue(tooltip.value)}{unit}</span></div>
        </div>
      )}
    </div>
  );
}
