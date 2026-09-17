"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { CheckIcon, LoaderIcon, SparklesIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import type { AssistantAction } from "@/lib/ai";
import { applyAssistantActions, askAction, type AnswerRow, type AskResult } from "./actions";

type Turn = {
  id: number;
  question: string;
  /** Null while the answer is on its way. */
  result: AskResult | null;
  /** What happened to the proposed actions, once decided. */
  applied?: { count: number; failed: string[] } | "dismissed";
};

/**
 * The conversation. Each turn retrieves fresh and sends the earlier
 * questions and answers along, so "and which of those are for Matt?" works.
 * History lives here in memory; leaving the page starts over, which is what
 * a quick lookup wants. Changes the assistant proposes wait for Apply.
 */
export function AssistantChat({
  initialQuestion,
  aiEnabled,
  timeZone,
  children,
}: {
  initialQuestion: string;
  aiEnabled: boolean;
  timeZone: string;
  /** Shown until the first question is asked: the suggestion chips. */
  children?: React.ReactNode;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, startAsking] = useTransition();
  const [applying, startApplying] = useTransition();
  const nextId = useRef(1);
  const askedInitial = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  function ask(question: string, earlier: Turn[]) {
    const id = nextId.current++;
    setTurns([...earlier, { id, question, result: null }]);
    startAsking(async () => {
      const history = earlier
        .filter((t) => t.result?.answer)
        .slice(-6)
        .map((t) => ({ question: t.question, answer: t.result!.answer!.slice(0, 4000) }));
      const result = await askAction({ question, history });
      setTurns((current) => current.map((t) => (t.id === id ? { ...t, result } : t)));
    });
  }

  // A linked question (?q=) asks itself once on arrival.
  useEffect(() => {
    if (!initialQuestion || askedInitial.current) return;
    askedInitial.current = true;
    ask(initialQuestion, []);
  }, [initialQuestion]);

  useEffect(() => {
    if (turns.length > 1) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || asking) return;
    setDraft("");
    ask(question, turns);
  }

  function decide(turnId: number, actions: AssistantAction[] | null) {
    if (!actions) {
      setTurns((current) => current.map((t) => (t.id === turnId ? { ...t, applied: "dismissed" } : t)));
      return;
    }
    startApplying(async () => {
      const done = await applyAssistantActions(actions);
      setTurns((current) =>
        current.map((t) =>
          t.id === turnId ? { ...t, applied: { count: done.applied, failed: done.failed } } : t,
        ),
      );
    });
  }

  const last = turns.at(-1);

  return (
    <div className="flex flex-col gap-7">
      {turns.map((turn, n) => (
        <TurnView
          key={turn.id}
          turn={turn}
          latest={n === turns.length - 1}
          timeZone={timeZone}
          applying={applying}
          onDecide={(actions) => decide(turn.id, actions)}
        />
      ))}

      <form onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          {turns.length ? "Ask a follow-up" : "Ask a question"}
        </label>
        <input
          id="q"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            !aiEnabled
              ? "Search what you've captured"
              : turns.length
                ? "Follow up, or tell me what to change"
                : "Ask about anything you've captured"
          }
          autoComplete="off"
          enterKeyHint="search"
          className={`${ui.input} flex-1`}
        />
        <button type="submit" disabled={asking || !draft.trim()} className={ui.btnPrimary} aria-label="Ask">
          {asking ? (
            <LoaderIcon size={18} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <SparklesIcon size={18} />
          )}
        </button>
      </form>
      <div ref={endRef} />

      {turns.length === 0 && children}

      {!aiEnabled && last?.result && (
        <p className="-mt-4 text-xs text-muted">
          No AI key is set, so this is a plain search. Add one in Settings to get answers.
        </p>
      )}
    </div>
  );
}

