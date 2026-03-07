"use client";

import { ReactNode } from "react";

export function ChartCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--card)] border border-[var(--border)] rounded flex flex-col pt-1.5 pb-2 px-2 ${className || ""}`}>
      {title && <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1 shrink-0 px-0.5">{title}</h3>}
      <div className="flex-1 min-h-0 w-full relative">
        {children}
      </div>
    </div>
  );
}
