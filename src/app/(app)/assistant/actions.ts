"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getUserAiProvider } from "@/lib/ai/preference";
import { assistantActionSchema, type AssistantAction } from "@/lib/ai/types";
import { captureText } from "@/lib/capture";
import { classifyInboxItem } from "@/lib/capture/classify";
import { zonedToIso } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ItemRow, PersonRole } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import {
  archiveItem,
  completeItem,
  reopenItem,
  rescheduleItem,
  setItemPriority,
} from "@/lib/items/mutations";
import { retrieveForQuestion } from "@/lib/retrieval";

/** An item plus what `ItemRow` needs to draw it, ready to cross to the client. */
export type AnswerRow = {
  item: ItemRow;
  people: { name: string; role: PersonRole }[];
  projectName?: string;
};

export type AskResult = {
  /** Null when no AI key is set; the matches below are then a plain search. */
  answer: string | null;
  cited: AnswerRow[];
  matches: AnswerRow[];
  /** Changes the assistant wants to make. Nothing has happened yet. */
  actions: AssistantAction[];
  error?: string;
};

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  // Only the last few exchanges; older context is rarely what "those" means.
  history: z
    .array(z.object({ question: z.string().max(2000), answer: z.string().max(4000) }))
    .max(6),
});

/** One turn of the conversation: retrieve fresh, answer with the earlier turns in view. */
export async function askAction(input: z.input<typeof askSchema>): Promise<AskResult> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { answer: null, cited: [], matches: [], actions: [], error: "Ask a shorter question." };
  }
  const { question, history } = parsed.data;
  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();

  // A follow-up like "which of those are for Matt?" has no search terms of
  // its own, so the previous question rides along for retrieval.
  const searchText = [history.at(-1)?.question, question].filter(Boolean).join(" ");
  const [provider, retrieved] = await Promise.all([
    getUserAiProvider(),
    retrieveForQuestion(db, searchText, timeZone),
  ]);

  const row = (item: ItemRow): AnswerRow => ({
    item,
    people: retrieved.people.get(item.id) ?? [],
    projectName: item.project_id ? retrieved.projects.get(item.project_id) : undefined,
  });

  if (!provider) {
    return { answer: null, cited: [], matches: retrieved.hits.map(row), actions: [] };
  }

  try {
    const result = await provider.answer(question, retrieved.ctx, history);
    const seen = new Set<string>();
    const cited = result.citedItemIds
      .map((id) => retrieved.byId.get(id))
      .filter((i): i is ItemRow => Boolean(i) && !seen.has(i!.id) && Boolean(seen.add(i!.id)));

    // The model can only touch items it was actually shown.
    const actions = result.actions.filter(
      (a) => a.type === "create" ? Boolean(a.text?.trim()) : Boolean(a.item_id && retrieved.byId.has(a.item_id)),
    );

    return {
      answer: result.answer,
      cited: cited.map(row),
      matches: retrieved.hits.filter((i) => !seen.has(i.id)).map(row),
      actions,
    };
  } catch (e) {
    return {
      answer: null,
      cited: [],
      matches: retrieved.hits.map(row),
      actions: [],
      error: e instanceof Error ? e.message : "The assistant could not answer.",
    };
  }
}

export type ApplyResult = { applied: number; failed: string[] };

/** Run the changes Travis confirmed. Each is re-validated; row-level security scopes the ids. */
export async function applyAssistantActions(input: unknown): Promise<ApplyResult> {
  const parsed = z.array(assistantActionSchema).max(50).safeParse(input);
  if (!parsed.success) return { applied: 0, failed: ["Those actions were not valid."] };

  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();
  const result: ApplyResult = { applied: 0, failed: [] };

  for (const action of parsed.data) {
    try {
      if (action.type === "create") {
        if (!action.text?.trim()) throw new Error("nothing to capture");
        const inbox = await captureText(db, { text: action.text, source: "web" });
        after(() => classifyInboxItem(db, inbox.id));
      } else {
        const id = z.uuid().parse(action.item_id);
        if (action.type === "complete") await completeItem(db, id, timeZone);
        else if (action.type === "reopen") await reopenItem(db, id);
        else if (action.type === "archive") await archiveItem(db, id);
        else if (action.type === "set_priority") {
          if (!action.priority) throw new Error("no priority given");
          await setItemPriority(db, id, action.priority);
        } else {
          const due = action.due_date ? zonedToIso(action.due_date, action.due_time, timeZone) : null;
          if (action.due_date && !due) throw new Error("that date isn't valid");
          await rescheduleItem(db, id, due);
        }
      }
      result.applied += 1;
    } catch (e) {
      result.failed.push(`${action.summary}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  revalidatePath("/", "layout");
  return result;
}
