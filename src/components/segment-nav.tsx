"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Switch between the things you browse rather than do: your projects, the
 * people they involve, and the CECO portal. Shown at the top of each.
 */
export function SegmentNav({ showCeco = false }: { showCeco?: boolean }) {
  const pathname = usePathname();
  const onCeco = pathname.startsWith("/ceco");
  // Annotated rather than `as const`: the conditional spread would otherwise
  // widen href to string and fail the typed-routes check.
  const segments: { href: Route; label: string }[] = [
    { href: "/projects", label: "Projects" },
    { href: "/people", label: "People" },
    // Hidden until the portal is connected, but never hidden while you are on it.
    ...(showCeco || onCeco ? [{ href: "/ceco" as Route, label: "CECO" }] : []),
  ];

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
