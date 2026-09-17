"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { captureAction, type CaptureState } from "@/app/(app)/actions";
import type { AiProviderName, AiProviderOption } from "@/lib/ai";
import { AiProviderToggle } from "./ai-provider-toggle";
import { CameraIcon, CheckIcon, MicIcon, SendIcon, XIcon } from "./icons";

// The Web Speech API is not in TypeScript's DOM lib yet. Only what is used here.
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function speechRecognition() {
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// Browser support never changes after load, so there is nothing to subscribe to.
const neverChanges = () => () => {};

const MAX_EDGE = 1600;
const iconButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40";

/** Shrink a photo so it uploads fast on cell data and stays readable for the model. */
async function downsize(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return blob ? new File([blob], "capture.jpg", { type: "image/jpeg" }) : file;
  } catch {
    // Could not decode it here; let the server decide whether it can take it.
    return file;
  }
}

export function CaptureBar({
  aiProviders,
  aiProvider,
}: {
  aiProviders: AiProviderOption[];
  /** The provider that will file the next capture, or null when no key is set. */
  aiProvider: AiProviderName | null;
}) {
  const [state, action, pending] = useActionState<CaptureState, FormData>(
    captureAction,
    {},
  );
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [text, setText] = useState("");
  const [source, setSource] = useState<"web" | "voice" | "share">("web");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // False on the server and during hydration, then whatever the browser supports.
  const canDictate = useSyncExternalStore(
    neverChanges,
    () => Boolean(speechRecognition()),
    () => false,
  );

  // The nonce of the last success whose "Saved" flash has already faded.
  const [fadedNonce, setFadedNonce] = useState<number | undefined>();
  const saved = Boolean(state.ok && state.nonce !== fadedNonce);

  // Empty the box once per successful capture. Done while rendering, keyed on
  // the nonce, so the cleared box paints in the same frame as "Saved".
  const [clearedNonce, setClearedNonce] = useState<number | undefined>();
  if (state.ok && state.nonce !== clearedNonce) {
    setClearedNonce(state.nonce);
    setText("");
    setSource("web");
    setPhoto(null);
  }

  function clearPhoto() {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Release the preview blob whenever the photo changes or goes away.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.preview);
  }, [photo]);

  // After each successful capture: refocus, fade the flash, pull in the filing.
  useEffect(() => {
    if (!state.ok) return;
    if (fileRef.current) fileRef.current.value = "";
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

  // First load: did the share sheet hand us text? (/share redirects to /?capture=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("capture");
    if (!shared) return;
    params.delete("capture");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    // After hydration has settled, so the prefilled box is not a mismatch.
    const timer = setTimeout(() => {
      setText(shared);
      setSource("share");
      textRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

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

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) heard += event.results[i][0].transcript;
      }
      heard = heard.trim();
      if (!heard) return;
      setText((current) => (current.trim() ? `${current.trimEnd()} ${heard}` : heard));
      setSource((current) => (current === "web" ? "voice" : current));
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNotice("Microphone access is blocked for this app.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setNotice(null);
    setListening(true);
    recognition.start();
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const small = await downsize(file);
    setPhoto({ file: small, preview: URL.createObjectURL(small) });
    setNotice(null);
  }

  const status = state.error ?? notice ?? (listening ? "Listening…" : saved ? "Saved to inbox" : "");
  const statusIsError = Boolean(state.error || notice);

  return (
    <form
      ref={formRef}
      action={(data) => {
        recognitionRef.current?.stop();
        // The picker holds the original; send the downsized copy instead.
        if (photo) data.set("image", photo.file);
        return action(data);
      }}
      className="flex flex-col gap-1.5"
    >
      <label htmlFor="capture" className="sr-only">
        Capture
      </label>
      <input type="hidden" name="source" value={source} />
      <div className="flex items-end gap-2 rounded-[28px] border border-line bg-surface p-2 pl-5 shadow-card transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-glow">
        {photo && (
          <span className="relative mb-0.5 shrink-0 self-end">
            {/* A local blob preview; next/image has nothing to optimize here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.preview}
              alt="Attached photo"
              className="h-11 w-11 rounded-2xl border border-line object-cover"
            />
            <button
              type="button"
              onClick={clearPhoto}
              aria-label="Remove photo"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-muted"
            >
              <XIcon size={11} strokeWidth={2.6} />
            </button>
          </span>
        )}
        <textarea
          ref={textRef}
          id="capture"
          name="text"
          rows={2}
          required={!photo}
          maxLength={10_000}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={photo ? "Add a note about the photo (optional)" : "What's on your mind?"}
          value={text}
          onChange={(e) => setText(e.target.value)}
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

      <div className="flex items-center gap-1 pl-3 pr-5">
        {aiProvider && <AiProviderToggle options={aiProviders} current={aiProvider} compact />}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickPhoto}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={photo ? "Replace photo" : "Add a photo"}
          className={`${iconButton} ${photo ? "text-accent" : ""}`}
        >
          <CameraIcon size={19} />
        </button>
        {canDictate && (
          <button
            type="button"
            onClick={toggleDictation}
            aria-label={listening ? "Stop dictation" : "Dictate"}
            aria-pressed={listening}
            className={`${iconButton} ${
              listening ? "animate-pulse bg-accent-soft text-accent motion-reduce:animate-none" : ""
            }`}
          >
            <MicIcon size={19} />
          </button>
        )}
        <p
          role="status"
          aria-live="polite"
          className={`min-h-4 min-w-0 flex-1 truncate text-right text-xs transition-opacity ${
            statusIsError ? "text-danger" : "text-muted"
          } ${status ? "opacity-100" : "opacity-0"}`}
        >
          {status || " "}
        </p>
      </div>
    </form>
  );
}
