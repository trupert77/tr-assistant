import { describeNow, isoToZonedParts, localDate } from "@/lib/dates";
import type { AnswerContext, ClassifyContext } from "./types";

/**
 * Shared by every provider. Static so it caches across calls. Everything
 * that changes per request (date, workspaces, projects, people, the text)
 * goes in the user message built by `buildUserMessage`.
 */
export const SYSTEM_PROMPT = `You file short notes for one person, Travis, into his personal assistant. He types a thought in plain language; you decide what it is and fill in the structured fields. He never picks a type himself, so your judgement is the whole product.

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

export function buildUserMessage(text: string, ctx: ClassifyContext): string {
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

// ---------------------------------------------------------------------------
// Answering questions over stored items
// ---------------------------------------------------------------------------

export const ANSWER_SYSTEM_PROMPT = `You answer questions for one person, Travis, about his own tasks, follow-ups, and notes. You are given the current date and time and a list of his stored items, each with an id. Answer only from those items; never invent tasks, dates, or people that are not in the list.

How to answer:
- Be brief and direct. Plain text only: short lines and "-" bullets, no markdown headings, no bold.
- Lead with the answer, then the supporting items, one per line, as a short paraphrase of the title. Do not print ids in the answer text.
- Say dates relative to today when it helps ("due Friday", "overdue since Monday", "no date"). Use the item's due date, never guess one.
- For "waiting on" questions, list follow-ups where that person has the waiting_on role. Mention other items that only name the person separately, if at all.
- For "what do I need to do today" style questions, cover overdue first, then due today, then follow-ups due today. Skip notes unless asked.
- For "what do I know about X" questions, include notes and done items too; they are memory.
- If nothing in the list answers the question, say so in one line. Do not apologise.
- If the list was cut off, add one line saying older items may be missing.

cited_item_ids: every id your answer relies on, most relevant first. Only ids that appear in the list.`;

function line(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" | ");
}

export function buildAnswerMessage(question: string, ctx: AnswerContext): string {
  const today = localDate(ctx.now, ctx.timeZone);
  const items = ctx.items.map((i) => {
    const due = i.due_at ? isoToZonedParts(i.due_at, ctx.timeZone) : null;
    const people = i.people.length
      ? "people: " + i.people.map((p) => `${p.name} (${p.role})`).join(", ")
      : null;
    const body = i.body ? i.body.replace(/\s+/g, " ").slice(0, 300) : null;
    return line([
      `[${i.id}]`,
      `${i.kind} ${i.status}`,
      i.title,
      due ? `due ${due.date}${due.time !== "09:00" ? ` ${due.time}` : ""}` : "no date",
      i.priority ? `priority ${i.priority}` : null,
      i.project ? `project: ${i.project}` : null,
      i.category ? `category: ${i.category}` : null,
      people,
      i.tags.length ? `tags: ${i.tags.join(", ")}` : null,
      body ? `notes: ${body}` : null,
      `captured ${i.created_at.slice(0, 10)}`,
    ]);
  });

  return [
    `Current date and time: ${describeNow(ctx.now, ctx.timeZone)} (${ctx.timeZone}). Today is ${today}.`,
    "",
    `Stored items (${ctx.items.length}${ctx.truncated ? ", list cut off" : ""}):`,
    items.length ? items.join("\n") : "(none)",
    "",
    "Question:",
    `"""`,
    question,
    `"""`,
  ].join("\n");
}
