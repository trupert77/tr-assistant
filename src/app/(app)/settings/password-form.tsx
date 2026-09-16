"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { setPassword, type SettingsState } from "./actions";

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
        className={ui.input}
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
        className={ui.input}
      />
      <button type="submit" disabled={pending} className={ui.btnPrimary}>
        {pending ? "Saving…" : "Save password"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}
