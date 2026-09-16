"use client";

import { useActionState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700";
const buttonClass =
  "w-full rounded-xl bg-foreground px-4 py-3 text-base font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50";

export default function LoginPage() {
  const [linkState, linkAction, linkPending] = useActionState(
    sendMagicLink,
    initial,
  );
  const [pwState, pwAction, pwPending] = useActionState(
    signInWithPassword,
    initial,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-10 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">TR Assistant</h1>

      <form action={linkAction} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Email me a sign-in link
        </h2>
        <label htmlFor="link-email" className="sr-only">
          Email
        </label>
        <input
          id="link-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          className={inputClass}
        />
        <button type="submit" disabled={linkPending} className={buttonClass}>
          {linkPending ? "Sending…" : "Send link"}
        </button>
        <Feedback state={linkState} />
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form action={pwAction} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Sign in with a password
        </h2>
        <label htmlFor="pw-email" className="sr-only">
          Email
        </label>
        <input
          id="pw-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="you@example.com"
          className={inputClass}
        />
        <label htmlFor="pw-password" className="sr-only">
          Password
        </label>
        <input
          id="pw-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Password"
          className={inputClass}
        />
        <button type="submit" disabled={pwPending} className={buttonClass}>
          {pwPending ? "Signing in…" : "Sign in"}
        </button>
        <Feedback state={pwState} />
      </form>
    </main>
  );
}

function Feedback({ state }: { state: LoginState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        {state.message}
      </p>
    );
  }
  return null;
}
