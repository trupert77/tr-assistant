"use client";

import { useOptimistic, useTransition } from "react";
import type { AiProviderName } from "@/lib/ai";
import { setAiProvider } from "./actions";

export type AiProviderOption = {
  name: AiProviderName;
  label: string;
  model: string;
  configured: boolean;
};

/**
 * Claude / ChatGPT switch. The choice is saved on the user record, so it
 * applies to web captures and the Shortcuts API alike. Providers without an
 * API key are shown but disabled.
 */
export function AiProviderToggle({
  options,
  current,
}: {
  options: AiProviderOption[];
  current: AiProviderName | null;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(current);

  return (
    <div
      role="radiogroup"
      aria-label="Assistant"
      aria-busy={pending}
      className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-2/60 p-1"
    >
      {options.map((o) => {
        const on = shown === o.name;
        return (
          <button
            key={o.name}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!o.configured || pending}
            title={o.configured ? o.model : "No API key set"}
            onClick={() =>
              startTransition(async () => {
                show(o.name);
                await setAiProvider(o.name);
              })
            }
            className={`flex min-h-11 flex-col items-center justify-center rounded-full leading-tight transition-[color,background-color,box-shadow] disabled:cursor-not-allowed ${
              on ? "bg-surface text-accent shadow-glow" : "text-muted hover:text-foreground"
            } ${o.configured ? "" : "opacity-40"}`}
          >
            <span className="text-xs font-semibold">{o.label}</span>
            <span className="text-[10px] font-normal text-faint">
              {o.configured ? o.model : "no key"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
