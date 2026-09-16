"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderIcon } from "./icons";
import { ui } from "./ui";

/**
 * A chip-shaped submit button that shows a spinner while its form is
 * submitting. In a form with several submit buttons (`name`/`value`), only the
 * one that was tapped spins; the others just disable.
 */
export function SubmitChip({
  name,
  value,
  className = "",
  children,
}: {
  name?: string;
  value?: string;
  className?: string;
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && (name === undefined || data?.get(name) === value);

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={mine || undefined}
      className={`${ui.chip} ${className} disabled:cursor-progress ${
        pending && !mine ? "opacity-50" : ""
      }`}
    >
      {mine && <LoaderIcon size={14} strokeWidth={2.4} className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}
