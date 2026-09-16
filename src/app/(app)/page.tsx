import { EmptyState } from "@/components/empty-state";

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>
      <EmptyState>
        Nothing here yet. Capture and classification arrive in the next phases.
      </EmptyState>
    </div>
  );
}
