import { z } from "zod";

/**
 * What the classifier returns. Every field is present (nullable rather than
 * optional) because structured outputs require a closed schema.
 */
export const classificationSchema = z.object({
  kind: z.enum(["task", "followup", "note"]),
  title: z.string().min(1).max(140),
  body: z.string().nullable(),
  priority: z.enum(["low", "normal", "high"]).nullable(),
  /** YYYY-MM-DD in the user's timezone, or null. */
  due_date: z.string().nullable(),
  /** HH:MM, 24-hour, or null when no time was given. */
  due_time: z.string().nullable(),
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
  /** 0..1, how confident the model is in kind + fields together. */
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;

export type ClassifyContext = {
  now: Date;
  timeZone: string;
  workspaces: { name: string; slug: string }[];
  projects: { name: string; workspaceSlug: string | null }[];
  people: string[];
};

export type ClassifyResult = {
  result: Classification;
  model: string;
};

/** The one interface the rest of the app depends on. Swap providers here. */
export interface AiProvider {
  readonly name: string;
  classify(text: string, ctx: ClassifyContext): Promise<ClassifyResult>;
}
