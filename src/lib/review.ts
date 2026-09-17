import type { User } from "@supabase/supabase-js";

/**
 * When the weekly review was last finished. Lives in Supabase auth user
 * metadata next to `ai_provider`, so it needs no table.
 */
export const LAST_REVIEW_KEY = "last_review_at";

const REVIEW_EVERY_DAYS = 7;

export function lastReviewOf(user: User | null | undefined): Date | null {
  const value = user?.user_metadata?.[LAST_REVIEW_KEY];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when a week has passed since the last review, or there has never been one. */
export function isReviewDue(user: User | null | undefined, now: Date = new Date()): boolean {
  const last = lastReviewOf(user);
  return !last || now.getTime() - last.getTime() >= REVIEW_EVERY_DAYS * 86_400_000;
}
