"use client";

import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { LogoMark } from "@/components/icons";
import { ui } from "@/components/ui";

/** Catches render/data errors inside the root layout, on any page. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex justify-center">
        <LogoMark size={44} />
      </div>
      <EmptyState
        title="Something broke"
        action={
          <div className="flex flex-col gap-2">
            <button type="button" onClick={reset} className={`${ui.btnPrimary} w-full`}>
              Try again
            </button>
            <Link href="/" className={`${ui.btnSecondary} w-full`}>
              Back to Today
            </Link>
          </div>
        }
      >
        {error.message || "The page hit an error while loading."}
        {error.digest && (
          <span className="mt-2 block text-xs text-faint">ref {error.digest}</span>
        )}
      </EmptyState>
    </main>
  );
}
