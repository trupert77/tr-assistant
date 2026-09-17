"use client";

import { useOptimistic, useTransition } from "react";
import { setAiProvider } from "@/app/(app)/settings/actions";
import type { AiProviderName, AiProviderOption } from "@/lib/ai";

/**
 * Claude / ChatGPT switch. The choice is saved on the user record, so it
 * applies to web captures, the assistant and the Shortcuts API alike.
 * Providers without an API key are shown but disabled.
 *
 * `compact` is the small label-only pill under the capture bar; the full
 * size in Settings also shows each model.
 */
export function AiProviderToggle({
  options,
  current,
  compact = false,
}: {
  options: AiProviderOption[];
  current: AiProviderName | null;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(current);

  return (
    <div
      role="radiogroup"
      aria-label="Assistant"
      aria-busy={pending}
      className={`rounded-full border border-line bg-surface-2/60 ${
        compact ? "inline-flex gap-0.5 p-0.5" : "grid grid-cols-2 gap-1 p-1"
      }`}
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
            onClick={() => {
              if (on) return;
              startTransition(async () => {
                show(o.name);
                await setAiProvider(o.name);
              });
            }}
            className={`flex flex-col items-center justify-center rounded-full leading-tight transition-[color,background-color,box-shadow] disabled:cursor-not-allowed ${
              compact ? "h-8 px-3.5" : "min-h-11"
            } ${on ? "bg-surface text-accent shadow-glow" : "text-muted hover:text-foreground"} ${
              o.configured ? "" : "opacity-40"
            }`}
          >
            <span className={`font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>{o.label}</span>
            {!compact && (
              <span className="text-[10px] font-normal text-faint">
                {o.configured ? o.model : "no key"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
