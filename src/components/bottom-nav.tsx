"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderIcon, InboxIcon, SparklesIcon, SunIcon } from "./icons";

const tabs = [
  { href: "/", label: "Today", Icon: SunIcon },
  { href: "/inbox", label: "Inbox", Icon: InboxIcon },
  { href: "/projects", label: "Projects", Icon: FolderIcon },
  { href: "/assistant", label: "Assistant", Icon: SparklesIcon },
] as const;

/** Floating pill bar, detached from the bottom edge. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
    >
      <ul className="pointer-events-auto grid w-full max-w-md grid-cols-4 gap-1 rounded-full border border-line bg-surface/85 p-1.5 shadow-float backdrop-blur-xl">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-[color,background-color,box-shadow] ${
                  active
                    ? "bg-accent-soft text-accent shadow-glow"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
