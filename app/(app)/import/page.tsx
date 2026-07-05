import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ImportClient } from "@/components/import/ImportClient";
import { Download } from "lucide-react";
import { isSuperAdmin } from "@/lib/auth";

export const metadata = { title: "Import clients · Lumofy Signals" };
export const dynamic = "force-dynamic";

// Bulk import writes across the entire clients table (not scoped to "my
// clients"), so it's admin-only — same boundary the API route itself now
// enforces on commit; this just keeps a CSM from seeing a feature they can't
// actually use.
export default async function ImportPage() {
  const superAdmin = await isSuperAdmin();

  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader
        eyebrow="Onboarding"
        title="Import existing clients"
        description="Bulk-add your current ARR customers from an Excel or CSV file. New customers flow in automatically from HubSpot Closed Won deals — this is for the accounts you already have. Renewals and expansions are then managed inside the app."
        actions={
          superAdmin ? (
            <Button href="/api/import/clients?template=1" variant="secondary" size="sm" iconLeft={Download}>
              Download template
            </Button>
          ) : undefined
        }
      />
      {superAdmin ? (
        <ImportClient />
      ) : (
        <p className="p-lead">Only an admin can bulk-import clients. Contact your admin for access.</p>
      )}
    </div>
  );
}
