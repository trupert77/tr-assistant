import { EmptyState } from "@/components/empty-state";

export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
      <EmptyState>Ask questions about what you have stored. Coming in Phase 6.</EmptyState>
    </div>
  );
}
