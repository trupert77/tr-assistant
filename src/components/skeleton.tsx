/** Pulsing placeholder block in the app's pill shape. Size it with h-* / w-*. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none ${className}`} />;
}
