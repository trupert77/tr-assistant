import { EmptyState } from "@/components/empty-state";

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
      <EmptyState>Projects group related tasks, follow-ups, and notes. Coming in Phase 5.</EmptyState>
    </div>
  );
}
