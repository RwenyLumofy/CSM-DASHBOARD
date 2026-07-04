import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ImportClient } from "@/components/import/ImportClient";
import { Download } from "lucide-react";

export const metadata = { title: "Import clients · Lumofy CS" };

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader
        eyebrow="Onboarding"
        title="Import existing clients"
        description="Bulk-add your current ARR customers from an Excel or CSV file. New customers flow in automatically from HubSpot Closed Won deals — this is for the accounts you already have. Renewals and expansions are then managed inside the app."
        actions={
          <Button href="/api/import/clients?template=1" variant="secondary" size="sm" iconLeft={Download}>
            Download template
          </Button>
        }
      />
      <ImportClient />
    </div>
  );
}
