"use client";

import { useActionState } from "react";
import { setPassword, type SettingsState } from "./actions";

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700";

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    setPassword,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="password" className="sr-only">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="New password"
        className={inputClass}
      />
      <label htmlFor="confirm" className="sr-only">
        Confirm password
      </label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="Confirm password"
        className={inputClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
