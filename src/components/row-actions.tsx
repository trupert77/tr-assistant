"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { archiveAction, reopenAction, snoozeAction } from "@/app/(app)/items/actions";
import { toast } from "./toast";

function form(id: string, extra?: Record<string, string>) {
  const data = new FormData();
  data.set("id", id);
  for (const [k, v] of Object.entries(extra ?? {})) data.set(k, v);
  return data;
}

const chip =
  "inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-foreground disabled:opacity-40";

/**
 * Decide-now buttons under a row in the weekly review: move it, park it, or
 * let it go. Archive can be undone from the toast.
 */
export function RowActions({
  id,
  title,
  dated,
}: {
  id: string;
  title: string;
  /** Whether the item has a due date to clear. */
  dated: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const snooze = (until: "tomorrow" | "next-week" | "clear", said: string) =>
    startTransition(async () => {
      await snoozeAction(form(id, { until }));
      toast(said);
    });

  return (
    <div className="flex flex-wrap gap-1.5 px-5 pb-3.5 pl-[3.25rem]">
      <button type="button" disabled={pending} className={chip} onClick={() => snooze("tomorrow", "Moved to tomorrow")}>
        Tomorrow
      </button>
      <button type="button" disabled={pending} className={chip} onClick={() => snooze("next-week", "Moved to Monday")}>
        Next week
      </button>
      {dated && (
        <button type="button" disabled={pending} className={chip} onClick={() => snooze("clear", "Parked in Someday")}>
          Someday
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        className={`${chip} hover:text-danger`}
        onClick={() =>
          startTransition(async () => {
            await archiveAction(form(id));
            toast(`Archived: ${title}`, () => reopenAction(form(id)));
          })
        }
      >
        Archive
      </button>
    </div>
  );
}

/** Archive from the item page: go back to Today and offer Undo there. */
export function ArchiveButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await archiveAction(form(id));
          toast(`Archived: ${title}`, () => reopenAction(form(id)));
          router.push("/");
        })
      }
      className="text-faint underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      Archive
    </button>
  );
}
