import { SparklesIcon } from "./icons";
import { kindStyles } from "./ui";

const KINDS = ["task", "followup", "note"] as const;

/**
 * One-line color key: the three item kinds plus what orange means.
 * Sits under the Inbox header; also reused on the guide page.
 */
export function KindLegend({ showAccent = true }: { showAccent?: boolean }) {
  return (
    <dl
      aria-label="Legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"
    >
      {KINDS.map((kind) => (
        <div key={kind} className="flex items-center gap-1.5">
          <dt className="sr-only">Color</dt>
          <dd className={`h-2 w-2 rounded-full ${kindStyles[kind].dot}`} aria-hidden />
          <dd>{kindStyles[kind].label}</dd>
        </div>
      ))}
      {showAccent && (
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Orange</dt>
          <dd className="text-accent" aria-hidden>
            <SparklesIcon size={12} strokeWidth={2.2} />
          </dd>
          <dd>AI pick</dd>
        </div>
      )}
    </dl>
  );
}
