import Link from "next/link";
import { ui } from "@/components/ui";
import { getUserAiProvider } from "@/lib/ai/preference";
import { getServerEnv } from "@/lib/env";
import { AssistantChat } from "./assistant-chat";

const SUGGESTIONS = [
  "What do I need to get done today?",
  "What should I do next? I have 20 minutes.",
  "What is overdue?",
  "What am I waiting on?",
  "What am I waiting on Matt for?",
  "What have I written down about Aspen?",
  "Show me everything related to Kalamazoo",
  "Push everything due today to Monday",
];

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const { q } = await searchParams;
  const question = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const provider = await getUserAiProvider();

  return (
    <div className="flex flex-col gap-7">
      <h1 className={ui.pageTitle}>Assistant</h1>

      {/* Keyed by the linked question so tapping another suggestion starts a fresh conversation. */}
      <AssistantChat
        key={question}
        initialQuestion={question}
        aiEnabled={provider !== null}
        timeZone={getServerEnv().APP_TIMEZONE}
      >
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
      </AssistantChat>
    </div>
  );
}
