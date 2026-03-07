"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CandlestickChart, TableProperties, MessageSquare } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chain", label: "Chain", icon: TableProperties },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-(--border) px-4 flex items-center gap-1 h-10 text-xs shrink-0 bg-(--bg) w-full">
      <span className="font-mono font-semibold tracking-tight text-sm mr-4 bg-clip-text text-transparent bg-linear-to-r from-(--fg) to-(--muted)">
        OpenQuant
      </span>
      <div className="flex items-center gap-0.5">
        {links.map((l) => {
          const Icon = l.icon;
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                active
                  ? "bg-(--border) text-(--fg)"
                  : "text-(--muted) hover:text-(--fg) hover:bg-(--card-hover)"
              }`}
            >
              <Icon size={14} strokeWidth={active ? 2 : 1.5} />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
