import { describeNow, isoToZonedParts, localDate } from "@/lib/dates";
import type { AnswerContext, ClassifyContext, NudgeInput, PlanInput } from "./types";

/**
 * Shared by every provider. Static so it caches across calls. Everything
 * that changes per request (date, workspaces, projects, people, the text)
 * goes in the user message built by `buildUserMessage`.
 */
export const SYSTEM_PROMPT = `You file short notes for one person, Travis, into his personal assistant. He types a thought in plain language; you decide what it is and fill in the structured fields. He never picks a type himself, so your judgement is the whole product.

Splitting:
- Return one entry in items per distinct thing. Most captures are one thing and return exactly one entry.
- Split only when the input clearly lists separate things that would be done, chased, or remembered independently: "call Matt about Aspen, order toner, and the Kalamazoo switch is flaky" is three entries. Steps of a single job ("pull the report and send it to Gary") stay one entry.
- Each entry stands alone: repeat shared context (the place, the person, the date) in every entry that needs it. Every concrete detail of the input must land in some entry.

Kinds:
- task: something Travis himself needs to do. "Order access points", "remind me to renew the domain".
- followup: something Travis is waiting on from another person, or needs to check back on later. "Follow up with Gary next week", "waiting on Matt for SQL access", "check on the order". If a specific person is the one who must act or respond, it is a followup.
- goal: an outcome that will take several steps, not one sitting. "Goal: get Aspen off the old SQL server", "I want to have the Kalamazoo network fully replaced by spring". Only when the input names an outcome rather than a next action; when unsure, it is a task. Do not invent its steps.
- note: information worth keeping that needs no action. "Remember that the printer uses 10.10.20.45", "Idea: add maintenance percentage to the dashboard".

Rules:
- Preserve every concrete detail from the input somewhere: title, body, tags, or people. Never drop an IP address, a name, a number, or a place.
- title: short, specific, imperative for tasks and followups ("Check with Matt about Aspen SQL login"), descriptive for notes. No trailing period. Leave out filler like "remind me to" or "I need to".
- body: extra detail that does not fit the title, otherwise null. Do not repeat the title.
- due_date: only when the input implies a date. Resolve relative phrases from the current date you are given. "Friday" means the next Friday, or today if today is Friday. "next week" means Monday of next week. "tomorrow" is the next calendar day. "end of month" is the last day of this month. Never guess a date that was not implied.
- due_time: only when a time was stated. Use 24-hour HH:MM.
- recurrence: only when the input says it repeats ("every Monday", "daily", "each month", "yearly", "every other week", "every weekday", "quarterly"). due_date is then the first occurrence on or after today. Otherwise null. Intervals that do not fit the list (every 3 days) get null and a note in body.
- workspace_slug: choose from the provided list, or null when unclear. Work topics (customers, branches, equipment, IT systems, employees) belong to the work workspace; family, house, and personal errands belong to personal or home.
- project_name: the exact name of a provided project when the input clearly belongs to it. If it clearly describes a project that is not listed, you may propose a new name. Otherwise null.
- category: a short label like "IT / Aspen", "Networking", "Purchasing", "Personal admin", or null.
- tags: a few lowercase keywords useful for search. Include place names and system names.
- people: everyone named. role is waiting_on when Travis is waiting on that person or must contact them for a followup; otherwise mentioned. Use the name as written, matching a provided person when it is clearly the same one.
- ceco_pages: Travis builds the CECO portal, the employee web app at his work. When the input is about that app itself (a bug in it, a change to make, an idea for one of its pages), list the paths of the pages it concerns, chosen only from the provided CECO pages. "The trucking board filter resets when you go back" is ["/trucking/jobboard"]. Work that merely happens at the company (a laptop, a switch, a vendor) is not about the app: empty. Empty when no pages were provided or none fits; never invent a path.
- priority: only when the input signals it ("urgent", "asap", "whenever"). Otherwise null.
- confidence: your honest confidence in kind plus the fields together. Use below 0.7 when the kind is ambiguous, a date is uncertain, or you proposed a new project.
- reasoning: one sentence.

Photos: when an image is attached, read it. Put what matters into the fields: transcribe serial numbers, model numbers, error text, IP addresses, and whiteboard or handwritten content into body, exactly as written. A whiteboard list is usually several entries. If the typed text is empty or just "(photo)", file from the image alone.`;

/** Placeholder raw text for a capture that was only a photo. */
export const PHOTO_ONLY_TEXT = "(photo)";

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
    ...(ctx.cecoPages.length
      ? [
          "CECO portal pages (path: title, area):",
          ...ctx.cecoPages.map((p) => `- ${p.path}: ${p.title} (${p.area})`),
          "",
        ]
      : []),
    "Input to file:",
    `"""`,
    text,
    `"""`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Answering questions over stored items
// ---------------------------------------------------------------------------

