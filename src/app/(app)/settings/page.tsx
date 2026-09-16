import Link from "next/link";
import { ArrowRightIcon, HelpIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ui } from "@/components/ui";
import { AI_PROVIDERS, getAiProvider, isAiProviderConfigured } from "@/lib/ai";
import { aiPreferenceOf } from "@/lib/ai/preference";
import { getCurrentUser } from "@/lib/db/server";
import { AiProviderToggle } from "./ai-provider-toggle";
import { PasswordForm } from "./password-form";
import { signOut } from "./actions";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const providers = AI_PROVIDERS.map((p) => ({
    name: p.name,
    label: p.label,
    model: p.defaultModel,
    configured: isAiProviderConfigured(p.name),
  }));
  const anyConfigured = providers.some((p) => p.configured);
  // Resolves the saved choice against what is configured, falling back like classify does.
  const active = (getAiProvider(aiPreferenceOf(user))?.name ?? null) as
    | (typeof providers)[number]["name"]
    | null;

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
              ? "Which model files your captures. Switch any time; each capture records who filed it."
              : "Add an API key to turn on automatic filing."}
          </p>
        </div>
        {anyConfigured && <AiProviderToggle options={providers} current={active} />}
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
