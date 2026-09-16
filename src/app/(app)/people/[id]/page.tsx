import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemGroups } from "@/components/item-groups";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { loadPeopleFor, loadPersonItems, loadProjectNames } from "@/lib/items/queries";
import { PersonForm } from "./person-form";

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();

  const { data: person } = await db.from("people").select().eq("id", id).maybeSingle();
  if (!person) notFound();

  const { waitingOn, other } = await loadPersonItems(db, id);
  const all = [...waitingOn, ...other.tasks, ...other.waiting, ...other.notes, ...other.done];
  const [people, projects] = await Promise.all([
    loadPeopleFor(db, all.map((i) => i.id)),
    loadProjectNames(db),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Link href="/people" className="text-xs font-semibold text-muted hover:text-foreground">
          ← People
        </Link>
        <h1 className={ui.pageTitle}>{person.name}</h1>
        {person.aliases.length > 0 && (
          <p className="text-xs text-muted">Also: {person.aliases.join(", ")}</p>
        )}
        {person.notes && <p className="text-sm leading-6 text-muted">{person.notes}</p>}
      </div>

      {waitingOn.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={`${ui.sectionTitle} text-followup`}>
            Waiting on {person.name.split(" ")[0]}
            <span className="ml-2 text-faint">{waitingOn.length}</span>
          </h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {waitingOn.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                timeZone={timeZone}
                people={people.get(item.id)?.filter((p) => p.id !== person.id)}
                projectName={item.project_id ? projects.get(item.project_id) : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      <ItemGroups
        groups={other}
        timeZone={timeZone}
        people={people}
        projects={projects}
        emptyText={
          waitingOn.length
            ? "Nothing else mentions this person."
            : "Nothing mentions this person yet."
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>Edit person</h2>
        <PersonForm person={person} />
      </section>
    </div>
  );
}
