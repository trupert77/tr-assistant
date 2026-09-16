import Link from "next/link";
import { CheckIcon, InboxIcon, KeyIcon, SendIcon, SparklesIcon, SunIcon } from "@/components/icons";
import { KindLegend } from "@/components/kind-legend";
import { kindStyles, ui } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { getServerEnv, publicEnv } from "@/lib/env";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
        {n}
      </span>
      <span className="text-sm leading-6">{children}</span>
    </li>
  );
}

export default function GuidePage() {
  const env = getServerEnv();
  const aiEnabled = getAiProvider() !== null;
  const apiEnabled = Boolean(env.CAPTURE_API_TOKEN && env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className={ui.eyebrow}>How it works</p>
        <h1 className={ui.pageTitle}>Guide</h1>
      </div>

      {/* 1. Capture */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <SendIcon size={16} className="text-accent" />
          Capture
        </h2>
        <ol className="flex flex-col gap-3">
          <Step n={1}>
            Type anything in the box at the top of every screen. A task, a name
            to chase, a thought. No formatting needed.
          </Step>
          <Step n={2}>
            <Kbd>Enter</Kbd> sends it. <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> adds a
            line. On a keyboard, <Kbd>/</Kbd> jumps to the box from anywhere.
            It lands in your Inbox instantly.
          </Step>
          <Step n={3}>
            {aiEnabled
              ? "The assistant reads it in the background and files it as a task, follow-up, or note, with a due date when it can find one."
              : "File it yourself from the Inbox with the Task, Follow-up, or Note buttons."}
          </Step>
        </ol>
      </section>

      {/* 2. Kinds */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <InboxIcon size={16} className="text-accent" />
          What the colors mean
        </h2>
        <KindLegend />
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li className="flex gap-3">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${kindStyles.task.dot}`} />
            <span>
              <strong>Task.</strong> Something you do. Starts open, and shows on
              Today once it has a date.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${kindStyles.followup.dot}`} />
            <span>
              <strong>Follow-up.</strong> Something you are waiting on from
              someone else. Starts as waiting, so it never reads like your own
              to-do.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${kindStyles.note.dot}`} />
            <span>
              <strong>Note.</strong> Reference you want to find again. No status,
              no date.
            </span>
          </li>
          <li className="flex gap-3">
            <SparklesIcon size={14} strokeWidth={2.2} className="mt-1.5 shrink-0 text-accent" />
            <span>
              <strong>Orange</strong> is the assistant, or something that needs
              your OK.
            </span>
          </li>
        </ul>
      </section>

      {/* 3. Inbox review */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CheckIcon size={16} className="text-accent" />
          Reviewing the Inbox
        </h2>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li>
            <strong>Filing…</strong> means the assistant is still working on it.
            Give it a few seconds.
          </li>
          <li>
            Confident filings skip the Inbox and go straight to{" "}
            <strong>Recently filed</strong>.
          </li>
          <li>
            Anything it was unsure about waits with its best guess shown in
            orange. Tap <strong>Looks right</strong> to accept, or tap a different
            kind to re-file it. Re-filing changes the item, it never duplicates.
          </li>
          <li>
            <strong>Auto-file</strong> runs the assistant on a capture it has
            not looked at yet. <strong>Retry</strong> appears if a run failed.
          </li>
        </ul>
      </section>

      {/* 4. Capture from anywhere */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <KeyIcon size={16} className="text-accent" />
            Capture from anywhere
          </h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              apiEnabled ? "bg-note-soft text-note" : "bg-surface-2 text-muted"
            }`}
          >
            {apiEnabled ? "API on" : "API off"}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted">
          An iOS Shortcut, a voice memo, or anything that can make a web
          request can drop text into your Inbox with one call. Same pipeline as
          the box above.
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-surface-2 px-4 py-3 text-[12px] leading-5">
          {`POST ${publicEnv.appUrl}/api/capture
Authorization: Bearer <CAPTURE_API_TOKEN>
Content-Type: application/json

{ "text": "Call Matt about the quote Friday" }`}
        </pre>
        {!apiEnabled && (
          <p className="text-xs leading-5 text-muted">
            Turn it on by setting CAPTURE_API_TOKEN and
            SUPABASE_SERVICE_ROLE_KEY in the server environment.
          </p>
        )}
      </section>

      {/* 5. Tabs */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <SunIcon size={16} className="text-accent" />
          The tabs
        </h2>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li>
            <strong>Today.</strong> What is due or waiting today. Fills in as
            dated items exist.
          </li>
          <li>
            <strong>Inbox.</strong> Captures that still need a look, and the last
            few things filed.
          </li>
          <li>
            <strong>Projects.</strong> Groups of related items. Coming soon.
          </li>
          <li>
            <strong>Assistant.</strong> Ask questions like &ldquo;what am I
            waiting on Matt for?&rdquo; Coming soon.
          </li>
        </ul>
      </section>

      <Link href="/settings" className={`${ui.btnSecondary} w-full`}>
        Settings, theme, and password
      </Link>
    </div>
  );
}
