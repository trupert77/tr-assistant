import { Skeleton } from "@/components/skeleton";
import { ui } from "@/components/ui";

/**
 * Fallback for any (app) page without its own loading.tsx (Today, Guide,
 * Projects, Assistant). Kept generic: a title and a couple of lists.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-7" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-64" />
      </div>
      {[0, 1].map((s) => (
        <section key={s} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <ul className={`${ui.card} divide-y divide-line`}>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="h-2 w-2" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
