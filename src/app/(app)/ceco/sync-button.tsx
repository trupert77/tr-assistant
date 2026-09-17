"use client";

import { useState, useTransition } from "react";
import { LoaderIcon, RepeatIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { syncCecoAction } from "./actions";

/** Refresh the mirrored CECO scope on demand. The tick also does this every few hours. */
export function CecoSyncButton({ label = "Sync now" }: { label?: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncCecoAction();
            setMessage(
              result.ok
                ? { text: `Synced ${result.pages} pages from CECO ${result.version}.` }
                : { text: result.error ?? "Could not sync.", error: true },
            );
          })
        }
        className={`${ui.btnSecondary} self-start`}
      >
        {pending ? (
          <LoaderIcon size={16} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <RepeatIcon size={16} />
        )}
        {pending ? "Syncing…" : label}
      </button>
      {message && (
        <p role="status" className={`text-xs ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
