"use client";

import { useActionState } from "react";
import { KeyIcon, LogoMark, MailIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ linkError }: { linkError?: string }) {
  const [linkState, linkAction, linkPending] = useActionState(
    sendMagicLink,
    initial,
  );
  const [pwState, pwAction, pwPending] = useActionState(
    signInWithPassword,
    initial,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark size={48} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            tr<span className="text-accent">.</span>assistant
          </h1>
          <p className="mt-1 text-sm text-muted">Your day, one sentence at a time.</p>
        </div>
      </div>

      {linkError && (
        <p
          role="alert"
          className="rounded-2xl bg-danger-soft px-5 py-3 text-sm text-danger"
        >
          {linkError}
        </p>
      )}

      <div className={`${ui.card} flex flex-col gap-6 p-6`}>
        <form action={linkAction} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MailIcon size={18} className="text-muted" />
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
            className={ui.input}
          />
          <button type="submit" disabled={linkPending} className={ui.btnPrimary}>
            {linkPending ? "Sending…" : "Send link"}
          </button>
          <Feedback state={linkState} />
        </form>

        <div className="flex items-center gap-3 text-xs text-faint">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <form action={pwAction} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyIcon size={18} className="text-muted" />
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
            className={ui.input}
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
            className={ui.input}
          />
          <button type="submit" disabled={pwPending} className={ui.btnSecondary}>
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
          <Feedback state={pwState} />
        </form>
      </div>
    </main>
  );
}

function Feedback({ state }: { state: LoginState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-sm text-muted">
        {state.message}
      </p>
    );
  }
  return null;
}
