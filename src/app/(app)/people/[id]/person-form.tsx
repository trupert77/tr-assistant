"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { PersonRow } from "@/lib/db/types";
import { updatePersonAction, type PersonState } from "../actions";

const label = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export function PersonForm({ person }: { person: PersonRow }) {
  const [state, action, pending] = useActionState<PersonState, FormData>(
    updatePersonAction,
    {},
  );

  return (
    <form action={action} className={`${ui.cardPad} flex flex-col gap-4`}>
      <input type="hidden" name="id" value={person.id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="person-name" className={label}>
          Name
        </label>
        <input
          id="person-name"
          name="name"
          defaultValue={person.name}
          required
          maxLength={120}
          className={ui.input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="person-aliases" className={label}>
          Also known as
        </label>
        <input
          id="person-aliases"
          name="aliases"
          defaultValue={person.aliases.join(", ")}
          placeholder="Matthew, Matt J"
          className={ui.input}
        />
        <p className="text-xs text-muted">
          Comma-separated. The assistant matches any of these to this person.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="person-notes" className={label}>
          Notes
        </label>
        <textarea
          id="person-notes"
          name="notes"
          rows={3}
          defaultValue={person.notes ?? ""}
          maxLength={5000}
          placeholder="Role, company, how to reach them"
          className={`${ui.input} rounded-3xl resize-y`}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-muted">
          Saved.
        </p>
      )}
      <button type="submit" disabled={pending} className={ui.btnSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
