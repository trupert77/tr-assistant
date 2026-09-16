import { Skeleton } from "@/components/skeleton";
import { ui } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <h1 className={ui.pageTitle}>Settings</h1>
      <section className={`${ui.cardPad} flex flex-col gap-2`}>
        <span className={ui.sectionTitle}>Signed in as</span>
        <Skeleton className="h-4 w-48" />
      </section>
      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <span className={ui.sectionTitle}>Appearance</span>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-13 w-full" />
      </section>
      <Skeleton className="h-20 w-full rounded-3xl" />
      <section className={`${ui.cardPad} flex flex-col gap-3`}>
        <span className={ui.sectionTitle}>Password</span>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </section>
    </div>
  );
}
