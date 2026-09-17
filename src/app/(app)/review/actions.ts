"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { LAST_REVIEW_KEY } from "@/lib/review";

/** Stamp the review as done so Today stops asking for another week. */
export async function finishReviewAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { [LAST_REVIEW_KEY]: new Date().toISOString() },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/");
}
