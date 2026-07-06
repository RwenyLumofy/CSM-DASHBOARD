import { PageHeader } from "@/components/layout/PageHeader";
import { ActionFeed } from "@/components/actions/ActionFeed";
import { getMyClientActions } from "@/lib/data";

export const metadata = { title: "Action list · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const actions = await getMyClientActions();

  return (
    <div className="flex flex-col gap-8 p-8">
      <PageHeader
        title="Action list"
        description="AI-guided next steps across your accounts — what to complete, who to reach out to, where to intervene. Filter to organize, and Regenerate to refresh from the latest readings."
      />
      <div className="max-w-3xl">
        <ActionFeed
          mode="global"
          items={actions.map((a) => ({
            id: a.id,
            clientId: a.clientId,
            category: a.category,
            signalKey: a.signalKey,
            priority: a.priority,
            title: a.title,
            insight: a.insight,
            source: a.source,
            clientName: a.clientName,
          }))}
        />
      </div>
    </div>
  );
}
