"use client";

export function Insight({ text, loading }: { text?: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="text-[9px] text-[var(--muted)] italic px-0.5 py-0.5 animate-pulse">
        Analyzing...
      </div>
    );
  }
  if (!text) return null;
  return (
    <div className="text-[9px] text-[var(--accent)] leading-snug px-0.5 py-0.5 border-t border-[var(--border)] mt-1">
      {text}
    </div>
  );
}
