import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { SparklesIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import { getUserAiProvider } from "@/lib/ai/preference";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ItemRow as Item } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { retrieveForQuestion, type Retrieved } from "@/lib/retrieval";

const SUGGESTIONS = [
  "What do I need to get done today?",
  "What is overdue?",
  "What am I waiting on?",
  "What am I waiting on Matt for?",
  "What have I written down about Aspen?",
  "Show me everything related to Kalamazoo",
  "What should I follow up on this week?",
];

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const { q } = await searchParams;
  const question = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const timeZone = getServerEnv().APP_TIMEZONE;
  const provider = await getUserAiProvider();

  let retrieved: Retrieved | null = null;
  let answer: { text: string; cited: Item[] } | null = null;
  let error: string | null = null;

  if (question) {
    const db = await createSupabaseServerClient();
    retrieved = await retrieveForQuestion(db, question, timeZone);

    if (provider) {
      try {
        const result = await provider.answer(question, retrieved.ctx);
        const seen = new Set<string>();
        const cited = result.citedItemIds
          .map((id) => retrieved!.byId.get(id))
          .filter((i): i is Item => Boolean(i) && !seen.has(i!.id) && Boolean(seen.add(i!.id)));
        answer = { text: result.answer, cited };
      } catch (e) {
        error = e instanceof Error ? e.message : "The assistant could not answer.";
      }
    }
  }

  const citedIds = new Set(answer?.cited.map((i) => i.id) ?? []);
  const otherHits = retrieved?.hits.filter((i) => !citedIds.has(i.id)) ?? [];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>Assistant</h1>
        <form action="/assistant" method="get" className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Ask a question
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={question}
            placeholder={provider ? "Ask about anything you've captured" : "Search what you've captured"}
            autoComplete="off"
            enterKeyHint="search"
            className={`${ui.input} flex-1`}
          />
          <button type="submit" className={ui.btnPrimary} aria-label="Ask">
            <SparklesIcon size={18} />
          </button>
        </form>
        {!provider && question && (
          <p className="text-xs text-muted">
            No AI key is set, so this is a plain search. Add one in Settings to get answers.
          </p>
        )}
      </div>

      {!question && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>Try asking</h2>
          <ul className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <Link
                  href={{ pathname: "/assistant", query: { q: s } }}
                  className={`${ui.chip} border border-line bg-surface text-foreground hover:bg-surface-2`}
                >
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {answer && (
        <section className="flex flex-col gap-3">
          <div className={`${ui.cardPad} flex gap-3`}>
            <SparklesIcon size={18} className="mt-1 shrink-0 text-accent" />
            <p className="whitespace-pre-wrap text-[15px] leading-7">{answer.text}</p>
          </div>
          {answer.cited.length > 0 && (
            <>
              <h2 className={ui.sectionTitle}>
                Based on
                <span className="ml-2 text-faint">{answer.cited.length}</span>
              </h2>
              <ul className={`${ui.card} divide-y divide-line`}>
                {answer.cited.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    timeZone={timeZone}
                    people={retrieved!.people.get(item.id)}
                    projectName={item.project_id ? retrieved!.projects.get(item.project_id) : undefined}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {question && otherHits.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>
            {answer ? "Other matches" : "Matches"}
            <span className="ml-2 text-faint">{otherHits.length}</span>
          </h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {otherHits.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                timeZone={timeZone}
                people={retrieved!.people.get(item.id)}
                projectName={item.project_id ? retrieved!.projects.get(item.project_id) : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {question && !answer && !error && otherHits.length === 0 && (
        <EmptyState icon={<SparklesIcon size={22} />} title="Nothing matched">
          Try different words, or a person or place name.
        </EmptyState>
      )}
    </div>
  );
}
