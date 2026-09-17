import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ExampleCaptures } from "@/components/example-captures";
import { CameraIcon, CheckIcon, FolderIcon, InboxIcon, SparklesIcon } from "@/components/icons";
import { KindLegend } from "@/components/kind-legend";
import { SubmitChip } from "@/components/submit-chip";
import { kindStyles, ui } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { formatDue } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { InboxItemRow, ItemKind, ItemRow } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { PHOTO_ONLY_TEXT } from "@/lib/ai/prompt";
import { parseStoredResult } from "@/lib/ai/types";
import { acceptAction, classifyAction, createProjectFromReviewAction, promoteAction } from "../actions";

const KINDS: ItemKind[] = ["task", "followup", "note"];

type ReviewItem = Pick<ItemRow, "id" | "kind" | "title" | "due_at" | "category" | "project_id" | "inbox_item_id">;

/**
 * The project name the classifier proposed for the row's first item, when it
 * did not match an existing one. Later items of a split capture get theirs
 * from the item page.
 */
function proposedProject(row: InboxItemRow, item?: { project_id: string | null }): string | null {
  if (row.status !== "needs_review" || !item || item.project_id) return null;
  return parseStoredResult(row.ai_result)[0]?.project_name?.trim() || null;
}

type Filed = Pick<ItemRow, "id" | "kind" | "title" | "created_at" | "due_at">;

export default async function InboxPage() {
  const db = await createSupabaseServerClient();
  const timeZone = getServerEnv().APP_TIMEZONE;
  const aiEnabled = getAiProvider() !== null;

  const [{ data: open }, { data: filed }] = await Promise.all([
    db
      .from("inbox_items")
      .select()
      .in("status", ["pending", "processing", "needs_review", "failed"])
      .order("created_at", { ascending: false }),
    db
      .from("items")
      .select("id, kind, title, created_at, due_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Items already created for needs_review rows, so we can show the AI's
  // filing. A capture that listed several things has several.
  const reviewRowIds = (open ?? []).filter((r) => r.item_id).map((r) => r.id);
  const { data: reviewItems } = reviewRowIds.length
    ? await db
        .from("items")
        .select("id, kind, title, due_at, category, project_id, inbox_item_id")
        .in("inbox_item_id", reviewRowIds)
        .order("created_at")
    : { data: [] as ReviewItem[] };
  const itemById = new Map((reviewItems ?? []).map((i) => [i.id, i]));
  const itemsByRow = new Map<string, ReviewItem[]>();
  for (const i of reviewItems ?? []) {
    if (!i.inbox_item_id) continue;
    itemsByRow.set(i.inbox_item_id, [...(itemsByRow.get(i.inbox_item_id) ?? []), i]);
  }

  const count = open?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h1 className={ui.pageTitle}>Inbox</h1>
          {count > 0 && (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
              {count} to review
            </span>
          )}
        </div>
        <KindLegend />
        {count === 0 ? (
          <EmptyState
            icon={<InboxIcon size={22} />}
            title="All clear"
            action={!filed?.length ? <ExampleCaptures /> : undefined}
          >
            {aiEnabled
              ? "Captures are filed automatically. Anything the assistant wasn't sure about waits here."
              : "Anything you capture shows up here until you file it."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {open!.map((row) => (
              <InboxCard
                key={row.id}
                row={row}
                item={row.item_id ? itemById.get(row.item_id) : undefined}
                extras={(itemsByRow.get(row.id) ?? []).filter((i) => i.id !== row.item_id)}
                timeZone={timeZone}
                aiEnabled={aiEnabled}
              />
            ))}
          </ul>
        )}
      </section>

      {!!filed?.length && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>Recently filed</h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {(filed as Filed[]).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-surface-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${kindStyles[item.kind].dot}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {item.due_at
                      ? formatDue(item.due_at, timeZone)
                      : `${kindStyles[item.kind].label} · ${formatRelative(item.created_at, timeZone)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InboxCard({
  row,
  item,
  extras,
  timeZone,
  aiEnabled,
}: {
  row: InboxItemRow;
  item?: ReviewItem;
  /** The second and later items when the capture split into several. */
  extras: ReviewItem[];
  timeZone: string;
  aiEnabled: boolean;
}) {
  const newProject = proposedProject(row, item);
  const meta = [
    formatRelative(row.created_at, timeZone),
    row.source !== "web" ? `via ${row.source}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={`${ui.cardPad} flex flex-col gap-3`}>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
        {row.attachment_path && (
          <CameraIcon size={15} className="mr-2 inline-block align-[-2px] text-accent" aria-label="Has a photo" />
        )}
        {row.raw_text === PHOTO_ONLY_TEXT ? <span className="text-muted">Photo</span> : row.raw_text}
      </p>

      {row.status === "needs_review" && item && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <SparklesIcon size={15} className="shrink-0 text-accent" />
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kindStyles[item.kind].chip}`}>
              {kindStyles[item.kind].label}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
          </div>
          <p className="text-xs text-muted">
            {[
              item.due_at ? formatDue(item.due_at, timeZone) : null,
              item.category,
              row.ai_confidence !== null
                ? `${Math.round(row.ai_confidence * 100)}% sure`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Not sure about this one"}
          </p>
          {extras.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
              {extras.map((extra) => (
                <li key={extra.id}>
                  <Link href={`/items/${extra.id}`} className="flex items-center gap-2 text-xs hover:text-accent">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kindStyles[extra.kind].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{extra.title}</span>
                    {extra.due_at && (
                      <span className="shrink-0 text-muted">{formatDue(extra.due_at, timeZone)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {row.status === "failed" && row.ai_error && (
        <p className="rounded-2xl bg-danger-soft px-4 py-2.5 text-xs text-danger">
          Couldn&apos;t file automatically: {row.ai_error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {row.status === "processing" ? "Filing…" : meta}
        </span>

        {row.status !== "processing" && (
          <div className="flex flex-wrap gap-1.5">
            {row.status === "needs_review" && (
              <form action={acceptAction}>
                <input type="hidden" name="inboxItemId" value={row.id} />
                <SubmitChip className="bg-linear-to-r from-accent to-accent-2 text-accent-foreground shadow-glow">
                  <CheckIcon size={14} strokeWidth={2.4} />
                  Looks right
                </SubmitChip>
              </form>
            )}

            {newProject && (
              <form action={createProjectFromReviewAction}>
                <input type="hidden" name="inboxItemId" value={row.id} />
                <input type="hidden" name="name" value={newProject} />
                <button type="submit" className={`${ui.chip} bg-accent-soft text-accent`}>
                  <FolderIcon size={14} />
                  Add project &ldquo;{newProject}&rdquo;
                </button>
              </form>
            )}

            {aiEnabled && (row.status === "pending" || row.status === "failed") && (
              <form action={classifyAction}>
                <input type="hidden" name="inboxItemId" value={row.id} />
                <SubmitChip className="bg-accent-soft text-accent">
                  <SparklesIcon size={14} />
                  {row.status === "failed" ? "Retry" : "Auto-file"}
                </SubmitChip>
              </form>
            )}

            <form action={promoteAction} className="flex gap-1.5">
              <input type="hidden" name="inboxItemId" value={row.id} />
              {KINDS.filter((k) => k !== item?.kind).map((kind) => (
                <SubmitChip key={kind} name="kind" value={kind} className={kindStyles[kind].chip}>
                  <span className={`h-1.5 w-1.5 rounded-full ${kindStyles[kind].dot}`} />
                  {kindStyles[kind].label}
                </SubmitChip>
              ))}
            </form>
          </div>
        )}
      </div>
    </li>
  );
}
