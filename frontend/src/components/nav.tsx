"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/candles", label: "Candles" },
  { href: "/chat", label: "Chat" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[var(--border)] px-4 flex items-center gap-6 h-8 text-xs shrink-0 bg-[var(--bg)] w-full">
      <span className="font-mono font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--fg)] to-[var(--muted)]">CodeForge</span>
      <div className="flex gap-4 items-center">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`transition-colors py-1 ${
              pathname === l.href ? "text-[var(--fg)] border-b border-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
