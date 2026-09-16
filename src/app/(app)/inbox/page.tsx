import { EmptyState } from "@/components/empty-state";

export default function InboxPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
      <EmptyState>Everything you capture lands here first. Capture ships in Phase 2.</EmptyState>
    </div>
  );
}
