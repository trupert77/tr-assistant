import { getCurrentUser } from "@/lib/db/server";
import { PasswordForm } from "./password-form";
import { signOut } from "./actions";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500">Signed in as</span>
        <span>{user?.email}</span>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Set a password
        </h2>
        <p className="text-sm text-zinc-500">
          Optional. Lets you sign in without waiting for an email link.
        </p>
        <PasswordForm />
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
