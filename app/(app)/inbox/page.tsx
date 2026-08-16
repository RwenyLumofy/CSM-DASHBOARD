import { PageHeader } from "@/components/layout/PageHeader";
import { ActionFeed } from "@/components/actions/ActionFeed";
import { ExpansionActionList } from "@/components/expansion/ExpansionActionList";
import { getMyClientActions } from "@/lib/data";
import { getExpansionActionItems } from "@/lib/expansion/read";

export const metadata = { title: "Action list · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  /* Expansion sits ABOVE the AI feed: an opportunity with no owner or no next
     step is a commitment already made, and outranks guidance about one that
     might be. It is derived live from attention() — never stored, so an
     unchanged fact cannot produce a fresh alert tomorrow. */
  const [actions, expansion] = await Promise.all([
    getMyClientActions(),
    getExpansionActionItems().catch(() => ({ items: [], today: "" })),
  ]);

  return (
    <div className="flex flex-col gap-8 p-8">
      <PageHeader
        title="Action list"
        description="AI-guided next steps across your accounts — what to complete, who to reach out to, where to intervene. Filter to organize, and Regenerate to refresh from the latest readings."
      />
      <div className="flex max-w-3xl flex-col gap-6">
        <ExpansionActionList items={expansion.items} />
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
