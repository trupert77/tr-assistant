import Link from "next/link";
import { ArrowRightIcon, HelpIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ui } from "@/components/ui";
import { AiProviderToggle } from "@/components/ai-provider-toggle";
import { aiProviderOptions, resolveAiProviderName } from "@/lib/ai";
import { isSemanticSearchEnabled } from "@/lib/ai/embeddings";
import { aiPreferenceOf } from "@/lib/ai/preference";
import { isCalendarConnected } from "@/lib/calendar";
import { isCecoConfigured } from "@/lib/ceco";
import { getCurrentUser } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { isPushConfigured } from "@/lib/push";
import { PasswordForm } from "./password-form";
import { PushToggle } from "./push-toggle";
import { signOut } from "./actions";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const providers = aiProviderOptions();
  const anyConfigured = providers.some((p) => p.configured);
  // Resolves the saved choice against what is configured, falling back like classify does.
  const active = resolveAiProviderName(aiPreferenceOf(user));

  const env = getServerEnv();
  const pushReady = isPushConfigured() && Boolean(env.CRON_SECRET && env.SUPABASE_SERVICE_ROLE_KEY);
  const digestLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, env.DIGEST_HOUR)),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className={ui.pageTitle}>Settings</h1>

      <section className={`${ui.cardPad} flex flex-col gap-1`}>
        <span className={ui.sectionTitle}>Signed in as</span>
        <span className="text-base">{user?.email}</span>
      </section>

      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <div className="flex flex-col gap-1">
          <span className={ui.sectionTitle}>Appearance</span>
          <p className="text-sm text-muted">
            System follows your device. Pick one to lock it in.
          </p>
        </div>
        <ThemeToggle />
      </section>

      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <div className="flex flex-col gap-1">
          <span className={ui.sectionTitle}>Assistant</span>
          <p className="text-sm text-muted">
            {anyConfigured
              ? "Which model files your captures and answers questions. Also under the capture box; each capture records who filed it."
              : "Add an API key to turn on automatic filing."}
          </p>
        </div>
        {anyConfigured && <AiProviderToggle options={providers} current={active} />}
      </section>

      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <div className="flex flex-col gap-1">
          <span className={ui.sectionTitle}>Notifications</span>
          <p className="text-sm text-muted">
            {pushReady
              ? `A morning digest after ${digestLabel}, and a buzz when something with a time comes due. Set per device.`
              : "Add the VAPID keys, CRON_SECRET, and the service-role key to turn on the morning digest. The guide has the steps."}
          </p>
        </div>
        {pushReady && <PushToggle />}
      </section>

      <section className={`${ui.cardPad} flex flex-col gap-2`}>
        <span className={ui.sectionTitle}>Connections</span>
        <StatusLine
          on={isCalendarConnected()}
          label="Calendar"
          detail={
            isCalendarConnected()
              ? "Read-only feed. Today and the assistant can see your events."
              : "Set CALENDAR_ICS_URL to show your day on Today."
          }
        />
        <StatusLine
          on={isCecoConfigured()}
          label="CECO portal"
          detail={
            isCecoConfigured()
              ? "Read-only. Mirrors the portal's areas, pages, What's New, and the initiatives board. Open CECO from Today to sync or browse."
              : "Set CECO_API_URL and CECO_API_TOKEN, and ASSISTANT_API_TOKEN in CECO."
          }
        />
        <StatusLine
          on={isSemanticSearchEnabled()}
          label="Search by meaning"
          detail={
            isSemanticSearchEnabled()
              ? "On. New and edited items are indexed automatically."
              : "Needs OPENAI_API_KEY. Search is keyword-only until then."
          }
        />
      </section>

      <Link
        href="/guide"
        className={`${ui.cardPad} flex items-center gap-4 transition-colors hover:border-line-strong hover:bg-surface-2`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <HelpIcon size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-bold">Guide</span>
          <span className="text-xs text-muted">
            Capturing, reviewing, colors, and the capture API.
          </span>
        </span>
        <ArrowRightIcon size={18} className="shrink-0 text-faint" />
      </Link>

      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <div className="flex flex-col gap-1">
          <span className={ui.sectionTitle}>Password</span>
          <p className="text-sm text-muted">
            Optional. Lets you sign in without waiting for an email link.
          </p>
        </div>
        <PasswordForm />
      </section>

      <form action={signOut}>
        <button type="submit" className={`${ui.btnSecondary} w-full`}>
          Sign out
        </button>
      </form>
    </div>
  );
}

function StatusLine({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${on ? "bg-accent shadow-glow" : "bg-line-strong"}`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {label}
          <span className="ml-2 text-xs font-normal text-faint">{on ? "on" : "off"}</span>
        </span>
        <span className="text-xs text-muted">{detail}</span>
      </div>
    </div>
  );
}
