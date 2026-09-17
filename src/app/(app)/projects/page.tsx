import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, FolderIcon } from "@/components/icons";
import { SegmentNav } from "@/components/segment-nav";
import { isCecoConfigured } from "@/lib/ceco";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadItemOptions, loadProjectSummaries } from "@/lib/items/queries";
import { NewProjectForm } from "./new-project-form";

export default async function ProjectsPage() {
  const db = await createSupabaseServerClient();
  const [projects, options] = await Promise.all([
    loadProjectSummaries(db),
    loadItemOptions(db),
  ]);

  // Group by workspace, preserving the workspace sort order from the query.
  const groups: { name: string; projects: typeof projects }[] = [];
  for (const p of projects) {
    const name = p.workspaceName ?? "No workspace";
    const g = groups.find((x) => x.name === name);
    if (g) g.projects.push(p);
    else groups.push({ name, projects: [p] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>Projects</h1>
        <SegmentNav showCeco={isCecoConfigured()} />
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<FolderIcon size={22} />} title="No projects yet">
          Create one below, or accept a project the assistant proposes in the Inbox.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.name} className="flex flex-col gap-3">
            <h2 className={ui.sectionTitle}>{g.name}</h2>
            <ul className={`${ui.card} divide-y divide-line`}>
              {g.projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <FolderIcon size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {p.openCount ? `${p.openCount} open` : "nothing open"}
                    </span>
                    <ArrowRightIcon size={16} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>New project</h2>
        <NewProjectForm workspaces={options.workspaces} />
      </section>
    </div>
  );
}
