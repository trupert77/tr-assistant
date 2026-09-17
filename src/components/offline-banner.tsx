"use client";

import { useOffline } from "next/offline";

/**
 * Shown only while the network is down. With experimental.useOffline on,
 * Next holds navigations and Server Actions rather than failing them, so a
 * capture typed offline still sends once the connection returns. The banner
 * exists to explain the wait, since a held request looks like a slow one.
 */
export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <p className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-4 py-2 text-xs font-semibold text-foreground shadow-float backdrop-blur-xl">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-danger" />
        Offline — anything you save sends when you reconnect
      </p>
    </div>
  );
}
