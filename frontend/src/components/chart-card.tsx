"use client";

import { ReactNode, useState, useEffect } from "react";
import { Maximize2, X } from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  const card = (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 bg-(--bg) flex flex-col p-4 overflow-hidden"
          : `bg-(--card) border border-(--border) rounded-lg flex flex-col pt-2 pb-2 px-2.5 overflow-hidden transition-colors hover:border-(--ring) ${className || ""}`
      }
    >
      {title ? (
        <div className="flex items-center justify-between shrink-0 mb-1.5 px-0.5">
          <h3 className={`font-mono uppercase tracking-widest text-(--muted) ${expanded ? "text-xs" : "text-[10px]"}`}>
            {title}
          </h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-(--muted) hover:text-(--fg) transition-colors cursor-pointer p-0.5 rounded hover:bg-(--card-hover)"
            title={expanded ? "Exit fullscreen" : "Expand"}
          >
            {expanded ? <X size={14} /> : <Maximize2 size={12} />}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute top-2 right-2 z-10 text-(--muted) hover:text-(--fg) transition-colors cursor-pointer p-0.5 rounded hover:bg-(--card-hover)"
          title={expanded ? "Exit fullscreen" : "Expand"}
        >
          {expanded ? <X size={14} /> : <Maximize2 size={12} />}
        </button>
      )}
      <div className="flex-1 min-h-0 w-full relative flex flex-col">{children}</div>
      {(insight || insightLoading) && !expanded && (
        <div className="shrink-0 mt-1.5 border-t border-(--border) pt-1.5">
          {insightLoading && !insight ? (
            <div className="flex flex-col gap-1 px-0.5">
              <div className="skeleton h-2 w-4/5" />
              <div className="skeleton h-2 w-3/5" />
            </div>
          ) : (
            <p className="text-[9px] text-(--accent) leading-snug px-0.5 line-clamp-2" title={insight}>
              {insight}
            </p>
          )}
        </div>
      )}
      {expanded && insight && (
        <div className="shrink-0 mt-2 border-t border-(--border) pt-2">
          <p className="text-xs text-(--accent) leading-relaxed px-0.5">{insight}</p>
        </div>
      )}
    </div>
  );

  return card;
}

export function ChartCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-(--card) border border-(--border) rounded-lg flex flex-col pt-2 pb-2 px-2.5 ${className || ""}`}
    >
      <div className="skeleton h-2.5 w-20 mb-2" />
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="skeleton w-full h-full min-h-[80px] rounded" />
      </div>
    </div>
  );
}
