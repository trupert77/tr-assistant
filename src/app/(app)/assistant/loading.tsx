import { Skeleton } from "@/components/skeleton";
import { ui } from "@/components/ui";

/** Shown while the question is being retrieved and answered. */
export default function AssistantLoading() {
  return (
    <div className="flex flex-col gap-7" aria-busy="true" aria-label="Thinking">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>Assistant</h1>
        <Skeleton className="h-12 w-full" />
      </div>
      <div className={`${ui.cardPad} flex flex-col gap-3`}>
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <div className={`${ui.card} flex flex-col gap-4 p-5`}>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
