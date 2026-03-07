"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";

const axisStyle = { fontSize: 9, fill: "#666" };
const tooltipStyle = {
  contentStyle: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 11 },
  labelStyle: { color: "#aaa" },
};

// --- Direction Summary ---
export function DirectionSummary({ data }: { data: any }) {
  if (!data) return null;
  const { summary, predictions, feature_importances } = data;
  const total = summary.bullish + summary.bearish + summary.neutral;
  const dominant = summary.bullish >= summary.bearish && summary.bullish >= summary.neutral
    ? "bullish" : summary.bearish >= summary.neutral ? "bearish" : "neutral";
  const colors: Record<string, string> = { bullish: "#22c55e", bearish: "#ef4444", neutral: "#888" };

  // Latest prediction
  const latest = predictions[predictions.length - 1];

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Signal bar */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: colors[dominant] }}
        />
        <span className="font-mono uppercase tracking-wider text-[10px]" style={{ color: colors[dominant] }}>
          {dominant}
        </span>
        {latest && (
          <span className="text-[var(--muted)] ml-auto">
            {latest.confidence.toFixed(0)}% conf
          </span>
        )}
      </div>

      {/* Distribution bar */}
      <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--border)]">
        <div style={{ width: `${(summary.bullish / total) * 100}%`, background: colors.bullish }} />
        <div style={{ width: `${(summary.neutral / total) * 100}%`, background: colors.neutral }} />
        <div style={{ width: `${(summary.bearish / total) * 100}%`, background: colors.bearish }} />
      </div>
      <div className="flex justify-between text-[var(--muted)]">
        <span>{summary.bullish} bull</span>
        <span>{summary.neutral} neut</span>
        <span>{summary.bearish} bear</span>
      </div>

      {/* Feature importances */}
      {feature_importances && feature_importances.length > 0 && (
        <div className="flex-1 min-h-0 mt-1">
          <p className="text-[var(--muted)] text-[9px] uppercase tracking-wider mb-1">Top Drivers</p>
          <div className="space-y-1">
            {feature_importances.slice(0, 4).map((f: any) => (
              <div key={f.feature} className="flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${f.importance}%` }}
                  />
                </div>
                <span className="text-[var(--muted)] w-20 truncate text-right">{f.feature.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Anomaly Timeline ---
export function AnomalyTimeline({ data, height = "100%" }: { data: any; height?: number | string }) {
  if (!data) return null;
  const { all, anomaly_count, total_snapshots } = data;

  const chartData = all.map((r: any) => ({
    time: r.datetime.slice(5, 16),
    score: r.anomaly_score,
    isAnomaly: r.is_anomaly,
  }));

  return (
    <div className="flex flex-col gap-1.5 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[var(--red)]">{anomaly_count}</span>
        <span className="text-[var(--muted)]">/ {total_snapshots} anomalies</span>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} domain={[0, 100]} />
              <Tooltip {...tooltipStyle} />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="score"
                stroke="#f59e0b"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (!payload.isAnomaly) return <circle key={`dot-${props.index}`} cx={cx} cy={cy} r={0} />;
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="#ef4444"
                      stroke="#ef4444"
                      strokeWidth={1}
                    />
                  );
                }}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// --- Anomaly List ---
export function AnomalyList({ anomalies }: { anomalies: any[] }) {
  if (!anomalies || anomalies.length === 0) return <p className="text-[var(--muted)]">No anomalies detected</p>;

  return (
    <div className="space-y-1 overflow-y-auto max-h-full hidden-scrollbar">
      {anomalies.slice(0, 8).map((a: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-2 px-1.5 py-1 rounded bg-[var(--bg)] border border-[var(--border)]"
        >
          <span className="text-[var(--red)] font-mono">{a.anomaly_score.toFixed(0)}</span>
          <span className="text-[var(--muted)] flex-1 truncate">{a.datetime.slice(5, 16)}</span>
          <span className="text-[var(--muted)]">
            PCR {a.pcr_oi.toFixed(2)} &middot; OI {a.oi_change_pct > 0 ? "+" : ""}{a.oi_change_pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Direction Timeline Chart ---
export function DirectionTimeline({ data, height = "100%" }: { data: any; height?: number | string }) {
  if (!data) return null;

  const colors: Record<string, string> = { bullish: "#22c55e", bearish: "#ef4444", neutral: "#555" };

  // Sample down for display
  const preds = data.predictions;
  const step = Math.max(1, Math.floor(preds.length / 100));
  const chartData = preds.filter((_: any, i: number) => i % step === 0).map((p: any) => ({
    time: p.datetime.slice(5, 16),
    confidence: p.signal === "bearish" ? -p.confidence : p.signal === "bullish" ? p.confidence : 0,
    signal: p.signal,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
        <XAxis dataKey="time" tick={axisStyle} interval="preserveStartEnd" />
        <YAxis tick={axisStyle} domain={[-100, 100]} />
        <Tooltip {...tooltipStyle} />
        <Bar isAnimationActive={false} dataKey="confidence">
          {chartData.map((entry: any, idx: number) => (
            <Cell key={idx} fill={colors[entry.signal] || colors.neutral} opacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
