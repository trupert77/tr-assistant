import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeNow, localDate } from "@/lib/dates";
import {
  classificationSchema,
  type AiProvider,
  type ClassifyContext,
} from "./types";

/**
 * Static so it caches across calls. Everything that changes per request
 * (date, workspaces, projects, people, the text) goes in the user message.
 */
const SYSTEM_PROMPT = `You file short notes for one person, Travis, into his personal assistant. He types a thought in plain language; you decide what it is and fill in the structured fields. He never picks a type himself, so your judgement is the whole product.

Kinds:
- task: something Travis himself needs to do. "Order access points", "remind me to renew the domain".
- followup: something Travis is waiting on from another person, or needs to check back on later. "Follow up with Gary next week", "waiting on Matt for SQL access", "check on the order". If a specific person is the one who must act or respond, it is a followup.
- note: information worth keeping that needs no action. "Remember that the printer uses 10.10.20.45", "Idea: add maintenance percentage to the dashboard".

Rules:
- Preserve every concrete detail from the input somewhere: title, body, tags, or people. Never drop an IP address, a name, a number, or a place.
- title: short, specific, imperative for tasks and followups ("Check with Matt about Aspen SQL login"), descriptive for notes. No trailing period. Leave out filler like "remind me to" or "I need to".
- body: extra detail that does not fit the title, otherwise null. Do not repeat the title.
- due_date: only when the input implies a date. Resolve relative phrases from the current date you are given. "Friday" means the next Friday, or today if today is Friday. "next week" means Monday of next week. "tomorrow" is the next calendar day. "end of month" is the last day of this month. Never guess a date that was not implied.
- due_time: only when a time was stated. Use 24-hour HH:MM.
- workspace_slug: choose from the provided list, or null when unclear. Work topics (customers, branches, equipment, IT systems, employees) belong to the work workspace; family, house, and personal errands belong to personal or home.
- project_name: the exact name of a provided project when the input clearly belongs to it. If it clearly describes a project that is not listed, you may propose a new name. Otherwise null.
- category: a short label like "IT / Aspen", "Networking", "Purchasing", "Personal admin", or null.
- tags: a few lowercase keywords useful for search. Include place names and system names.
- people: everyone named. role is waiting_on when Travis is waiting on that person or must contact them for a followup; otherwise mentioned. Use the name as written, matching a provided person when it is clearly the same one.
- priority: only when the input signals it ("urgent", "asap", "whenever"). Otherwise null.
- confidence: your honest confidence in kind plus the fields together. Use below 0.7 when the kind is ambiguous, a date is uncertain, or you proposed a new project.
- reasoning: one sentence.`;

function buildUserMessage(text: string, ctx: ClassifyContext): string {
  const workspaces = ctx.workspaces
    .map((w) => `- ${w.slug}: ${w.name}`)
    .join("\n");
  const projects = ctx.projects.length
    ? ctx.projects
        .map((p) => `- ${p.name}${p.workspaceSlug ? ` (${p.workspaceSlug})` : ""}`)
        .join("\n")
    : "- (none yet)";
  const people = ctx.people.length ? ctx.people.join(", ") : "(none yet)";

  return [
    `Current date and time: ${describeNow(ctx.now, ctx.timeZone)} (${ctx.timeZone}). Today is ${localDate(ctx.now, ctx.timeZone)}.`,
    "",
    "Workspaces (slug: name):",
    workspaces,
    "",
    "Existing projects:",
    projects,
    "",
    `Known people: ${people}`,
    "",
    "Input to file:",
    `"""`,
    text,
    `"""`,
  ].join("\n");
}

export function createAnthropicProvider(options: {
  apiKey: string;
  model: string;
}): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    name: "anthropic",
    async classify(text, ctx) {
      const response = await client.beta.messages.parse({
        model: options.model,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: betaZodOutputFormat(classificationSchema),
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserMessage(text, ctx) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The classifier declined to process this input.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("The classifier ran out of room before finishing.");
      }
      const parsed = response.parsed_output;
      if (!parsed) {
        throw new Error("The classifier returned no structured result.");
      }
      return { result: parsed, model: response.model };
    },
  };
}
