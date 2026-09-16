"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

type Theme = "system" | "light" | "dark";

const options = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const satisfies readonly { value: Theme; label: string; Icon: typeof SunIcon }[];

// localStorage is the source of truth; the DOM attribute mirrors it.
const KEY = "theme";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable (private mode etc.); still applies for this page.
  }
  listeners.forEach((l) => l());
}

/**
 * System / Light / Dark switch. The choice lives in localStorage under "theme"
 * and is applied as data-theme on <html>; app/layout.tsx re-applies it before
 * first paint on the next load.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface-2/60 p-1"
    >
      {options.map(({ value, label, Icon }) => {
        const on = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => applyTheme(value)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-xs font-semibold transition-[color,background-color,box-shadow] ${
              on ? "bg-surface text-accent shadow-glow" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon size={16} strokeWidth={on ? 2.2 : 1.8} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
