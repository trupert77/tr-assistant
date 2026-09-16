import { ThemeToggle } from "@/components/theme-toggle";
import { ui } from "@/components/ui";
import { getCurrentUser } from "@/lib/db/server";
import { PasswordForm } from "./password-form";
import { signOut } from "./actions";

export default async function SettingsPage() {
  const user = await getCurrentUser();

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
