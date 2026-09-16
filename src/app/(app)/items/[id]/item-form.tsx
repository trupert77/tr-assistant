"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { ItemRow } from "@/lib/db/types";
import type { ItemOptions } from "@/lib/items/queries";
import { updateItemAction, type UpdateState } from "../actions";

const label = "text-[11px] font-semibold uppercase tracking-wider text-muted";
const select = `${ui.input} appearance-none`;

export function ItemForm({
  item,
  options,
  dueDate,
  dueTime,
}: {
  item: ItemRow;
  options: ItemOptions;
  dueDate: string;
  dueTime: string;
}) {
  const [state, action, pending] = useActionState<UpdateState, FormData>(
    updateItemAction,
    {},
  );

  return (
    <form action={action} className={`${ui.cardPad} flex flex-col gap-4`}>
      <input type="hidden" name="id" value={item.id} />

      <Field id="title" text="Title">
        <input
          id="title"
          name="title"
          defaultValue={item.title}
          required
          maxLength={200}
          className={ui.input}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="kind" text="Kind">
          <select id="kind" name="kind" defaultValue={item.kind} className={select}>
            <option value="task">Task</option>
            <option value="followup">Follow-up</option>
            <option value="note">Note</option>
          </select>
        </Field>
        <Field id="status" text="Status">
          <select id="status" name="status" defaultValue={item.status} className={select}>
            <option value="open">Open</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="due_date" text="Due date">
          <input id="due_date" name="due_date" type="date" defaultValue={dueDate} className={ui.input} />
        </Field>
        <Field id="due_time" text="Time">
          <input id="due_time" name="due_time" type="time" defaultValue={dueTime} className={ui.input} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="workspace_id" text="Workspace">
          <select
            id="workspace_id"
            name="workspace_id"
            defaultValue={item.workspace_id ?? ""}
            className={select}
          >
            <option value="">None</option>
            {options.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="project_id" text="Project">
          <select
            id="project_id"
            name="project_id"
            defaultValue={item.project_id ?? ""}
            className={select}
          >
            <option value="">None</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="priority" text="Priority">
          <select
            id="priority"
            name="priority"
            defaultValue={item.priority ?? ""}
            className={select}
          >
            <option value="">Not set</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field id="category" text="Category">
          <input
            id="category"
            name="category"
            defaultValue={item.category ?? ""}
            maxLength={100}
            placeholder="IT / Aspen"
            className={ui.input}
          />
        </Field>
      </div>

      <Field id="tags" text="Tags">
        <input
          id="tags"
          name="tags"
          defaultValue={item.tags.join(", ")}
          placeholder="kalamazoo, networking"
          className={ui.input}
        />
      </Field>

      <Field id="body" text="Notes">
        <textarea
          id="body"
          name="body"
          rows={4}
          defaultValue={item.body ?? ""}
          maxLength={10_000}
          className={`${ui.input} rounded-3xl resize-y`}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={ui.btnPrimary}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  id,
  text,
  children,
}: {
  id: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
    </div>
  );
}
