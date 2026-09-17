"use client";

import { useTransition } from "react";
import { discardAction, undiscardAction } from "@/app/(app)/actions";
import { LoaderIcon, TrashIcon } from "./icons";
import { toast } from "./toast";
import { ui } from "./ui";

/**
 * Delete a capture from the inbox. Nothing is really removed: the row is
 * parked out of sight and the toast puts it back, the same deal Archive
 * offers on an item.
 */
export function DiscardButton({ inboxItemId, label }: { inboxItemId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      className={`${ui.chip} text-muted hover:text-danger disabled:cursor-progress disabled:opacity-50`}
      onClick={() =>
        startTransition(async () => {
          const undo = await discardAction(inboxItemId);
          if (!undo) return;
          toast(`Deleted: ${label}`, () => undiscardAction(undo));
        })
      }
    >
      {pending ? (
        <LoaderIcon size={14} strokeWidth={2.4} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <TrashIcon size={14} />
      )}
      Delete
    </button>
  );
}
