import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { LogoMark } from "@/components/icons";
import { ui } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <div className="flex justify-center">
        <LogoMark size={44} />
      </div>
      <EmptyState
        title="Nothing here"
        action={
          <Link href="/" className={`${ui.btnPrimary} w-full`}>
            Back to Today
          </Link>
        }
      >
        That page doesn&apos;t exist, or the link is out of date.
      </EmptyState>
    </main>
  );
}
