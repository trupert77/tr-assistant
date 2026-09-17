"use client";

import { useEffect, useState, useTransition } from "react";

type Toast = {
  id: number;
  message: string;
  /** Shown as an Undo button when present. */
  undo?: () => Promise<void> | void;
};

const SHOW_MS = 6000;

let nextId = 1;
const listeners = new Set<(toast: Toast) => void>();

/** Show a toast from any client component. The newest one replaces the last. */
export function toast(message: string, undo?: Toast["undo"]) {
  const item = { id: nextId++, message, undo };
  listeners.forEach((listener) => listener(item));
}

/** Mounted once in the app layout, floating just above the bottom nav. */
export function Toaster() {
  const [current, setCurrent] = useState<Toast | null>(null);
  const [undoing, startUndo] = useTransition();

  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [current]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
    >
      {current && (
        <div
          key={current.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-line-strong bg-surface py-1.5 pl-5 pr-1.5 text-sm shadow-float"
        >
          <span className="min-w-0 flex-1 truncate">{current.message}</span>
          {current.undo ? (
            <button
              type="button"
              disabled={undoing}
              onClick={() =>
                startUndo(async () => {
                  await current.undo?.();
                  setCurrent(null);
                })
              }
              className="flex min-h-9 shrink-0 items-center rounded-full bg-accent-soft px-4 text-xs font-bold text-accent disabled:opacity-50"
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          ) : (
            <span className="w-2" />
          )}
        </div>
      )}
    </div>
  );
}
