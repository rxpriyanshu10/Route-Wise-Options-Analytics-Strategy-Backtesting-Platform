"use client";

import { ReactNode } from "react";

export function ChartCard({
  title,
  children,
  className,
  insight,
  insightLoading,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  insight?: string;
  insightLoading?: boolean;
}) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--border)] rounded-lg flex flex-col pt-2 pb-2 px-2.5 overflow-hidden transition-colors hover:border-[var(--ring)] ${className || ""}`}
    >
      {title && (
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5 shrink-0 px-0.5">
          {title}
        </h3>
      )}
      <div className="flex-1 min-h-0 w-full relative flex flex-col">{children}</div>
      {(insight || insightLoading) && (
        <div className="shrink-0 mt-1.5 border-t border-[var(--border)] pt-1.5">
          {insightLoading && !insight ? (
            <div className="flex flex-col gap-1 px-0.5">
              <div className="skeleton h-2 w-4/5" />
              <div className="skeleton h-2 w-3/5" />
            </div>
          ) : (
            <p className="text-[9px] text-[var(--accent)] leading-snug px-0.5 line-clamp-2" title={insight}>
              {insight}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ChartCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--border)] rounded-lg flex flex-col pt-2 pb-2 px-2.5 ${className || ""}`}
    >
      <div className="skeleton h-2.5 w-20 mb-2" />
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="skeleton w-full h-full min-h-[80px] rounded" />
      </div>
    </div>
  );
}
