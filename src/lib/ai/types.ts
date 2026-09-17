import { z } from "zod";

export const RECURRENCES = [
  "daily",
  "weekdays",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

/**
 * One filed item. Every field is present (nullable rather than optional)
 * because structured outputs require a closed schema.
 */
export const classificationSchema = z.object({
  kind: z.enum(["task", "followup", "note", "goal"]),
  title: z.string().min(1).max(140),
  body: z.string().nullable(),
  priority: z.enum(["low", "normal", "high"]).nullable(),
  /** YYYY-MM-DD in the user's timezone, or null. */
  due_date: z.string().nullable(),
  /** HH:MM, 24-hour, or null when no time was given. */
  due_time: z.string().nullable(),
  /** How often it repeats, or null. due_date is then the first occurrence. */
  recurrence: z.enum(RECURRENCES).nullable(),
  /** Slug of one of the provided workspaces, or null. */
  workspace_slug: z.string().nullable(),
  /** Name of one of the provided projects, a new project name, or null. */
  project_name: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  people: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["waiting_on", "mentioned"]),
    }),
  ),
  /** Paths of the CECO portal pages this is about, from the provided list. Usually empty. */
  ceco_pages: z.array(z.string()),
  /** 0..1, how confident the model is in kind + fields together. */
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;

/** Most items one capture may split into; anything past this is dropped. */
export const MAX_ITEMS_PER_CAPTURE = 8;

/**
 * What the classifier returns: one entry per distinct thing in the capture.
 * A brain dump like "call Matt, order toner, the switch is flaky" is three.
 */
export const captureResultSchema = z.object({
  items: z.array(classificationSchema),
});

export type CaptureResult = z.infer<typeof captureResultSchema>;

/**
 * Read a stored `inbox_items.ai_result`. Rows filed before multi-item
 * captures hold a bare classification; newer rows hold `{ items }`.
 */
export function parseStoredResult(value: unknown): Classification[] {
  const many = captureResultSchema.safeParse(value);
  if (many.success) return many.data.items;
  // Older rows predate `recurrence` and `ceco_pages`.
  const legacy = classificationSchema.extend({
    recurrence: classificationSchema.shape.recurrence.default(null),
    ceco_pages: classificationSchema.shape.ceco_pages.default([]),
  });
  const olderMany = z.object({ items: z.array(legacy) }).safeParse(value);
  if (olderMany.success) return olderMany.data.items;
  const one = legacy.safeParse(value);
  return one.success ? [one.data] : [];
}

export type ClassifyContext = {
  now: Date;
  timeZone: string;
  workspaces: { name: string; slug: string }[];
  projects: { name: string; workspaceSlug: string | null }[];
  people: string[];
  /** The CECO portal's pages, when that connection is set up. Empty otherwise. */
  cecoPages: { path: string; title: string; area: string }[];
};

/** A photo attached to a capture, already base64-encoded. */
export type ClassifyImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

export type ClassifyResult = {
  results: Classification[];
  model: string;
};

/** One stored item, flattened for the answer prompt. */
export type ContextItem = {
  id: string;
  kind: "task" | "followup" | "note" | "goal";
  status: "open" | "waiting" | "done" | "archived";
  title: string;
  body: string | null;
  priority: "low" | "normal" | "high" | null;
  due_at: string | null;
  recurrence: string | null;
  category: string | null;
  tags: string[];
  project: string | null;
  people: { name: string; role: "waiting_on" | "mentioned" | "owner" }[];
  /** CECO portal pages the item is about. */
  cecoPages: string[];
  created_at: string;
};

/** A calendar event, read-only, for "what does my day look like". */
export type ContextEvent = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
};

export type AnswerContext = {
  now: Date;
  timeZone: string;
  items: ContextItem[];
  /** True when the item list was cut off, so the model can say so. */
  truncated: boolean;
  /** Today's and tomorrow's calendar, empty when no calendar is connected. */
  events: ContextEvent[];
  /** What shipped to the CECO portal lately, newest first. Empty when not connected. */
  cecoUpdates: { date: string; title: string; pages: string[] }[];
};

/** An earlier exchange in the same conversation, oldest first. */
export type AnswerTurn = { question: string; answer: string };

/**
 * Something the assistant proposes to change. Nothing runs until Travis taps
 * Apply, so a wrong guess costs one glance, not a lost task.
 */
export const assistantActionSchema = z.object({
  type: z.enum(["complete", "reopen", "reschedule", "set_priority", "archive", "create"]),
  /** Id from the provided list. Null only for create. */
  item_id: z.string().nullable(),
  /** reschedule: YYYY-MM-DD, or null to clear the date. */
  due_date: z.string().nullable(),
  /** reschedule: HH:MM 24-hour, or null. */
  due_time: z.string().nullable(),
  /** set_priority only. */
  priority: z.enum(["low", "normal", "high"]).nullable(),
  /** create: the capture text, written the way Travis would type it. */
  text: z.string().nullable(),
  /** Shown on the confirm button row: "Mark 'Order toner' done". */
  summary: z.string(),
});

export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const answerSchema = z.object({
  /** Plain text. Short lines, "-" bullets allowed, no markdown headings. */
  answer: z.string(),
  /** Ids from the provided list that the answer relies on, most relevant first. */
  cited_item_ids: z.array(z.string()),
  /** Changes to make, only when the question asked for one. Usually empty. */
  actions: z.array(assistantActionSchema),
});

export type AnswerResult = {
  answer: string;
  citedItemIds: string[];
  actions: AssistantAction[];
  model: string;
};

/** What the nudge writer sees about one stale follow-up. */
export type NudgeInput = {
  person: string;
  title: string;
  body: string | null;
  waitingDays: number;
  dueLabel: string | null;
};

/** What the planner sees about one goal. */
export type PlanInput = {
  title: string;
  body: string | null;
  /** Steps the goal already has, in order, so the plan does not repeat them. */
  existingSteps: string[];
};

export const planSchema = z.object({
  steps: z.array(
    z.object({
      /** Imperative, specific, small enough to finish in one sitting. */
      title: z.string(),
      /** One line of extra detail, or null. */
      detail: z.string().nullable(),
    }),
  ),
});

export type PlanStep = z.infer<typeof planSchema>["steps"][number];

/** The one interface the rest of the app depends on. Swap providers here. */
export interface AiProvider {
  readonly name: string;
  classify(text: string, ctx: ClassifyContext, image?: ClassifyImage): Promise<ClassifyResult>;
  answer(question: string, ctx: AnswerContext, history?: AnswerTurn[]): Promise<AnswerResult>;
  /** A short message Travis can paste to chase a follow-up. Plain text. */
  draftNudge(input: NudgeInput): Promise<string>;
  /** Break a goal into ordered steps. Proposals only; the caller decides what to keep. */
  planGoal(input: PlanInput): Promise<PlanStep[]>;
}
