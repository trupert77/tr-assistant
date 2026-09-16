import { EmptyState } from "@/components/empty-state";
import { SparklesIcon } from "@/components/icons";
import { ui } from "@/components/ui";

export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className={ui.pageTitle}>Assistant</h1>
      <EmptyState icon={<SparklesIcon size={22} />} title="Ask anything, soon">
        Questions like &ldquo;what am I waiting on Matt for?&rdquo; get answered
        here in Phase 6.
      </EmptyState>
    </div>
  );
}
