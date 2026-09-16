"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { captureAction, type CaptureState } from "@/app/(app)/actions";

export function CaptureBar() {
  const [state, action, pending] = useActionState<CaptureState, FormData>(
    captureAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // The nonce of the last success whose "Saved" flash has already faded.
  const [fadedNonce, setFadedNonce] = useState<number | undefined>();
  const saved = Boolean(state.ok && state.nonce !== fadedNonce);

  // Clear the box after each successful capture and fade the flash later.
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    textRef.current?.focus();
    const nonce = state.nonce;
    const t = setTimeout(() => setFadedNonce(nonce), 1500);
    return () => clearTimeout(t);
  }, [state.ok, state.nonce]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <label htmlFor="capture" className="sr-only">
        Capture
      </label>
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-background p-2 focus-within:border-zinc-500 dark:border-zinc-700">
        <textarea
          ref={textRef}
          id="capture"
          name="text"
          rows={2}
          required
          maxLength={10_000}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="What's on your mind?"
          onKeyDown={onKeyDown}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-5 px-2 text-xs ${
          state.error ? "text-red-600 dark:text-red-400" : "text-zinc-500"
        }`}
      >
        {state.error ?? (saved ? "Saved to inbox" : "")}
      </p>
    </form>
  );
}
