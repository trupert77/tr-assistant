import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { CaptureBar } from "@/components/capture-bar";
import { LogoMark, SettingsIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/db/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky z-10 bg-canvas/80 backdrop-blur-xl"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark />
            <span className="text-base font-bold tracking-tight">
              tr<span className="text-accent">.</span>assistant
            </span>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <SettingsIcon size={21} />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-36 pt-2">
        <CaptureBar />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
