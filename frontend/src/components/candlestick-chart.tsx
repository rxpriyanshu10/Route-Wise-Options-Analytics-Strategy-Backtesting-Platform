"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";

type CandleData = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type PatternMarker = {
  datetime: string;
  pattern: string;
  signal: "bullish" | "bearish" | "neutral";
  inference?: string;
};

const COLORS = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#888",
  grid: "#222",
  axis: "#888",
  bg: "#0a0a0a",
  tooltip: "#1a1a1a",
  border: "#333",
};

const SIGNAL_COLORS: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#f59e0b",
};

export function CandlestickChart({
  data,
  patterns = [],
  activeTime = null,
}: {
  data: CandleData[];
  patterns?: PatternMarker[];
  activeTime?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    candle: CandleData;
    patterns: PatternMarker[];
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const margin = { top: 20, right: 60, bottom: 40, left: 10 };
  const { width, height } = dimensions;

  const patternMap = useMemo(() => {
    const map: Record<string, PatternMarker[]> = {};
    for (const p of patterns) {
      if (!map[p.datetime]) map[p.datetime] = [];
      map[p.datetime].push(p);
    }
    return map;
  }, [patterns]);

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    const allLows = data.map((d) => d.low);
    const allHighs = data.map((d) => d.high);
    const min = Math.min(...allLows);
    const max = Math.max(...allHighs);
    const padding = (max - min) * 0.08;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      priceRange: max - min + padding * 2,
    };
  }, [data]);

  const yTicks = useMemo(() => {
    const tickCount = 6;
    const step = priceRange / tickCount;
    return Array.from({ length: tickCount + 1 }, (_, i) =>
      Math.round(minPrice + i * step)
    );
  }, [minPrice, priceRange]);

  const activeIndex = useMemo(() => {
    if (!activeTime || !data.length) return -1;
    const targetMs = Date.parse(activeTime);
    if (isNaN(targetMs)) return -1;
    // Find the candle that's closest or encompasses this time
    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < data.length; i++) {
      const candleMs = Date.parse(data[i].datetime);
      const diff = Math.abs(candleMs - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [activeTime, data]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const chartWidth = Math.max(rect.width - margin.left - margin.right, 0);
      const candleWidth = chartWidth / Math.max(data.length, 1);
      const idx = Math.floor((x - margin.left) / candleWidth);
      if (idx >= 0 && idx < data.length) {
        const candle = data[idx];
        const pats = patternMap[candle.datetime] || [];
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          candle,
          patterns: pats,
        });
      } else {
        setTooltip(null);
      }
    },
    [data, patternMap, margin.left, margin.right]
  );

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {(width > 0 && height > 0) && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          className="block"
        >
          {/* Grid lines */}
        {yTicks.map((tick) => {
          const y =
            margin.top +
            ((maxPrice - tick) / Math.max(priceRange, 0.0001)) * Math.max(height - margin.top - margin.bottom, 0);
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke={COLORS.grid}
                strokeDasharray="3 3"
              />
              <text
                x={width - margin.right + 5}
                y={y + 4}
                fill={COLORS.axis}
                fontSize={10}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Active Time Highlight */}
        {activeIndex >= 0 && (
          <rect
            x={margin.left + activeIndex * (Math.max(width - margin.left - margin.right, 0) / data.length)}
            y={margin.top}
            width={Math.max(width - margin.left - margin.right, 0) / data.length}
            height={Math.max(height - margin.top - margin.bottom, 0)}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="rgba(59, 130, 246, 0.5)"
            strokeWidth={1}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        )}

        {/* Candles */}
        {data.map((candle, i) => {
          const chartWidth = Math.max(width - margin.left - margin.right, 0);
          const candleWidth = chartWidth / data.length;
          const bodyWidth = Math.max(candleWidth * 0.6, 2);
          const x = margin.left + i * candleWidth + candleWidth / 2;
          const chartHeight = Math.max(height - margin.top - margin.bottom, 0);

          const yScale = (price: number) =>
            margin.top + ((maxPrice - price) / Math.max(priceRange, 0.0001)) * chartHeight;

          const isBullish = candle.close >= candle.open;
          const color = isBullish ? COLORS.bullish : COLORS.bearish;
          const bodyTop = yScale(Math.max(candle.open, candle.close));
          const bodyBottom = yScale(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

          const hasPattern = patternMap[candle.datetime];

          return (
            <g key={i}>
              {/* Wick */}
              <line
                x1={x}
                x2={x}
                y1={yScale(candle.high)}
                y2={yScale(candle.low)}
                stroke={color}
                strokeWidth={1}
              />
              {/* Body */}
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={isBullish ? color : color}
                stroke={color}
                strokeWidth={0.5}
                opacity={isBullish ? 0.9 : 0.9}
              />
              {/* Pattern marker */}
              {hasPattern && (
                <circle
                  cx={x}
                  cy={yScale(candle.low) + 12}
                  r={3}
                  fill={SIGNAL_COLORS[hasPattern[0].signal]}
                  stroke="#fff"
                  strokeWidth={0.5}
                />
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((candle, i) => {
          const chartWidth = Math.max(width - margin.left - margin.right, 0);
          const candleWidth = chartWidth / data.length;
          const x = margin.left + i * candleWidth + candleWidth / 2;
          // Show every nth label to avoid overlap
          const labelInterval = Math.max(1, Math.floor(data.length / 10));
          if (i % labelInterval !== 0) return null;
          const label = candle.datetime.slice(5, 10);
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              fill={COLORS.axis}
              fontSize={9}
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 text-xs rounded-lg border px-3 py-2"
          style={{
            left: Math.min(tooltip.x + 10, width - 120),
            top: Math.max(tooltip.y - 80, 0),
            background: COLORS.tooltip,
            borderColor: COLORS.border,
          }}
        >
          <div className="text-(--muted) mb-1">{tooltip.candle.datetime}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-(--muted)">O:</span>
            <span>{tooltip.candle.open}</span>
            <span className="text-(--muted)">H:</span>
            <span>{tooltip.candle.high}</span>
            <span className="text-(--muted)">L:</span>
            <span>{tooltip.candle.low}</span>
            <span className="text-(--muted)">C:</span>
            <span>{tooltip.candle.close}</span>
          </div>
          {tooltip.patterns.length > 0 && (
            <div className="mt-1 pt-1 border-t border-(--border) max-w-[200px] flex flex-col gap-1">
              {tooltip.patterns.map((p, idx) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="text-(--accent) font-medium leading-none">{p.pattern}</div>
                  {p.inference && (
                    <div className="text-[9px] text-(--muted) leading-tight whitespace-normal">
                      {p.inference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
