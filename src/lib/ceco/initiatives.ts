import { z } from "zod";
import { type Db, fetchCecoPayload, loadMirror, saveMirror, syncMirrorIfStale } from "./client";

/**
 * CECO's private initiatives board, mirrored read-only.
 *
 * The board lives at ceco.info/initiatives and is not part of the portal's
 * public scope — it is Travis's own list of what he is building there, with
 * ordered steps, a log, and dependencies between entries. CECO publishes one
 * board at GET /api/assistant/initiatives, chosen by its own
 * ASSISTANT_INITIATIVES_BOARD setting; nothing this app sends can pick a
 * different one.
 *
 * Same shape of deal as the scope: fetch, keep the last good copy in
 * `external_scopes`, read the copy everywhere. Nothing here can change an
 * initiative — that still happens in CECO.
 */

export const CECO_INITIATIVES_SOURCE = "ceco_initiatives";

/**
 * Refreshed more eagerly than the scope: pages and What's New change when
 * CECO deploys, but a step gets checked off mid-afternoon.
 */
const STALE_AFTER_MS = 90 * 60_000;

/** The newest payload shape this app understands. */
const SUPPORTED_SCHEMA = 1;

// Lenient about added fields, and about status and priority in particular:
// CECO may grow a sixth status without this mirror going dark. Anything it
// does not recognise is labelled as it arrived.
const stepSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  detail: z.string().nullable(),
  done: z.boolean(),
  done_at: z.string().nullable(),
});

const updateSchema = z.object({
  id: z.string(),
  body: z.string(),
  created_at: z.string(),
  kind: z.string(),
});

const initiativeSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  target_date: z.string().nullable(),
  notes: z.string().nullable(),
  owner_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  sort_order: z.number(),
  steps: z.array(stepSchema),
  updates: z.array(updateSchema),
  feeds_into: z.array(z.string()),
  waiting_on: z.array(z.string()),
});

const boardSchema = z.object({
  schema: z.number(),
  generatedAt: z.string(),
  board: z.string(),
  app: z.object({
    name: z.string(),
    version: z.string(),
    commit: z.string(),
    buildDate: z.string(),
    url: z.string(),
  }),
  path: z.string(),
  initiatives: z.array(initiativeSchema),
});

export type CecoBoard = z.infer<typeof boardSchema>;
export type CecoInitiative = CecoBoard["initiatives"][number];
export type CecoInitiativeStep = z.infer<typeof stepSchema>;
export type CecoInitiativeUpdate = z.infer<typeof updateSchema>;

/** Ask CECO for the board. Throws with a message fit to show in Settings. */
export async function fetchCecoInitiatives(): Promise<CecoBoard> {
  return fetchCecoPayload("/api/assistant/initiatives", "initiatives", boardSchema, SUPPORTED_SCHEMA);
}

/** Fetch and store. `userId` is written explicitly so the service-role tick can call this too. */
export async function syncCecoInitiatives(db: Db, userId: string): Promise<CecoBoard> {
  const board = await fetchCecoInitiatives();
  await saveMirror(db, userId, CECO_INITIATIVES_SOURCE, board);
  return board;
}

/** For the tick: refresh only when the copy is missing or old. Never throws. */
export async function syncCecoInitiativesIfStale(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return syncMirrorIfStale(db, userId, CECO_INITIATIVES_SOURCE, STALE_AFTER_MS, syncCecoInitiatives, now);
}

export type StoredCecoBoard = { board: CecoBoard; fetchedAt: string };

/**
 * The last good copy, or null when there is none — not connected, never
 * synced, or CECO has the endpoint turned off. A board with no initiatives on
 * it is not null; it is an empty board, and says so.
 */
export async function loadCecoInitiatives(db: Db, userId?: string): Promise<StoredCecoBoard | null> {
  const stored = await loadMirror(db, CECO_INITIATIVES_SOURCE, userId);
  if (!stored) return null;
  const parsed = boardSchema.safeParse(stored.payload);
  return parsed.success ? { board: parsed.data, fetchedAt: stored.fetchedAt } : null;
}

// ---------------------------------------------------------------------------
// Reading a board. Pure helpers, so they can be tested without a database.
// ---------------------------------------------------------------------------

