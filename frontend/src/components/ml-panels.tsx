"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid,
} from "recharts";

const axisStyle = { fontSize: 9, fill: "#666" };
const tooltipStyle = {
  contentStyle: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 11 },
  labelStyle: { color: "#aaa" },
};

// --- Anomaly Timeline ---
export function AnomalyTimeline({ data, height = "100%", onHover }: { data: any; height?: number | string, onHover?: (datetime: string | null) => void }) {
  if (!data) return null;
  const { all, anomaly_count, total_snapshots } = data;

  const chartData = all.map((r: any) => ({
    time: r.datetime.slice(5, 16),
    fullDatetime: r.datetime,
    score: r.anomaly_score,
    isAnomaly: r.is_anomaly,
  }));

  return (
    <div className="flex flex-col gap-1.5 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-(--red)">{anomaly_count}</span>
        <span className="text-(--muted)">/ {total_snapshots} anomalies</span>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0" onMouseLeave={() => onHover?.(null)}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart 
              data={chartData}
              onMouseMove={(e) => {
                if (e && e.activePayload && e.activePayload.length > 0) {
                  onHover?.(e.activePayload[0].payload.fullDatetime);
                } else {
                  onHover?.(null);
                }
              }}
            >
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
  if (!anomalies || anomalies.length === 0) return <p className="text-(--muted)">No anomalies detected</p>;

  return (
    <div className="space-y-1 overflow-y-auto max-h-full hidden-scrollbar">
      {anomalies.slice(0, 8).map((a: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-2 px-1.5 py-1 rounded bg-(--bg) border border-(--border)"
        >
          <span className="text-(--red) font-mono">{a.anomaly_score.toFixed(0)}</span>
          <span className="text-(--muted) flex-1 truncate">{a.datetime.slice(5, 16)}</span>
          <span className="text-(--muted)">
            PCR {a.pcr_oi.toFixed(2)} &middot; OI {a.oi_change_pct > 0 ? "+" : ""}{a.oi_change_pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

