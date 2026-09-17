"use client";

import { useState, useTransition } from "react";
import { CopyIcon, SparklesIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { ui } from "@/components/ui";
import { draftNudgeAction } from "../actions";

/**
 * Writes the "any update on this?" message so chasing a follow-up is one tap
 * and a paste. The draft is editable; nothing is sent from here.
 */
export function NudgeDrafter({ id, person }: { id: string; person: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function write() {
    startTransition(async () => {
      setError(null);
      const result = await draftNudgeAction(id);
      if (result.error) setError(result.error);
      else setDraft(result.text ?? "");
    });
  }

  async function copy() {
    if (!draft) return;
    // The share sheet goes straight to Messages or Teams on a phone.
    if (navigator.share) {
      try {
        await navigator.share({ text: draft });
        return;
      } catch {
        // Dismissed, or not allowed here. Fall through to the clipboard.
      }
    }
    await navigator.clipboard.writeText(draft);
    toast("Copied");
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className={ui.sectionTitle}>Nudge {person}</h2>
      {draft === null ? (
        <button type="button" onClick={write} disabled={pending} className={`${ui.btnSecondary} self-start`}>
          <SparklesIcon size={16} className="text-accent" />
          {pending ? "Writing…" : "Draft a check-in message"}
        </button>
      ) : (
        <div className={`${ui.cardPad} flex flex-col gap-3`}>
          <label htmlFor="nudge" className="sr-only">
            Message
          </label>
          <textarea
            id="nudge"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`${ui.input} resize-y rounded-3xl leading-6`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={ui.btnPrimary}>
              <CopyIcon size={16} />
              Copy or share
            </button>
            <button type="button" onClick={write} disabled={pending} className={ui.btnGhost}>
              {pending ? "Writing…" : "Try again"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
