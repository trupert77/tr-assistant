import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  InboxIcon,
  KeyIcon,
  ListCheckIcon,
  MailIcon,
  MapIcon,
  SendIcon,
  SparklesIcon,
  SunIcon,
} from "@/components/icons";
import { KindLegend } from "@/components/kind-legend";
import { kindStyles, ui } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { isSemanticSearchEnabled } from "@/lib/ai/embeddings";
import { isCalendarConnected } from "@/lib/calendar";
import { isCecoConfigured } from "@/lib/ceco";
import { isPushConfigured } from "@/lib/push";
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
  const pushEnabled = isPushConfigured() && Boolean(env.CRON_SECRET && env.SUPABASE_SERVICE_ROLE_KEY);

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
          <Step n={4}>
            Dump several things at once. &ldquo;Call Matt about Aspen, order toner, and the
            Kalamazoo switch is flaky&rdquo; becomes three items.
          </Step>
          <Step n={5}>
            Say how often and it repeats: &ldquo;check backups every Monday&rdquo;, &ldquo;renew
            the cert yearly&rdquo;. Finishing one schedules the next.
          </Step>
          <Step n={6}>
            The mic dictates into the box. The camera attaches a photo of a whiteboard, a serial
            number, or an error screen, and the assistant reads what is in it.
          </Step>
        </ol>
        <p className="text-xs leading-5 text-muted">
          The Claude / ChatGPT switch under the box picks who files the next capture and answers the
          next question.
        </p>
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

      {/* Keeping up */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ListCheckIcon size={16} className="text-accent" />
          Keeping up
        </h2>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li>
            <strong>Focus.</strong> The top three for right now: overdue, due today, then high
            priority. For when the whole board is too much.
          </li>
          <li>
            <strong>Someday.</strong> Everything open with no date, oldest first. Undated captures
            leave Today after two days; this is where they live.
          </li>
          <li>
            <strong>Weekly review.</strong> One pass over what slips: overdue, stale follow-ups,
            tasks sitting undated for two weeks, and projects with nothing open. Each row gets
            Tomorrow, Next week, Someday, or Archive. The Review chip on Today turns orange when a
            week has passed.
          </li>
          <li>
            <strong>Follow-ups age.</strong> A row shows how many days you have been waiting, in
            red after five. Open it and <strong>Draft a check-in message</strong> writes the nudge
            for you to copy or share.
          </li>
          <li>
            <strong>Undo.</strong> Checking something off or archiving it shows Undo for a few
            seconds.
          </li>
        </ul>
      </section>

      {/* Map and goals */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MapIcon size={16} className="text-accent" />
          The map and goals
        </h2>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li>
            <strong>The map</strong> draws everything open. Projects are squares and people are
            rings, so items cluster around what they belong to without you doing anything.
          </li>
          <li>
            Drag the background to pan, pinch to zoom. <strong>Drag a node and it stays</strong>{" "}
            where you put it (an orange dot marks it pinned); everything else arranges itself
            around your pins. <strong>Tidy</strong> re-arranges whatever is not pinned.
          </li>
          <li>
            <strong>Tap a node</strong> to see what it connects to. From there: Link to another
            item, Add a step (on a goal), or Blocked by. Pick the tool, then tap the other item.
          </li>
          <li className="flex gap-3">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${kindStyles.goal.dot}`} />
            <span>
              <strong>Goal.</strong> An outcome that takes several steps. Capture it as
              &ldquo;Goal: get Aspen off the old SQL server&rdquo;, then add steps on its page or
              tap <strong>Break it down for me</strong>. Steps are ordinary tasks in order; on the
              map they stack above the goal like a checklist. The next open step of each goal shows
              on Today.
            </span>
          </li>
          <li>
            <strong>Dotted orange lines</strong> are connections the assistant thinks exist. Tap
            either end and choose Link or No. The sparkles button looks for more.
          </li>
        </ul>
      </section>

      {/* CECO */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <KeyIcon size={16} className="text-accent" />
            The CECO portal
          </h2>
          <StatusPill on={isCecoConfigured()} />
        </div>
        <p className="text-sm leading-6 text-muted">
          The assistant keeps a read-only copy of what the CECO portal is: its areas, its pages,
          what shipped lately, and your private initiatives board. No tickets, people, or customer
          data, and nothing here can change anything in CECO.
        </p>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li>
            Capture a thought about the app, like &ldquo;the trucking board filter resets when you
            go back&rdquo;, and it attaches to that page by itself. Fix a wrong pick under{" "}
            <strong>CECO pages</strong> on the item.
          </li>
          <li>
            The <strong>CECO</strong> tab, next to Projects and People, opens the whole scope: every page by area, what
            you have open against it, and when it last shipped.
          </li>
          <li>
            On the map, a page appears once one of your items is about it.{" "}
            <strong>Show the whole app</strong> draws all of it.
          </li>
          <li>
            <strong>Initiatives</strong> at the top of that tab is the board from
            ceco.info/initiatives: what is active, blocked, or still an idea, how far through its
            steps each one is, and what it is waiting on. Open one to read its steps and its log.
            Checking a step off still happens in CECO.
          </li>
        </ul>
        {!isCecoConfigured() && (
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              In CECO, set ASSISTANT_API_TOKEN to a long random string and deploy.
            </Step>
            <Step n={2}>
              Here, set CECO_API_URL to the portal&apos;s address and CECO_API_TOKEN to the same
              string. Then open CECO from Today and sync.
            </Step>
            <Step n={3}>
              For the initiatives board, also set ASSISTANT_INITIATIVES_BOARD in CECO to your own
              address. Without it the pages still work; the board section just stays hidden.
            </Step>
          </ol>
        )}
      </section>

      {/* Notifications */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <MailIcon size={16} className="text-accent" />
            Notifications
          </h2>
          <StatusPill on={pushEnabled} />
        </div>
        <p className="text-sm leading-6 text-muted">
          A morning digest (due today, overdue, the calendar, your stalest follow-up) and a buzz
          when something with a time comes due. Turn it on per device in Settings. On iPhone, add
          the app to the home screen first.
        </p>
        {!pushEnabled && (
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              Run <Kbd>npx web-push generate-vapid-keys</Kbd> and set NEXT_PUBLIC_VAPID_PUBLIC_KEY
              and VAPID_PRIVATE_KEY.
            </Step>
            <Step n={2}>
              Set CRON_SECRET to a long random string, and SUPABASE_SERVICE_ROLE_KEY if it is not
              set already. Redeploy.
            </Step>
          </ol>
        )}
        <p className="text-xs leading-5 text-muted">
          Vercel calls /api/cron/tick once each morning, which is enough for the digest. For timed
          reminders to land on time, have anything call the same URL every ten minutes with{" "}
          <Kbd>Authorization: Bearer CRON_SECRET</Kbd>. Supabase pg_cron can do it; the SQL is in
          docs/ARCHITECTURE_PLAN.md.
        </p>
      </section>

      {/* Connections */}
      <section className={`${ui.cardPad} flex flex-col gap-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CalendarIcon size={16} className="text-accent" />
          Calendar and search
        </h2>
        <ul className="flex flex-col gap-3 text-sm leading-6">
          <li className="flex items-start justify-between gap-3">
            <span>
              <strong>Calendar.</strong> Read-only. Set CALENDAR_ICS_URL to the secret iCal address
              from Google Calendar, or a published Outlook calendar. Today shows your events and
              the assistant plans around them.
            </span>
            <StatusPill on={isCalendarConnected()} />
          </li>
          <li className="flex items-start justify-between gap-3">
            <span>
              <strong>Search by meaning.</strong> &ldquo;That thing about the network being
              slow&rdquo; finds &ldquo;Kalamazoo switch flaky&rdquo;. Uses OpenAI embeddings, so it
              needs OPENAI_API_KEY even when Claude does the filing.
            </span>
            <StatusPill on={isSemanticSearchEnabled()} />
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
          request can drop text or a photo into your Inbox with one call. Same
          pipeline as the box above, filed the same way.
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-surface-2 px-4 py-3 text-[12px] leading-5">
          {`POST ${publicEnv.appUrl}/api/capture
Authorization: Bearer <CAPTURE_API_TOKEN>
Content-Type: application/json

{ "text": "Call Matt about the quote Friday" }

// With a photo: add "image" (base64) and "image_type",
// or send multipart/form-data with text= and image=<file>.`}
        </pre>
        <p className="text-xs leading-5 text-muted">
          On iPhone, a Shortcut in the share sheet that posts here is how you share a link or a
          photo into the app. On Android and desktop Chrome, the installed app shows up in the
          share menu by itself and fills the capture box.
        </p>
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
            <strong>Projects.</strong> Groups of related items, and everyone the assistant has
            met under People.
          </li>
          <li>
            <strong>Map.</strong> How it all connects, and the paths toward your goals.
          </li>
          <li>
            <strong>Ask.</strong> The assistant. Ask &ldquo;what am I waiting on Matt for?&rdquo; or
            &ldquo;what should I do next, I have 20 minutes&rdquo;, then follow up: &ldquo;which
            of those are for Aspen?&rdquo; It can also make changes: &ldquo;mark the toner thing
            done&rdquo;, &ldquo;push everything from today to Monday&rdquo;. It shows what it
            wants to change and waits for Apply.
          </li>
        </ul>
      </section>

      <Link href="/settings" className={`${ui.btnSecondary} w-full`}>
        Settings, theme, and password
      </Link>
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
        on ? "bg-note-soft text-note" : "bg-surface-2 text-muted"
      }`}
    >
      {on ? "On" : "Off"}
    </span>
  );
}
