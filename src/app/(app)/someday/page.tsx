import Link from "next/link";
import { CloudIcon } from "@/components/icons";
import { ItemGroups } from "@/components/item-groups";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { loadSomeday } from "@/lib/items/queries";

/**
 * Everything open with no date, oldest first. Today only shows undated
 * captures for 48 hours; this is where they live after that.
 */
export default async function SomedayPage() {
  const db = await createSupabaseServerClient();
  const { groups, meta } = await loadSomeday(db);
  const total = groups.goals.length + groups.tasks.length + groups.waiting.length + groups.notes.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-foreground">
          ← Today
        </Link>
        <div className="flex items-center gap-3">
          <CloudIcon size={22} className="text-accent" />
          <h1 className={ui.pageTitle}>Someday</h1>
          {total > 0 && <span className="text-sm text-faint">{total}</span>}
        </div>
        <p className="text-sm text-muted">
          Open items with no date, oldest first. Give one a date and it moves to Today.
        </p>
      </div>

      <ItemGroups
        groups={groups}
        timeZone={getServerEnv().APP_TIMEZONE}
        people={meta.people}
        projects={meta.projects}
        emptyText="Nothing undated. Everything open has a day attached."
      />
    </div>
  );
}
