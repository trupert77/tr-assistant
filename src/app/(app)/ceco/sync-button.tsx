"use client";

import { useState, useTransition } from "react";
import { LoaderIcon, RepeatIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { type CecoActionResult, syncCecoAction } from "./actions";

/** Refresh the mirrored CECO scope and initiatives board on demand. The tick also does this. */
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
                ? { text: syncedText(result) }
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

/** One line for both halves of the sync, saying so when only the scope came through. */
function syncedText(result: CecoActionResult): string {
  const pages = `${result.pages} pages`;
  const board =
    result.initiatives === undefined
      ? ""
      : ` and ${result.initiatives} initiative${result.initiatives === 1 ? "" : "s"}`;
  const synced = `Synced ${pages}${board} from CECO ${result.version}.`;
  return result.initiativesNote ? `${synced} Initiatives: ${result.initiativesNote}` : synced;
}