function TurnView({
  turn,
  latest,
  timeZone,
  applying,
  onDecide,
}: {
  turn: Turn;
  latest: boolean;
  timeZone: string;
  applying: boolean;
  onDecide: (actions: AssistantAction[] | null) => void;
}) {
  const { result } = turn;

  return (
    <section className="flex flex-col gap-3">
      <p className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-[15px] leading-6">
        {turn.question}
      </p>

      {!result && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted" role="status">
          <LoaderIcon size={15} className="animate-spin motion-reduce:animate-none" />
          Looking through your items…
        </p>
      )}

      {result?.error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {result.error}
        </p>
      )}

      {result?.answer && (
        <div className={`${ui.cardPad} flex gap-3`}>
          <SparklesIcon size={18} className="mt-1 shrink-0 text-accent" />
          <p className="whitespace-pre-wrap text-[15px] leading-7">{result.answer}</p>
        </div>
      )}

      {result && result.actions.length > 0 && (
        <ProposedActions
          actions={result.actions}
          applied={turn.applied}
          applying={applying}
          onDecide={onDecide}
        />
      )}

      {result && result.cited.length > 0 && (
        <Rows title="Based on" rows={result.cited} timeZone={timeZone} />
      )}

      {/* Older turns keep their answer; the long tail of matches is only useful on the newest. */}
      {result && latest && result.matches.length > 0 && (
        <Rows title={result.answer ? "Other matches" : "Matches"} rows={result.matches} timeZone={timeZone} />
      )}

      {result && !result.answer && !result.error && result.matches.length === 0 && (
        <EmptyState icon={<SparklesIcon size={22} />} title="Nothing matched">
          Try different words, or a person or place name.
        </EmptyState>
      )}
    </section>
  );
}

function ProposedActions({
  actions,
  applied,
  applying,
  onDecide,
}: {
  actions: AssistantAction[];
  applied: Turn["applied"];
  applying: boolean;
  onDecide: (actions: AssistantAction[] | null) => void;
}) {
  const decided = applied !== undefined;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-accent/30 bg-accent-soft/40 p-5">
      <h2 className={ui.sectionTitle}>
        {decided ? "Changes" : "Proposed changes"}
        <span className="ml-2 text-faint">{actions.length}</span>
      </h2>
      <ul className="flex flex-col gap-1.5">
        {actions.map((action, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-6">
            <CheckIcon
              size={14}
              strokeWidth={2.6}
              className={`mt-1.5 shrink-0 ${decided && applied !== "dismissed" ? "text-accent" : "text-faint"}`}
            />
            <span className={applied === "dismissed" ? "text-muted line-through" : ""}>{action.summary}</span>
          </li>
        ))}
      </ul>

      {!decided && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={applying} onClick={() => onDecide(actions)} className={ui.btnPrimary}>
            {applying ? "Applying…" : actions.length === 1 ? "Apply" : `Apply all ${actions.length}`}
          </button>
          <button type="button" disabled={applying} onClick={() => onDecide(null)} className={ui.btnGhost}>
            Not now
          </button>
        </div>
      )}
      {decided && applied !== "dismissed" && (
        <p role="status" className="text-xs text-muted">
          {applied.count} applied.
          {applied.failed.length > 0 && (
            <span className="text-danger"> {applied.failed.join(" ")}</span>
          )}
        </p>
      )}
      {applied === "dismissed" && <p className="text-xs text-muted">Nothing was changed.</p>}
    </div>
  );
}

function Rows({ title, rows, timeZone }: { title: string; rows: AnswerRow[]; timeZone: string }) {
  return (
    <>
      <h2 className={ui.sectionTitle}>
        {title}
        <span className="ml-2 text-faint">{rows.length}</span>
      </h2>
      <ul className={`${ui.card} divide-y divide-line`}>
        {rows.map((row) => (
          <ItemRow
            key={row.item.id}
            item={row.item}
            timeZone={timeZone}
            people={row.people}
            projectName={row.projectName}
          />
        ))}
      </ul>
    </>
  );
}
