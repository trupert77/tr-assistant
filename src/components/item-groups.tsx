import { ui } from "@/components/ui";
import type { ItemRow as Item } from "@/lib/db/types";
import type { ItemGroups as Groups, LinkedPerson } from "@/lib/items/queries";
import { EmptyState } from "./empty-state";
import { ItemRow } from "./item-row";

/** Goals / Tasks / Waiting on / Notes / Done sections, shared by project and person pages. */
export function ItemGroups({
  groups,
  timeZone,
  people,
  projects,
  emptyText,
}: {
  groups: Groups;
  timeZone: string;
  people: Map<string, LinkedPerson[]>;
  projects?: Map<string, string>;
  emptyText: string;
}) {
  const sections: { title: string; items: Item[] }[] = [
    { title: "Goals", items: groups.goals },
    { title: "Tasks", items: groups.tasks },
    { title: "Waiting on", items: groups.waiting },
    { title: "Notes", items: groups.notes },
    { title: "Done", items: groups.done },
  ];
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  if (total === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <>
      {sections.map(
        (s) =>
          s.items.length > 0 && (
            <section key={s.title} className="flex flex-col gap-3">
              <h2 className={ui.sectionTitle}>
                {s.title}
                <span className="ml-2 text-faint">{s.items.length}</span>
              </h2>
              <ul className={`${ui.card} divide-y divide-line`}>
                {s.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    timeZone={timeZone}
                    people={people.get(item.id)}
                    projectName={
                      projects && item.project_id ? projects.get(item.project_id) : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ),
      )}
    </>
  );
}
