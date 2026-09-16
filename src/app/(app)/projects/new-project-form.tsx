"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { ItemOptions } from "@/lib/items/queries";
import { createProjectAction, type ProjectState } from "./actions";

export function NewProjectForm({ workspaces }: { workspaces: ItemOptions["workspaces"] }) {
  const [state, action, pending] = useActionState<ProjectState, FormData>(
    createProjectAction,
    {},
  );

  return (
    <form action={action} className={`${ui.cardPad} flex flex-col gap-3`}>
      <label htmlFor="new-project-name" className="sr-only">
        Project name
      </label>
      <input
        id="new-project-name"
        name="name"
        required
        maxLength={120}
        placeholder="Kalamazoo Network Upgrade"
        className={ui.input}
      />
      <div className="flex gap-2">
        <label htmlFor="new-project-workspace" className="sr-only">
          Workspace
        </label>
        <select
          id="new-project-workspace"
          name="workspace_id"
          defaultValue=""
          className={`${ui.input} flex-1 appearance-none`}
        >
          <option value="">No workspace</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={ui.btnPrimary}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
