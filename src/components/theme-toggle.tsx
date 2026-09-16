"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, readTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

const options = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const satisfies readonly { value: Theme; label: string; Icon: typeof SunIcon }[];

/** System / Light / Dark switch. See lib/theme.ts for how the choice is stored. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system");

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
