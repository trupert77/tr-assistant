import { EmptyState } from "@/components/empty-state";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ItemKind } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { promoteAction } from "../actions";

const KIND_LABEL: Record<ItemKind, string> = {
  task: "Task",
  followup: "Follow-up",
  note: "Note",
};

const KINDS: ItemKind[] = ["task", "followup", "note"];

export default async function InboxPage() {
  const db = await createSupabaseServerClient();
  const timeZone = getServerEnv().APP_TIMEZONE;

  const [{ data: pending }, { data: filed }] = await Promise.all([
    db
      .from("inbox_items")
      .select()
      .in("status", ["pending", "needs_review", "failed"])
      .order("created_at", { ascending: false }),
    db
      .from("items")
      .select("id, kind, title, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        {!pending?.length ? (
          <EmptyState>Inbox is empty. Anything you capture shows up here.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="whitespace-pre-wrap break-words text-base">
                  {row.raw_text}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {formatRelative(row.created_at, timeZone)}
                    {row.source !== "web" && ` · ${row.source}`}
                    {row.status === "failed" && " · classification failed"}
                  </span>
                  <form action={promoteAction} className="flex gap-1.5">
                    <input type="hidden" name="inboxItemId" value={row.id} />
                    {KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="submit"
                        name="kind"
                        value={kind}
                        className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        {KIND_LABEL[kind]}
                      </button>
                    ))}
                  </form>
                </div>
                {row.ai_error && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {row.ai_error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!!filed?.length && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Recently filed
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filed.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-zinc-500">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatRelative(item.created_at, timeZone)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
