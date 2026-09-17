import type { SupabaseClient } from "@supabase/supabase-js";
import { localDayBounds, shiftLocalDate, zonedToIso } from "@/lib/dates";
import { loadGoalProgress } from "@/lib/links";
import type { Database, ItemRow, PersonRole, PersonRow, ProjectRow, WorkspaceRow } from "@/lib/db/types";

type Db = SupabaseClient<Database>;

export type TodayData = {
  overdue: ItemRow[];
  today: ItemRow[];
  upcoming: ItemRow[];
  waiting: ItemRow[];
  recent: ItemRow[];
  /** item id → linked people with their role, for the meta line. */
  people: Map<string, LinkedPerson[]>;
  /** project id → name. */
  projects: Map<string, string>;
};

const UPCOMING_DAYS = 7;
const RECENT_HOURS = 48;

/** Everything the Today screen shows, partitioned by when it is due. */
export async function loadToday(
  db: Db,
  timeZone: string,
  now: Date = new Date(),
): Promise<TodayData> {
  const { today, start, end } = localDayBounds(now, timeZone);
  const weekEnd = zonedToIso(shiftLocalDate(today, UPCOMING_DAYS), "00:00", timeZone)!;
  const recentSince = new Date(now.getTime() - RECENT_HOURS * 3_600_000).toISOString();

  const [{ data: dated }, { data: waitingUndated }, { data: recentUndated }] =
    await Promise.all([
      db
        .from("items")
        .select()
        .in("status", ["open", "waiting"])
        .not("due_at", "is", null)
        .lt("due_at", weekEnd)
        .order("due_at"),
      db
        .from("items")
        .select()
        .eq("kind", "followup")
        .eq("status", "waiting")
        .is("due_at", null)
        .order("created_at", { ascending: false }),
      db
        .from("items")
        .select()
        .in("status", ["open", "waiting"])
        .is("due_at", null)
        .gte("created_at", recentSince)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const overdue: ItemRow[] = [];
  const todayItems: ItemRow[] = [];
  const upcoming: ItemRow[] = [];
  for (const item of dated ?? []) {
    const due = item.due_at!;
    if (due < start) overdue.push(item);
    else if (due < end) todayItems.push(item);
    else upcoming.push(item);
  }

  const waiting = waitingUndated ?? [];
  const waitingIds = new Set(waiting.map((i) => i.id));
  const recent = (recentUndated ?? []).filter((i) => !waitingIds.has(i.id));

  const all = [...overdue, ...todayItems, ...upcoming, ...waiting, ...recent];
  const [people, projects] = await Promise.all([
    loadPeopleFor(db, all.map((i) => i.id)),
    loadProjectNames(db),
  ]);

  return { overdue, today: todayItems, upcoming, waiting, recent, people, projects };
}

export type LinkedPerson = { id: string; name: string; role: PersonRole };

/** item id → linked people, for a set of items. */
export async function loadPeopleFor(
  db: Db,
  itemIds: string[],
): Promise<Map<string, LinkedPerson[]>> {
  const map = new Map<string, LinkedPerson[]>();
  if (!itemIds.length) return map;

  const { data: links } = await db
    .from("item_people")
    .select("item_id, person_id, role")
    .in("item_id", itemIds);
  if (!links?.length) return map;

  const personIds = [...new Set(links.map((l) => l.person_id))];
  const { data: people } = await db.from("people").select("id, name").in("id", personIds);
  const nameById = new Map((people ?? []).map((p) => [p.id, p.name]));

  for (const link of links) {
    const name = nameById.get(link.person_id);
    if (!name) continue;
    const list = map.get(link.item_id) ?? [];
    list.push({ id: link.person_id, name, role: link.role });
    map.set(link.item_id, list);
  }
  return map;
}

export async function loadProjectNames(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from("projects").select("id, name");
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export type ItemOptions = {
  workspaces: Pick<WorkspaceRow, "id" | "name" | "slug">[];
  projects: Pick<ProjectRow, "id" | "name" | "workspace_id">[];
};

/** Choices for the edit form selects. */
export async function loadItemOptions(db: Db): Promise<ItemOptions> {
  const [{ data: workspaces }, { data: projects }] = await Promise.all([
    db.from("workspaces").select("id, name, slug").order("sort_order"),
    db.from("projects").select("id, name, workspace_id").eq("status", "active").order("name"),
  ]);
  return { workspaces: workspaces ?? [], projects: projects ?? [] };
}

// ---------------------------------------------------------------------------
// Projects and people
// ---------------------------------------------------------------------------

export type ProjectSummary = Pick<ProjectRow, "id" | "name" | "workspace_id" | "status"> & {
  workspaceName: string | null;
  openCount: number;
};

/** Active projects with a count of open items each, grouped by workspace order. */
export async function loadProjectSummaries(db: Db): Promise<ProjectSummary[]> {
  const [{ data: projects }, { data: workspaces }, { data: open }] = await Promise.all([
    db.from("projects").select("id, name, workspace_id, status").eq("status", "active").order("name"),
    db.from("workspaces").select("id, name, sort_order").order("sort_order"),
    db.from("items").select("project_id").in("status", ["open", "waiting"]).not("project_id", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const row of open ?? []) {
    if (row.project_id) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  }
  const wsName = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
  const wsOrder = new Map((workspaces ?? []).map((w) => [w.id, w.sort_order]));

  return (projects ?? [])
    .map((p) => ({
      ...p,
      workspaceName: p.workspace_id ? wsName.get(p.workspace_id) ?? null : null,
      openCount: counts.get(p.id) ?? 0,
    }))
    .sort((a, b) => {
      const ao = a.workspace_id ? wsOrder.get(a.workspace_id) ?? 99 : 100;
      const bo = b.workspace_id ? wsOrder.get(b.workspace_id) ?? 99 : 100;
      return ao - bo || a.name.localeCompare(b.name);
    });
}

export type ItemGroups = {
  goals: ItemRow[];
  tasks: ItemRow[];
  waiting: ItemRow[];
  notes: ItemRow[];
  done: ItemRow[];
};

function groupItems(items: ItemRow[]): ItemGroups {
  const g: ItemGroups = { goals: [], tasks: [], waiting: [], notes: [], done: [] };
  for (const i of items) {
    if (i.status === "done" || i.status === "archived") g.done.push(i);
    else if (i.kind === "goal") g.goals.push(i);
    else if (i.kind === "note") g.notes.push(i);
    else if (i.kind === "followup") g.waiting.push(i);
    else g.tasks.push(i);
  }
  return g;
}

/** Everything linked to one project. */
export async function loadProjectItems(db: Db, projectId: string): Promise<ItemGroups> {
  const { data } = await db
    .from("items")
    .select()
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return groupItems(data ?? []);
}

export type PersonSummary = Pick<PersonRow, "id" | "name" | "aliases"> & {
  waitingCount: number;
  totalCount: number;
};

/** All people with how many open items mention them and how many are waiting on them. */
export async function loadPeopleSummaries(db: Db): Promise<PersonSummary[]> {
  const [{ data: people }, { data: links }, { data: open }] = await Promise.all([
    db.from("people").select("id, name, aliases").order("name"),
    db.from("item_people").select("item_id, person_id, role"),
    db.from("items").select("id").in("status", ["open", "waiting"]),
  ]);
  const openIds = new Set((open ?? []).map((i) => i.id));
  const waiting = new Map<string, number>();
  const total = new Map<string, number>();
  for (const l of links ?? []) {
    if (!openIds.has(l.item_id)) continue;
    total.set(l.person_id, (total.get(l.person_id) ?? 0) + 1);
    if (l.role === "waiting_on") waiting.set(l.person_id, (waiting.get(l.person_id) ?? 0) + 1);
  }
  return (people ?? []).map((p) => ({
    ...p,
    waitingCount: waiting.get(p.id) ?? 0,
    totalCount: total.get(p.id) ?? 0,
  }));
}

/** Items linked to one person, split into "waiting on them" and everything else. */
export async function loadPersonItems(
  db: Db,
  personId: string,
): Promise<{ waitingOn: ItemRow[]; other: ItemGroups }> {
  const { data: links } = await db
    .from("item_people")
    .select("item_id, role")
    .eq("person_id", personId);
  if (!links?.length) {
    return { waitingOn: [], other: { goals: [], tasks: [], waiting: [], notes: [], done: [] } };
  }
  const { data: items } = await db
    .from("items")
    .select()
    .in("id", links.map((l) => l.item_id))
    .neq("status", "archived")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const waitingIds = new Set(links.filter((l) => l.role === "waiting_on").map((l) => l.item_id));
  const waitingOn = (items ?? []).filter(
    (i) => waitingIds.has(i.id) && i.status !== "done" && i.status !== "archived",
  );
  const rest = (items ?? []).filter((i) => !waitingOn.includes(i));
  return { waitingOn, other: groupItems(rest) };
}

// ---------------------------------------------------------------------------
// Someday, the weekly review, and focus
// ---------------------------------------------------------------------------

/** Every open item with no date, oldest first, so nothing undated can quietly vanish. */
export async function loadSomeday(db: Db): Promise<{ groups: ItemGroups; meta: RowMeta }> {
  const { data } = await db
    .from("items")
    .select()
    .in("status", ["open", "waiting"])
    .is("due_at", null)
    .order("created_at");
  const items = data ?? [];
  return { groups: groupItems(items), meta: await loadRowMeta(db, items) };
}

/** People and project names for a set of rows, as `ItemRow` wants them. */
export type RowMeta = {
  people: Map<string, LinkedPerson[]>;
  projects: Map<string, string>;
};

async function loadRowMeta(db: Db, items: ItemRow[]): Promise<RowMeta> {
  const [people, projects] = await Promise.all([
    loadPeopleFor(db, items.map((i) => i.id)),
    loadProjectNames(db),
  ]);
  return { people, projects };
}

/** One step per open goal: the first unfinished one that nothing is blocking. */
export type NextStep = { step: ItemRow; goalId: string; goalTitle: string; done: number; total: number };

export async function loadNextSteps(db: Db): Promise<NextStep[]> {
  const progress = await loadGoalProgress(db);
  return progress
    .filter((p) => p.next !== null)
    .map((p) => ({
      step: p.next!,
      goalId: p.goal.id,
      goalTitle: p.goal.title,
      done: p.done,
      total: p.total,
    }));
}

/** Undated tasks older than this have been ignored long enough to need a decision. */
const STALE_TASK_DAYS = 14;

export type ReviewData = {
  inboxCount: number;
  overdue: ItemRow[];
  /** Open tasks with no date that have sat for STALE_TASK_DAYS. */
  staleTasks: ItemRow[];
  /** Follow-ups still waiting with no future date, oldest first. */
  waiting: ItemRow[];
  /** Active projects with nothing open: finished, or missing a next step. */
  quietProjects: Pick<ProjectRow, "id" | "name">[];
  doneThisWeek: number;
  meta: RowMeta;
};

/** One pass over everything that tends to slip, for the weekly review. */
export async function loadReview(db: Db, timeZone: string, now: Date = new Date()): Promise<ReviewData> {
  const { start } = localDayBounds(now, timeZone);
  const staleBefore = new Date(now.getTime() - STALE_TASK_DAYS * 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [inbox, { data: overdue }, { data: staleTasks }, { data: waiting }, projects, done] =
    await Promise.all([
      db
        .from("inbox_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "needs_review", "failed"]),
      db
        .from("items")
        .select()
        .in("status", ["open", "waiting"])
        .lt("due_at", start)
        .order("due_at"),
      db
        .from("items")
        .select()
        .eq("kind", "task")
        .eq("status", "open")
        .is("due_at", null)
        .lt("created_at", staleBefore)
        .order("created_at"),
      db
        .from("items")
        .select()
        .eq("kind", "followup")
        .eq("status", "waiting")
        .or(`due_at.is.null,due_at.lt.${start}`)
        .order("created_at"),
      loadProjectSummaries(db),
      db
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("completed_at", weekAgo),
    ]);

  // A follow-up that is overdue belongs in Overdue only.
  const overdueIds = new Set((overdue ?? []).map((i) => i.id));
  const waitingOnly = (waiting ?? []).filter((i) => !overdueIds.has(i.id));
  const all = [...(overdue ?? []), ...(staleTasks ?? []), ...waitingOnly];

  return {
    inboxCount: inbox.count ?? 0,
    overdue: overdue ?? [],
    staleTasks: staleTasks ?? [],
    waiting: waitingOnly,
    quietProjects: projects.filter((p) => p.openCount === 0).map((p) => ({ id: p.id, name: p.name })),
    doneThisWeek: done.count ?? 0,
    meta: await loadRowMeta(db, all),
  };
}

const FOCUS_COUNT = 3;
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/**
 * The few things that matter most right now: overdue and due today ranked by
 * priority then time, topped up with undated high-priority tasks and then
 * the next step of each goal. `hidden`
 * is how much else is on the board, so focus never pretends it is all there is.
 */
export async function loadFocus(
  db: Db,
  timeZone: string,
  now: Date = new Date(),
): Promise<{ items: ItemRow[]; hidden: number; meta: RowMeta }> {
  const { end } = localDayBounds(now, timeZone);
  const [{ data: due }, { data: urgent }] = await Promise.all([
    db
      .from("items")
      .select()
      .in("status", ["open", "waiting"])
      .lt("due_at", end)
      .order("due_at"),
    db
      .from("items")
      .select()
      .eq("status", "open")
      .eq("priority", "high")
      .is("due_at", null)
      .order("created_at"),
  ]);

  const ranked = [...(due ?? [])].sort(
    (a, b) =>
      (a.priority ? PRIORITY_RANK[a.priority] : 1) - (b.priority ? PRIORITY_RANK[b.priority] : 1) ||
      a.due_at!.localeCompare(b.due_at!),
  );
  // Then the next move on each goal: undated, so nothing else would ever surface it.
  const seen = new Set([...ranked, ...(urgent ?? [])].map((i) => i.id));
  const goalSteps = (await loadNextSteps(db)).map((n) => n.step).filter((s) => !seen.has(s.id));
  const pool = [...ranked, ...(urgent ?? []), ...goalSteps];
  const items = pool.slice(0, FOCUS_COUNT);
  return { items, hidden: pool.length - items.length, meta: await loadRowMeta(db, items) };
}
