import { EmptyState } from "@/components/empty-state";
import { FolderIcon } from "@/components/icons";
import { ui } from "@/components/ui";

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className={ui.pageTitle}>Projects</h1>
      <EmptyState icon={<FolderIcon size={22} />} title="No projects yet">
        Projects group related tasks, follow-ups, and notes. They arrive in
        Phase 5.
      </EmptyState>
    </div>
  );
}
