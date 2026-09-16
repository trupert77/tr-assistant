import { KindLegend } from "@/components/kind-legend";
import { Skeleton } from "@/components/skeleton";
import { ui } from "@/components/ui";

export default function InboxLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h1 className={ui.pageTitle}>Inbox</h1>
        </div>
        <KindLegend />
        <ul className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <li key={i} className={`${ui.cardPad} flex flex-col gap-3`}>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-14" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-16" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>Recently filed</h2>
        <ul className={`${ui.card} divide-y divide-line`}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="h-2 w-2" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
