import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon, RepeatIcon } from "@/components/icons";
import { ArchiveButton } from "@/components/row-actions";
import { kindStyles, ui } from "@/components/ui";
import { getUserAiProvider } from "@/lib/ai/preference";
import { signedCaptureUrl } from "@/lib/capture/attachments";
import { loadCecoPagesFor, loadCecoScope } from "@/lib/ceco";
import { formatDue, isoToZonedParts } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { loadItemOptions, loadPeopleFor } from "@/lib/items/queries";
import { RECURRENCE_LABELS } from "@/lib/items/recurrence";
import { loadLinksFor } from "@/lib/links";
import { completeAction, reopenAction, snoozeAction } from "../actions";
import { CecoPages } from "./ceco-pages";
import { Connections } from "./connections";
import { GoalSteps } from "./goal-steps";
import { ItemForm } from "./item-form";
import { NudgeDrafter } from "./nudge-drafter";

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const { saved } = await searchParams;
  const timeZone = getServerEnv().APP_TIMEZONE;

  const db = await createSupabaseServerClient();
  const { data: item } = await db.from("items").select().eq("id", id).maybeSingle();
  if (!item) notFound();

  const [options, peopleMap, photoUrl, links, provider, ceco, cecoLinked] = await Promise.all([
    loadItemOptions(db),
    loadPeopleFor(db, [item.id]),
    item.attachment_path ? signedCaptureUrl(db, item.attachment_path) : null,
    loadLinksFor(db, item.id),
    item.kind === "goal" ? getUserAiProvider() : null,
    loadCecoScope(db),
    loadCecoPagesFor(db, [item.id]),
  ]);
  const people = peopleMap.get(item.id) ?? [];
  const due = item.due_at ? isoToZonedParts(item.due_at, timeZone) : null;
  const done = item.status === "done";
  const chase =
    item.kind === "followup" && !done ? people.find((p) => p.role === "waiting_on") : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-foreground">
          ← Today
        </Link>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${kindStyles[item.kind].chip}`}>
            {kindStyles[item.kind].label}
          </span>
          {item.due_at && (
            <span className="text-xs text-muted">{formatDue(item.due_at, timeZone)}</span>
          )}
          {item.recurrence && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <RepeatIcon size={12} strokeWidth={2.2} />
              {RECURRENCE_LABELS[item.recurrence]}
            </span>
          )}
          {done && <span className="text-xs font-semibold text-accent">Done</span>}
        </div>
        <h1 className={`${ui.pageTitle} ${done ? "text-muted line-through" : ""}`}>
          {item.title}
        </h1>
      </div>

      {saved && (
        <p role="status" className="rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-accent">
          Saved.
        </p>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <form action={done ? reopenAction : completeAction}>
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" className={done ? ui.btnSecondary : ui.btnPrimary}>
            <CheckIcon size={16} strokeWidth={2.6} />
            {done ? "Reopen" : "Done"}
          </button>
        </form>
        {!done && item.kind !== "note" && (
          <>
            <form action={snoozeAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" name="until" value="tomorrow" className={ui.btnSecondary}>
                Tomorrow
              </button>
            </form>
            <form action={snoozeAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" name="until" value="next-week" className={ui.btnSecondary}>
                Next week
              </button>
            </form>
          </>
        )}
      </div>

      {people.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={ui.sectionTitle}>People</h2>
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={`${p.id}-${p.role}`}>
                <Link
                  href={`/people/${p.id}`}
                  className="inline-block rounded-full border border-line bg-surface px-3 py-1 text-xs transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  {p.name}
                  {p.role === "waiting_on" && <span className="text-muted"> · waiting on</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.kind === "goal" && (
        <GoalSteps goalId={item.id} steps={links.steps} aiEnabled={provider !== null} />
      )}

      {chase && <NudgeDrafter id={item.id} person={chase.name} />}

      {item.status !== "archived" && <Connections itemId={item.id} kind={item.kind} links={links} />}

      {ceco && item.status !== "archived" && (
        <CecoPages
          itemId={item.id}
          linked={cecoLinked.get(item.id) ?? []}
          pages={ceco.scope.pages.map((p) => ({
            path: p.path,
            title: p.title,
            area: ceco.scope.areas.find((a) => a.key === p.area)?.label ?? p.area,
          }))}
        />
      )}

      {photoUrl && (
        <section className="flex flex-col gap-2">
          <h2 className={ui.sectionTitle}>Photo</h2>
          <a href={photoUrl} target="_blank" rel="noreferrer" className={`${ui.card} overflow-hidden`}>
            {/* A short-lived signed URL; next/image would cache a link that expires. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Photo attached to this capture" className="max-h-[28rem] w-full object-contain" />
          </a>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>Details</h2>
        <ItemForm
          item={item}
          options={options}
          dueDate={due?.date ?? ""}
          dueTime={due && due.time !== "09:00" ? due.time : ""}
        />
      </section>

      {item.source_text && item.source_text.trim() !== item.title && (
        <section className="flex flex-col gap-2">
          <h2 className={ui.sectionTitle}>Original capture</h2>
          <p className={`${ui.cardPad} whitespace-pre-wrap break-words text-sm leading-6 text-muted`}>
            {item.source_text}
          </p>
        </section>
      )}

      <div className="flex items-center justify-between pt-2 text-xs text-faint">
        <span>Captured {formatRelative(item.created_at, timeZone)}</span>
        {item.status !== "archived" && <ArchiveButton id={item.id} title={item.title} />}
      </div>
    </div>
  );
}
