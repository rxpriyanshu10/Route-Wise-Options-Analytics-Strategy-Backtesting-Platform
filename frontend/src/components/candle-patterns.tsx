"use client";

type Pattern = {
  datetime: string;
  pattern: string;
  type: "single" | "multi";
  signal: "bullish" | "bearish" | "neutral";
  description: string;
  inference: string;
  option_impact: { CE: string; PE: string };
  confidence: number;
};

type PatternSummary = {
  total_patterns: number;
  bullish: number;
  bearish: number;
  neutral: number;
};

const SIGNAL_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  bullish: {
    bg: "bg-green-950/30",
    border: "border-green-800/40",
    text: "text-green-400",
    badge: "bg-green-900/60 text-green-300",
  },
  bearish: {
    bg: "bg-red-950/30",
    border: "border-red-800/40",
    text: "text-red-400",
    badge: "bg-red-900/60 text-red-300",
  },
  neutral: {
    bg: "bg-yellow-950/30",
    border: "border-yellow-800/40",
    text: "text-yellow-400",
    badge: "bg-yellow-900/60 text-yellow-300",
  },
};

const IMPACT_LABELS: Record<string, string> = {
  premium_increase: "Premium Increase",
  premium_decrease: "Premium Decrease",
  volatility_increase: "Volatility Increase",
  neutral: "Neutral",
};

export function PatternSummaryBar({ summary }: { summary: PatternSummary }) {
  return (
    <div className="flex gap-4 items-center text-sm">
      <span className="text-(--muted)">
        {summary.total_patterns} pattern{summary.total_patterns !== 1 ? "s" : ""} detected
      </span>
      {summary.bullish > 0 && (
        <span className="text-green-400">{summary.bullish} Bullish</span>
      )}
      {summary.bearish > 0 && (
        <span className="text-red-400">{summary.bearish} Bearish</span>
      )}
      {summary.neutral > 0 && (
        <span className="text-yellow-400">{summary.neutral} Neutral</span>
      )}
    </div>
  );
}

export function PatternCard({ pattern }: { pattern: Pattern }) {
  const style = SIGNAL_STYLES[pattern.signal];

  return (
    <div className={`rounded-lg border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className={`font-semibold text-sm ${style.text}`}>{pattern.pattern}</h4>
          <span className="text-xs text-(--muted)">{pattern.datetime}</span>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
            {pattern.type === "multi" ? "Multi-candle" : "Single"}
          </span>
          <span className="text-xs text-(--muted)">{pattern.confidence}%</span>
        </div>
      </div>

      <p className="text-xs text-(--muted) mb-2">{pattern.description}</p>

      <div className="bg-black/20 rounded p-3 mb-2">
        <p className="text-xs leading-relaxed">{pattern.inference}</p>
      </div>

      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-blue-400">CE:</span>
          <span className={
            pattern.option_impact.CE === "premium_increase" ? "text-green-400" :
            pattern.option_impact.CE === "premium_decrease" ? "text-red-400" :
            "text-yellow-400"
          }>
            {IMPACT_LABELS[pattern.option_impact.CE]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-400">PE:</span>
          <span className={
            pattern.option_impact.PE === "premium_increase" ? "text-green-400" :
            pattern.option_impact.PE === "premium_decrease" ? "text-red-400" :
            "text-yellow-400"
          }>
            {IMPACT_LABELS[pattern.option_impact.PE]}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PatternList({ patterns }: { patterns: Pattern[] }) {
  if (patterns.length === 0) {
    return (
      <div className="text-sm text-(--muted) text-center py-8">
        No candlestick patterns detected in this data range.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {patterns.map((pattern, i) => (
        <PatternCard key={`${pattern.datetime}-${pattern.pattern}-${i}`} pattern={pattern} />
      ))}
    </div>
  );
}