/** CECO's own status labels, and which of this app's colors each one borrows. */
export const INITIATIVE_STATUS = {
  idea: { label: "Idea", chip: "bg-surface-2 text-muted", dot: "bg-faint" },
  active: { label: "Active", chip: "bg-accent-soft text-accent", dot: "bg-accent" },
  blocked: { label: "Blocked", chip: "bg-danger-soft text-danger", dot: "bg-danger" },
  hold: { label: "On hold", chip: "bg-followup-soft text-followup", dot: "bg-followup" },
  done: { label: "Done", chip: "bg-note-soft text-note", dot: "bg-note" },
} as const;

export type InitiativeStatus = keyof typeof INITIATIVE_STATUS;
export type InitiativeStyle = { label: string; chip: string; dot: string };

/**
 * How a status reads and looks. A status CECO has invented since keeps its own
 * name in a neutral chip, rather than being dropped or mislabelled.
 */
export function statusStyle(status: string): InitiativeStyle {
  return INITIATIVE_STATUS[status as InitiativeStatus] ?? { ...INITIATIVE_STATUS.idea, label: status };
}

export const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

/** Steps done / total, plus the percentage the bars use. No steps reads as 0%, not 100%. */
export function progressOf(initiative: CecoInitiative): { done: number; total: number; pct: number } {
  const total = initiative.steps.length;
  const done = initiative.steps.filter((s) => s.done).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** The step you would work on next: the first one not checked off. */
export function nextStepOf(initiative: CecoInitiative): CecoInitiativeStep | null {
  return initiative.steps.find((s) => !s.done) ?? null;
}

/** Finished work, in CECO's terms. Everything else is still live in some way. */
export function isDone(initiative: CecoInitiative): boolean {
  return initiative.status === "done";
}

/**
 * The board split the way it is worth reading: what is moving, what is stuck,
 * what has not started, and what is finished. Each keeps CECO's own order.
 */
export function groupInitiatives(initiatives: CecoInitiative[]): {
  key: string;
  label: string;
  initiatives: CecoInitiative[];
}[] {
  const of = (...statuses: string[]) => initiatives.filter((i) => statuses.includes(i.status));
  return [
    { key: "active", label: "Active", initiatives: of("active") },
    { key: "attention", label: "Blocked and on hold", initiatives: of("blocked", "hold") },
    { key: "idea", label: "Ideas", initiatives: of("idea") },
    { key: "done", label: "Done", initiatives: of("done") },
    // Anything CECO has invented since, so a new status is visible rather than
    // silently dropped from the page.
    {
      key: "other",
      label: "Other",
      initiatives: initiatives.filter(
        (i) => !["active", "blocked", "hold", "idea", "done"].includes(i.status),
      ),
    },
  ].filter((group) => group.initiatives.length > 0);
}

/**
 * Titles for the ids an initiative feeds into or waits on. Ids whose
 * initiative is not on the board are dropped: CECO already filters those, and
 * a bare id would mean nothing on screen.
 */
export function linkedTitles(ids: string[], byId: Map<string, CecoInitiative>): CecoInitiative[] {
  return ids.map((id) => byId.get(id)).filter((i): i is CecoInitiative => Boolean(i));
}

/** Upstream work that is not finished — the reason a "waiting on" link is worth showing. */
export function unfinishedUpstream(
  initiative: CecoInitiative,
  byId: Map<string, CecoInitiative>,
): CecoInitiative[] {
  return linkedTitles(initiative.waiting_on, byId).filter((up) => !isDone(up));
}

/**
 * A YYYY-MM-DD date as a local one. `new Date(value)` would read it as UTC
 * midnight and show the day before, west of Greenwich.
 */
export function formatTargetDate(value: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

/**
 * Whole days until a target date, negative once it has passed, counted from
 * local midnight so "today" is 0 all day.
 */
export function daysUntilTarget(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - midnight.getTime()) / 86_400_000);
}

/** How a target date reads on a card: "in 4 days", "today", "3 days late". */
export function targetDateNote(
  value: string | null,
  status: string,
  now: Date = new Date(),
): { text: string; late: boolean } | null {
  const formatted = formatTargetDate(value);
  if (!formatted) return null;
  const days = daysUntilTarget(value, now);
  // A finished initiative's date is history, not a deadline.
  if (days === null || isDoneStatus(status)) return { text: formatted, late: false };
  if (days === 0) return { text: `${formatted} · today`, late: false };
  if (days < 0) {
    const late = Math.abs(days);
    return { text: `${formatted} · ${late} day${late === 1 ? "" : "s"} late`, late: true };
  }
  return { text: `${formatted} · in ${days} day${days === 1 ? "" : "s"}`, late: false };
}

function isDoneStatus(status: string): boolean {
  return status === "done";
}
