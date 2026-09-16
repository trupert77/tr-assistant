"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { captureAction, type CaptureState } from "@/app/(app)/actions";
import { CheckIcon, SendIcon } from "./icons";

export function CaptureBar() {
  const [state, action, pending] = useActionState<CaptureState, FormData>(
    captureAction,
    {},
  );
  const router = useRouter();
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
    const fade = setTimeout(() => setFadedNonce(nonce), 1800);
    // Classification runs after the response; pull the result in when it lands.
    const refreshes = [3000, 8000].map((ms) => setTimeout(() => router.refresh(), ms));
    return () => {
      clearTimeout(fade);
      refreshes.forEach(clearTimeout);
    };
  }, [state.ok, state.nonce, router]);

  // "/" anywhere on the page jumps to the box, unless you're already typing.
  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      textRef.current?.focus();
    }
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-1.5">
      <label htmlFor="capture" className="sr-only">
        Capture
      </label>
      <div className="flex items-end gap-2 rounded-[28px] border border-line bg-surface p-2 pl-5 shadow-card transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-glow">
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
          className="max-h-40 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Save to inbox"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-accent-2 text-accent-foreground shadow-glow transition-[opacity,transform] hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:shadow-none"
        >
          {saved ? <CheckIcon size={20} strokeWidth={2.4} /> : <SendIcon size={20} strokeWidth={2.4} />}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-4 px-5 text-xs transition-opacity ${
          state.error ? "text-danger" : "text-muted"
        } ${state.error || saved ? "opacity-100" : "opacity-0"}`}
      >
        {state.error ?? (saved ? "Saved to inbox" : " ")}
      </p>
    </form>
  );
}
