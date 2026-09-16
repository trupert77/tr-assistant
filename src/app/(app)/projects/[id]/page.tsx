import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemGroups } from "@/components/item-groups";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { loadItemOptions, loadPeopleFor, loadProjectItems } from "@/lib/items/queries";
import { archiveProjectAction } from "../actions";
import { ProjectForm } from "./project-form";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();

  const { data: project } = await db.from("projects").select().eq("id", id).maybeSingle();
  if (!project) notFound();

  const [groups, options] = await Promise.all([loadProjectItems(db, id), loadItemOptions(db)]);
  const all = [...groups.tasks, ...groups.waiting, ...groups.notes, ...groups.done];
  const people = await loadPeopleFor(db, all.map((i) => i.id));
  const workspace = options.workspaces.find((w) => w.id === project.workspace_id);
  const openCount = groups.tasks.length + groups.waiting.length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Link href="/projects" className="text-xs font-semibold text-muted hover:text-foreground">
          ← Projects
        </Link>
        <p className={ui.eyebrow}>{workspace?.name ?? "No workspace"}</p>
        <h1 className={ui.pageTitle}>{project.name}</h1>
        {project.description && (
          <p className="text-sm leading-6 text-muted">{project.description}</p>
        )}
        <p className="text-xs text-muted">
          {openCount ? `${openCount} open` : "Nothing open"}
          {groups.notes.length ? ` · ${groups.notes.length} notes` : ""}
          {groups.done.length ? ` · ${groups.done.length} done` : ""}
        </p>
      </div>

      <ItemGroups
        groups={groups}
        timeZone={timeZone}
        people={people}
        emptyText="Nothing filed under this project yet. Mention it in a capture and the assistant will link it."
      />

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>Edit project</h2>
        <ProjectForm project={project} workspaces={options.workspaces} />
      </section>

      {project.status === "active" && (
        <form action={archiveProjectAction} className="flex justify-end pt-2">
          <input type="hidden" name="id" value={project.id} />
          <button
            type="submit"
            className="text-xs text-faint underline-offset-2 hover:text-danger hover:underline"
          >
            Archive project
          </button>
        </form>
      )}
    </div>
  );
}
