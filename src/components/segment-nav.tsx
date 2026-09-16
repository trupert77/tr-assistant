"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Two-way switch between Projects and People, shown at the top of both. */
export function SegmentNav() {
  const pathname = usePathname();
  const segments = [
    { href: "/projects", label: "Projects" },
    { href: "/people", label: "People" },
  ] as const;

  return (
    <nav aria-label="Browse" className="inline-flex rounded-full border border-line bg-surface-2/60 p-1">
      {segments.map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
