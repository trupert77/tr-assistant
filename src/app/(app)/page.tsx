import { EmptyState } from "@/components/empty-state";

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>
      <EmptyState>
        Nothing due yet. Use the box above to capture anything; it lands in the Inbox.
      </EmptyState>
    </div>
  );
}
