import Link from "next/link";
import { ArrowRightIcon, CheckIcon, TargetIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import {
  type CecoBoard,
  type CecoInitiative,
  PRIORITY_LABEL,
  groupInitiatives,
  linkedTitles,
  nextStepOf,
  progressOf,
  statusStyle,
  targetDateNote,
  unfinishedUpstream,
} from "@/lib/ceco";
import { formatRelative } from "@/lib/format";

/**
 * CECO's private initiatives board, as this app shows it: what is moving,
 * what is stuck, and how far each one has got. Read-only — the board itself is
 * in CECO, and every edit still happens there.
 */

/**
 * A label, not a control: `ui.chip` is sized for tapping, and these only say
 * what something is. Matches the "N open" badges on the pages list.
 */
const badge = "rounded-full px-2 py-0.5 text-xs font-semibold";

/** The whole board as a section on /ceco. */
export function InitiativesSection({ board }: { board: CecoBoard }) {
  const groups = groupInitiatives(board.initiatives);
  const byId = new Map(board.initiatives.map((i) => [i.id, i]));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={ui.sectionTitle}>
          Initiatives
          <span className="ml-2 text-faint">{board.initiatives.length}</span>
        </h2>
        <a
          href={`${board.app.url}${board.path}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-muted hover:text-foreground"
        >
          Open the board in CECO
        </a>
      </div>

      {board.initiatives.length === 0 ? (
        <p className="text-sm text-muted">The board is empty. Start something in CECO and it lands here.</p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-faint">{group.label}</p>
            <ul className={`${ui.card} divide-y divide-line`}>
              {group.initiatives.map((initiative) => (
                <li key={initiative.id}>
                  <InitiativeRow initiative={initiative} byId={byId} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function InitiativeRow({
  initiative,
  byId,
}: {
  initiative: CecoInitiative;
  byId: Map<string, CecoInitiative>;
}) {
  const status = statusStyle(initiative.status);
  const { done, total, pct } = progressOf(initiative);
  const next = nextStepOf(initiative);
  const target = targetDateNote(initiative.target_date, initiative.status);
  const blockedBy = unfinishedUpstream(initiative, byId);

  return (
    <Link
      href={{ pathname: "/ceco", query: { initiative: initiative.id } }}
      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`size-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden />
          <span className="truncate text-[15px] leading-6">{initiative.title}</span>
        </span>
        {initiative.summary && <span className="truncate text-xs text-muted">{initiative.summary}</span>}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
          {total > 0 && (
            <span>
              {done}/{total} steps
            </span>
          )}
          {next && <span className="truncate">next: {next.title}</span>}
          {target && <span className={target.late ? "text-danger" : undefined}>{target.text}</span>}
          {blockedBy.length > 0 && <span>waiting on {blockedBy.length}</span>}
        </span>
        {total > 0 && <ProgressBar pct={pct} />}
      </span>
      <span className={`${badge} shrink-0 ${status.chip}`}>{status.label}</span>
      <ArrowRightIcon size={16} className="shrink-0 text-faint" />
    </Link>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <span
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="mt-0.5 block h-1 w-full max-w-64 overflow-hidden rounded-full bg-surface-2"
    >
      <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** One initiative in full: its steps, its log, and what it is chained to. */
export function InitiativeDetail({
  initiative,
  board,
  fetchedAt,
  timeZone,
}: {
  initiative: CecoInitiative;
  board: CecoBoard;
  fetchedAt: string;
  timeZone: string;
}) {
  const status = statusStyle(initiative.status);
  const { done, total, pct } = progressOf(initiative);
  const target = targetDateNote(initiative.target_date, initiative.status);
  const byId = new Map(board.initiatives.map((i) => [i.id, i]));
  const waitingOn = linkedTitles(initiative.waiting_on, byId);
  const feedsInto = linkedTitles(initiative.feeds_into, byId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/ceco" className="text-xs font-semibold text-muted hover:text-foreground">
          ← CECO
        </Link>
        <p className={ui.eyebrow}>Initiative</p>
        <h1 className={ui.pageTitle}>{initiative.title}</h1>
        {initiative.summary && <p className="text-sm text-muted">{initiative.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className={`${badge} ${status.chip}`}>{status.label}</span>
          <span className={`${badge} bg-surface-2 text-muted`}>
            {PRIORITY_LABEL[initiative.priority] ?? initiative.priority} priority
          </span>
          {initiative.owner_name && (
            <span className={`${badge} bg-surface-2 text-muted`}>{initiative.owner_name}</span>
          )}
          {target && (
            <span className={`${badge} ${target.late ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted"}`}>
              {target.text}
            </span>
          )}
        </div>
        <p className="pt-1 text-xs text-faint">
          Read-only here. Edit it on the board in CECO; this copy was synced {formatRelative(fetchedAt, timeZone)}.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`${board.app.url}${board.path}`} target="_blank" rel="noreferrer" className={ui.btnSecondary}>
            Open the board in CECO
            <ArrowRightIcon size={16} />
          </a>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>
          Steps
          {total > 0 && (
            <span className="ml-2 text-faint">
              {done}/{total}
            </span>
          )}
        </h2>
        {total === 0 ? (
          <p className="text-sm text-muted">No steps yet — it is still just the idea.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ProgressBar pct={pct} />
            <ul className={`${ui.card} divide-y divide-line`}>
              {initiative.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                      step.done ? "border-note bg-note-soft text-note" : "border-line text-transparent"
                    }`}
                  >
                    <CheckIcon size={12} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`text-[15px] leading-6 ${step.done ? "text-muted line-through" : ""}`}>
                      {step.title}
                    </span>
                    {step.detail && <span className="text-xs text-muted">{step.detail}</span>}
                  </span>
                  <span className="sr-only">{step.done ? "done" : "not done"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {(waitingOn.length > 0 || feedsInto.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>The chain</h2>
          <div className={`${ui.cardPad} flex flex-col gap-4`}>
            {waitingOn.length > 0 && <Chain label="Waiting on" initiatives={waitingOn} />}
            {feedsInto.length > 0 && <Chain label="Feeds into" initiatives={feedsInto} />}
          </div>
        </section>
      )}

      {initiative.notes && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>Notes</h2>
          <p className={`${ui.cardPad} whitespace-pre-wrap text-sm leading-6`}>{initiative.notes}</p>
        </section>
      )}

      {initiative.updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>
            Log
            <span className="ml-2 text-faint">{initiative.updates.length}</span>
          </h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {initiative.updates.map((update) => (
              <li key={update.id} className="flex flex-col gap-0.5 px-5 py-3">
                <span className={`text-sm leading-6 ${update.kind === "system" ? "text-muted" : ""}`}>
                  {update.body}
                </span>
                <span className="text-xs text-faint">{formatRelative(update.created_at, timeZone)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Chain({ label, initiatives }: { label: string; initiatives: CecoInitiative[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-faint">{label}</p>
      <ul className="flex flex-col gap-1.5">
        {initiatives.map((initiative) => {
          const status = statusStyle(initiative.status);
          return (
            <li key={initiative.id}>
              <Link
                href={{ pathname: "/ceco", query: { initiative: initiative.id } }}
                className="flex items-center gap-2 text-sm leading-6 hover:text-accent"
              >
                <TargetIcon size={14} className="shrink-0 text-faint" />
                <span className="truncate">{initiative.title}</span>
                <span className={`${badge} shrink-0 ${status.chip}`}>{status.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
