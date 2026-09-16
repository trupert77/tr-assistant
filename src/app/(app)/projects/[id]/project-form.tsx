"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { ProjectRow } from "@/lib/db/types";
import type { ItemOptions } from "@/lib/items/queries";
import { updateProjectAction, type ProjectState } from "../actions";

const label = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export function ProjectForm({
  project,
  workspaces,
}: {
  project: ProjectRow;
  workspaces: ItemOptions["workspaces"];
}) {
  const [state, action, pending] = useActionState<ProjectState, FormData>(
    updateProjectAction,
    {},
  );

  return (
    <form action={action} className={`${ui.cardPad} flex flex-col gap-4`}>
      <input type="hidden" name="id" value={project.id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-name" className={label}>
          Name
        </label>
        <input
          id="project-name"
          name="name"
          defaultValue={project.name}
          required
          maxLength={120}
          className={ui.input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-workspace" className={label}>
          Workspace
        </label>
        <select
          id="project-workspace"
          name="workspace_id"
          defaultValue={project.workspace_id ?? ""}
          className={`${ui.input} appearance-none`}
        >
          <option value="">No workspace</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-description" className={label}>
          Description
        </label>
        <textarea
          id="project-description"
          name="description"
          rows={3}
          defaultValue={project.description ?? ""}
          maxLength={2000}
          className={`${ui.input} rounded-3xl resize-y`}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={ui.btnSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
