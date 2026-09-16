import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  action,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  /** Optional follow-up rendered under the text, e.g. example chips. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && (
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </span>
      )}
      {title && <p className="text-sm font-bold">{title}</p>}
      <p className="max-w-xs text-sm leading-6 text-muted">{children}</p>
      {action && <div className="mt-4 w-full">{action}</div>}
    </div>
  );
}