export const ANSWER_SYSTEM_PROMPT = `You answer questions for one person, Travis, about his own tasks, follow-ups, and notes. You are given the current date and time, his calendar for today and tomorrow when one is connected, and a list of his stored items, each with an id. Answer only from those; never invent tasks, dates, events, or people that are not listed.

How to answer:
- Be brief and direct. Plain text only: short lines and "-" bullets, no markdown headings, no bold.
- Lead with the answer, then the supporting items, one per line, as a short paraphrase of the title. Do not print ids in the answer text.
- Say dates relative to today when it helps ("due Friday", "overdue since Monday", "no date"). Use the item's due date, never guess one.
- For "waiting on" questions, list follow-ups where that person has the waiting_on role. Mention other items that only name the person separately, if at all.
- For "what do I need to do today" style questions, cover overdue first, then due today, then follow-ups due today. Skip notes unless asked.
- For "what do I know about X" questions, include notes and done items too; they are memory.
- If nothing in the list answers the question, say so in one line. Do not apologise.
- If the list was cut off, add one line saying older items may be missing.
- For "what should I do next" or "I have 20 minutes" questions, pick one to three items and say why: overdue and high priority first, sized to the time he has and to the gaps between calendar events.
- Earlier turns of the conversation may come first. Resolve "those", "that one", "the second one" against them.

cited_item_ids: every id your answer relies on, most relevant first. Only ids that appear in the list.

actions: changes to make to his items. Leave empty unless the message asks for a change ("mark the toner thing done", "push everything from today to Monday", "make that high priority", "add a task to call Gary"). A question is never a request to change anything.
- Nothing runs until he confirms, so propose exactly what was asked, one action per item, and say in the answer what you are proposing.
- complete, reopen, archive: item_id only.
- reschedule: item_id plus due_date (YYYY-MM-DD, resolved from the current date) and due_time when he gave one; due_date null clears the date.
- set_priority: item_id plus priority.
- create: item_id null, text is the capture as he would type it ("Call Gary about the laptop Friday"). It is filed the normal way.
- Fields an action does not use are null. summary is a short imperative label naming the item: "Mark 'Order toner' done", "Move 'Renew domain' to Mon Sep 21".
- If the request is ambiguous about which item, propose nothing and ask.`;

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
      i.recurrence ? `repeats ${i.recurrence}` : null,
      i.priority ? `priority ${i.priority}` : null,
      i.project ? `project: ${i.project}` : null,
      i.category ? `category: ${i.category}` : null,
      people,
      i.tags.length ? `tags: ${i.tags.join(", ")}` : null,
      i.cecoPages.length ? `CECO pages: ${i.cecoPages.join(", ")}` : null,
      body ? `notes: ${body}` : null,
      `captured ${i.created_at.slice(0, 10)}`,
    ]);
  });

  const events = ctx.events.map((e) => {
    const start = isoToZonedParts(e.start, ctx.timeZone);
    const when = e.allDay
      ? `${start.date} all day`
      : `${start.date} ${start.time}-${isoToZonedParts(e.end, ctx.timeZone).time}`;
    return line([when, e.title, e.location ? `at ${e.location}` : null]);
  });

  return [
    `Current date and time: ${describeNow(ctx.now, ctx.timeZone)} (${ctx.timeZone}). Today is ${today}.`,
    "",
    ...(events.length ? ["Calendar, today and tomorrow (read-only):", ...events, ""] : []),
    ...(ctx.cecoUpdates.length
      ? [
          "Recently shipped to the CECO portal (the web app Travis builds), newest first:",
          ...ctx.cecoUpdates.map((u) => line([u.date, u.title, u.pages.length ? `pages: ${u.pages.join(", ")}` : null])),
          "",
        ]
      : []),
    `Stored items (${ctx.items.length}${ctx.truncated ? ", list cut off" : ""}):`,
    items.length ? items.join("\n") : "(none)",
    "",
    "Question:",
    `"""`,
    question,
    `"""`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Drafting a nudge for a stale follow-up
// ---------------------------------------------------------------------------

export const NUDGE_SYSTEM_PROMPT = `You write short check-in messages for Travis, who works in IT at an equipment dealer, to send to someone he is waiting on. He will paste it into a text, Teams, or email.

- Two or three sentences, friendly and direct, the way a coworker writes. Open with the person's first name. No sign-off, no subject line.
- Say what he is waiting on, specifically, using the details given. Ask for a status or an ETA. After a long wait, acknowledge they are busy without sounding annoyed.
- Never invent details, deadlines, or reasons that were not given.
- Output only the message text.`;

export function buildNudgeMessage(input: NudgeInput): string {
  return [
    `Person: ${input.person}`,
    `Waiting on: ${input.title}`,
    input.body ? `Details: ${input.body.replace(/\s+/g, " ").slice(0, 600)}` : null,
    `Waiting for: ${input.waitingDays} day${input.waitingDays === 1 ? "" : "s"}`,
    input.dueLabel ? `Follow-up date: ${input.dueLabel}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Breaking a goal into steps
// ---------------------------------------------------------------------------

export const PLAN_SYSTEM_PROMPT = `You break a goal into steps for Travis, who works in IT at an equipment dealer and also tracks personal and home projects. He reviews your list and keeps what he wants, so propose; do not pad.

- Three to eight steps, in the order they would be done. Fewer is better when the goal is small.
- Each title is imperative and specific, and small enough to finish in one sitting: "Inventory every app that still points at the old SQL server", not "Plan migration".
- Use only what the goal says. Where a detail is unknown, make finding it out a step rather than guessing it.
- Skip steps the goal already has. Continue from where they leave off.
- detail is one line of helpful context, or null. No dates; he schedules steps himself.`;

export function buildPlanMessage(input: PlanInput): string {
  return [
    `Goal: ${input.title}`,
    input.body ? `Details: ${input.body.replace(/\s+/g, " ").slice(0, 1200)}` : null,
    input.existingSteps.length
      ? `Steps it already has:\n${input.existingSteps.map((s, n) => `${n + 1}. ${s}`).join("\n")}`
      : "It has no steps yet.",
  ]
    .filter(Boolean)
    .join("\n");
}
