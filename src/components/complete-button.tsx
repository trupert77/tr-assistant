"use client";

import { useOptimistic, useTransition } from "react";
import { completeAction, reopenAction } from "@/app/(app)/items/actions";
import { CheckIcon } from "./icons";
import { toast } from "./toast";

/**
 * The tap-to-complete circle on every row. Completing shows an Undo toast,
 * because a mis-tap on a phone should cost one tap to fix, not a search
 * through Done.
 */
export function CompleteButton({
  id,
  title,
  done,
}: {
  id: string;
  title: string;
  done: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [shownDone, showDone] = useOptimistic(done);

  function form() {
    const data = new FormData();
    data.set("id", id);
    return data;
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={shownDone ? "Mark not done" : "Mark done"}
      onClick={() =>
        startTransition(async () => {
          showDone(!done);
          if (done) {
            await reopenAction(form());
            return;
          }
          await completeAction(form());
          toast(`Done: ${title}`, () => reopenAction(form()));
        })
      }
      // 44px hit area around a 24px circle, pulled in with negative margin.
      className="group -m-2.5 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
          shownDone
            ? "border-accent bg-accent text-accent-foreground"
            : "border-line-strong group-hover:border-accent"
        }`}
      >
        {shownDone && <CheckIcon size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}
