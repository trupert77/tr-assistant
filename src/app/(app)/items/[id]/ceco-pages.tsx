"use client";

import Link from "next/link";
import { useTransition } from "react";
import { XIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { ui } from "@/components/ui";
import { setItemCecoPageAction } from "../../ceco/actions";

type PageOption = { path: string; title: string; area: string };

/**
 * Which pages of the CECO portal this item is about. The classifier fills
 * this in when a capture is clearly about the app; this is where to fix it.
 */
export function CecoPages({
  itemId,
  linked,
  pages,
}: {
  itemId: string;
  linked: string[];
  /** Every page in the synced scope, for the picker. */
  pages: PageOption[];
}) {
  const [pending, startTransition] = useTransition();
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const available = pages.filter((p) => !linked.includes(p.path));
  const areas = [...new Set(available.map((p) => p.area))];

  const set = (path: string, on: boolean) =>
    startTransition(async () => {
      const result = await setItemCecoPageAction({ itemId, path, linked: on });
      if (!result.ok) toast(result.error ?? "That did not work.");
    });

  return (
    <section className="flex flex-col gap-3">
      <h2 className={ui.sectionTitle}>CECO pages</h2>

      {linked.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {linked.map((path) => (
            <li
              key={path}
              className="inline-flex items-center rounded-full border border-line bg-surface text-xs transition-colors hover:border-line-strong"
            >
              <Link href={{ pathname: "/ceco", query: { page: path } }} className="py-1.5 pl-3 pr-1 hover:text-accent">
                {byPath.get(path)?.title ?? path}
              </Link>
              <button
                type="button"
                disabled={pending}
                aria-label={`This is not about ${byPath.get(path)?.title ?? path}`}
                onClick={() => set(path, false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-faint hover:text-danger disabled:opacity-40"
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="ceco-page" className="sr-only">
        Add a CECO page
      </label>
      <select
        id="ceco-page"
        value=""
        disabled={pending}
        onChange={(e) => e.target.value && set(e.target.value, true)}
        className={`${ui.input} appearance-none`}
      >
        <option value="">{linked.length ? "About another page…" : "Is this about a CECO page?"}</option>
        {areas.map((area) => (
          <optgroup key={area} label={area}>
            {available
              .filter((p) => p.area === area)
              .map((p) => (
                <option key={p.path} value={p.path}>
                  {p.title}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </section>
  );
}
