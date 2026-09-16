import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { CaptureBar } from "@/components/capture-bar";
import { getCurrentUser } from "@/lib/db/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          TR Assistant
        </Link>
        <Link
          href="/settings"
          className="text-sm text-zinc-500 hover:text-foreground"
        >
          Settings
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-24 pt-2">
        <CaptureBar />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
