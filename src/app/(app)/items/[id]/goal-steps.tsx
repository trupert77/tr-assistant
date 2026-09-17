"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CompleteButton } from "@/components/complete-button";
import { ChevronDownIcon, ChevronUpIcon, SparklesIcon, XIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { ui } from "@/components/ui";
import type { LinkedItem } from "@/lib/links";
import {
  addStepsAction,
  moveStepAction,
  planGoalAction,
  unlinkItemsAction,
} from "../../map/actions";

type Proposal = { title: string; detail: string | null; keep: boolean };

const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30";

/**
 * A goal's steps: an ordered checklist with a progress bar. Steps are
 * ordinary tasks, so they also show up on Today, in search, and on the map.
 * "Break it down" asks the assistant for a plan and adds only what is kept.
 */
export function GoalSteps({
  goalId,
  steps,
  aiEnabled,
}: {
  goalId: string;
  steps: LinkedItem[];
  aiEnabled: boolean;
}) {
  const [title, setTitle] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [planning, startPlanning] = useTransition();

  const done = steps.filter((s) => s.status === "done").length;
  const next = steps.find((s) => s.status !== "done");

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "That did not work.");
      else after?.();
    });

  function addTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    run(
      () => addStepsAction({ goalId, steps: [{ title: text, detail: null }] }),
      () => setTitle(""),
    );
  }

  function plan() {
    startPlanning(async () => {
      setError(null);
      const result = await planGoalAction(goalId);
      if (!result.ok || !result.steps) {
        setError(result.error ?? "Could not plan this goal.");
        return;
      }
      if (!result.steps.length) {
        toast("Nothing to add. The steps you have look complete.");
        return;
      }
      setProposals(result.steps.map((s) => ({ ...s, keep: true })));
    });
  }

  function addPlanned() {
    const kept = (proposals ?? []).filter((p) => p.keep);
    if (!kept.length) {
      setProposals(null);
      return;
    }
    run(
      () => addStepsAction({ goalId, steps: kept.map(({ title: t, detail }) => ({ title: t, detail })) }),
      () => {
        setProposals(null);
        toast(`${kept.length} step${kept.length === 1 ? "" : "s"} added`);
      },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={ui.sectionTitle}>
          Steps
          {steps.length > 0 && (
            <span className="ml-2 text-faint">
              {done} of {steps.length}
            </span>
          )}
        </h2>
        {next && <span className="truncate text-xs text-muted">Next: {next.title}</span>}
      </div>

      {steps.length > 0 && (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-goal transition-[width]"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>

          <ol className={`${ui.card} divide-y divide-line`}>
            {steps.map((step, n) => (
              <li key={step.id} className="flex items-center gap-2 py-2 pl-5 pr-2">
                <CompleteButton id={step.id} title={step.title} done={step.status === "done"} />
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-faint">{n + 1}</span>
                <Link
                  href={`/items/${step.id}`}
                  className={`min-w-0 flex-1 truncate py-1.5 text-[15px] leading-6 ${
                    step.status === "done" ? "text-muted line-through" : step.id === next?.id ? "font-semibold" : ""
                  }`}
                >
                  {step.title}
                </Link>
                <button
                  type="button"
                  disabled={pending || n === 0}
                  aria-label={`Move "${step.title}" earlier`}
                  onClick={() => run(() => moveStepAction({ goalId, stepId: step.id, direction: "up" }))}
                  className={iconButton}
                >
                  <ChevronUpIcon size={16} />
                </button>
                <button
                  type="button"
                  disabled={pending || n === steps.length - 1}
                  aria-label={`Move "${step.title}" later`}
                  onClick={() => run(() => moveStepAction({ goalId, stepId: step.id, direction: "down" }))}
                  className={iconButton}
                >
                  <ChevronDownIcon size={16} />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove "${step.title}" from this goal`}
                  title="Remove from this goal (the task itself stays)"
                  onClick={() => run(() => unlinkItemsAction({ a: step.id, b: goalId }))}
                  className={`${iconButton} hover:text-danger`}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {proposals ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-accent/30 bg-accent-soft/40 p-5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <SparklesIcon size={13} strokeWidth={2.2} />
            Proposed steps
          </span>
          <ul className="flex flex-col gap-2">
            {proposals.map((p, n) => (
              <li key={n}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={p.keep}
                    onChange={() =>
                      setProposals((current) =>
                        (current ?? []).map((c, i) => (i === n ? { ...c, keep: !c.keep } : c)),
                      )
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-sm leading-6 ${p.keep ? "" : "text-muted line-through"}`}>{p.title}</span>
                    {p.detail && <span className="text-xs leading-5 text-muted">{p.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addPlanned} disabled={pending} className={ui.btnPrimary}>
              {pending ? "Adding…" : `Add ${proposals.filter((p) => p.keep).length}`}
            </button>
            <button type="button" onClick={() => setProposals(null)} disabled={pending} className={ui.btnGhost}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <form onSubmit={addTyped} className="flex gap-2">
            <label htmlFor="new-step" className="sr-only">
              New step
            </label>
            <input
              id="new-step"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={steps.length ? "Add the next step" : "What is the first step?"}
              autoComplete="off"
              enterKeyHint="done"
              className={`${ui.input} flex-1`}
            />
            <button type="submit" disabled={pending || !title.trim()} className={ui.btnSecondary}>
              Add
            </button>
          </form>
          {aiEnabled && (
            <button type="button" onClick={plan} disabled={planning} className={`${ui.btnGhost} self-start`}>
              <SparklesIcon size={16} className="text-accent" />
              {planning ? "Thinking it through…" : steps.length ? "Suggest what comes next" : "Break it down for me"}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
