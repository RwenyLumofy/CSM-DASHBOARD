import { PageHeader } from "@/components/layout/PageHeader";
import { InboxList } from "@/components/inbox/InboxList";
import { getMyNotifications } from "@/lib/data";

export const metadata = { title: "Action list · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const all = await getMyNotifications(150);
  const open = all.filter((n) => n.status === "open");
  const done = all.filter((n) => n.status === "done");

  return (
    <div className="flex flex-col gap-8 p-8">
      <PageHeader
        title="Action list"
        description="Assignments, reviews, and items that need your attention. Resolve an item once you've handled it."
      />
      <div className="max-w-3xl">
        <InboxList open={open} done={done} />
      </div>
    </div>
  );
}
