import Link from "next/link";
import { Settings2, Workflow as WorkflowIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PropertiesManager } from "@/components/settings/PropertiesManager";
import { RoleLabelsManager } from "@/components/settings/RoleLabelsManager";
import { SyncManager } from "@/components/settings/SyncManager";
import { UsersManager } from "@/components/settings/UsersManager";
import { WorkflowManager } from "@/components/settings/WorkflowManager";
import { LumofyStaffManager } from "@/components/settings/LumofyStaffManager";
import { StakeholderTypesManager } from "@/components/settings/StakeholderTypesManager";
import { getAppUsers, getPropertyDefinitions, getRoleLabels } from "@/lib/data";
import { getCurrentUserEmail, isSuperAdmin } from "@/lib/auth";
import { hasDatabase, integrations } from "@/lib/config";
import { cn } from "@/lib/cn";
import type { LumofyStaffMember } from "@/components/settings/LumofyStaffManager";

export const metadata = { title: "Settings · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [defs, superAdmin, currentUserEmail, roleLabels] = await Promise.all([
    getPropertyDefinitions(),
    isSuperAdmin(),
    getCurrentUserEmail(),
    getRoleLabels(),
  ]);
  let lumofyStaff: LumofyStaffMember[] = [];
  let stakeholderTypes: string[] = [];
  if (hasDatabase() && superAdmin) {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    [lumofyStaff, stakeholderTypes] = await Promise.all([
      getWorkspaceConfigFromDb("lumofy_staff").then((v) => (v as LumofyStaffMember[]) ?? []),
      getWorkspaceConfigFromDb("stakeholder_types").then((v) => (v as string[]) ?? []),
    ]);
  }

  const activeTab = tab === "workflows" && superAdmin ? "workflows" : "workspace";

  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Settings" description="Manage properties, team roles, automations, and workspace configuration." />

      {superAdmin && (
        <div className="flex gap-1 border-b border-border">
          {([
            ["workspace", "Workspace", Settings2],
            ["workflows", "Workflows", WorkflowIcon],
          ] as const).map(([key, label, Icon]) => (
            <Link
              key={key}
              href={`/settings?tab=${key}`}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 font-body text-[13.5px] font-semibold transition-colors",
                activeTab === key ? "border-sirius text-sirius" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              <Icon size={15} /> {label}
            </Link>
          ))}
        </div>
      )}

      {activeTab === "workflows" ? (
        <WorkflowsTab roleLabels={roleLabels} />
      ) : (
        <WorkspaceTab superAdmin={superAdmin} defs={defs} appUsers={superAdmin ? await getAppUsers() : []} currentUserEmail={currentUserEmail} roleLabels={roleLabels} lumofyStaff={lumofyStaff} stakeholderTypes={stakeholderTypes} />
      )}
    </div>
  );
}

async function WorkspaceTab({
  superAdmin,
  defs,
  appUsers,
  currentUserEmail,
  roleLabels,
  lumofyStaff,
  stakeholderTypes,
}: {
  superAdmin: boolean;
  defs: Awaited<ReturnType<typeof getPropertyDefinitions>>;
  appUsers: Awaited<ReturnType<typeof getAppUsers>>;
  currentUserEmail: string | null;
  roleLabels: Record<string, string>;
  lumofyStaff: LumofyStaffMember[];
  stakeholderTypes: string[];
}) {
  let lastSyncedAt: string | null = null;
  if (hasDatabase()) {
    const { getSyncCheckpoint } = await import("@/lib/repo/drizzle");
    lastSyncedAt = await getSyncCheckpoint("last_synced_at").catch(() => null);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="max-w-3xl">
        <div className="mb-5">
          <h2 className="font-display text-base font-semibold text-fg">Properties</h2>
          <p className="mt-1 font-body text-sm text-fg-muted">
            {superAdmin
              ? "Configure the fields on client profiles — rename labels, manage option lists, and create custom properties."
              : "Property definitions are managed by your admin and are read-only for your role."}
          </p>
        </div>
        <PropertiesManager initialDefs={defs} isSuperAdmin={superAdmin} />
      </section>

      {superAdmin && (
        <>
          <section className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-display text-base font-semibold text-fg">Users &amp; roles</h2>
              <p className="mt-1 font-body text-sm text-fg-muted">
                Add team members and set each one&apos;s role. CSM tiers see only their own clients and can&apos;t change
                property definitions; super-admins manage everything. A user is matched by the email they sign in with.
              </p>
            </div>
            <UsersManager initialUsers={appUsers} currentUserEmail={currentUserEmail} roleLabels={roleLabels} />
          </section>

          <section className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-display text-base font-semibold text-fg">Role names</h2>
              <p className="mt-1 font-body text-sm text-fg-muted">
                Customise how each role tier is labelled across the app. The internal role key (shown in grey) stays
                fixed; only the display name changes.
              </p>
            </div>
            <RoleLabelsManager initialLabels={roleLabels} />
          </section>
        </>
      )}

      {superAdmin && (
        <>
          <section className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-display text-base font-semibold text-fg">Lumofy team</h2>
              <p className="mt-1 font-body text-sm text-fg-muted">
                Manage the internal Lumofy team members that can be assigned in the stakeholder mapping matrix. Fill in name, title, email and phone for each person.
              </p>
            </div>
            <LumofyStaffManager initialStaff={lumofyStaff} />
          </section>

          <section className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-display text-base font-semibold text-fg">Stakeholder types</h2>
              <p className="mt-1 font-body text-sm text-fg-muted">
                Define the stakeholder roles used in the client stakeholder mapping matrix. These labels appear as the row headers in every client&apos;s Communication → Stakeholder Mapping view.
              </p>
            </div>
            <StakeholderTypesManager initialTypes={stakeholderTypes} />
          </section>
        </>
      )}

      <section className="max-w-3xl">
        <div className="mb-5">
          <h2 className="font-display text-base font-semibold text-fg">Data sync</h2>
          <p className="mt-1 font-body text-sm text-fg-muted">
            Pull the latest companies and deals from HubSpot. The daily sync runs automatically and never overwrites
            your in-app edits; use these controls to sync on demand.
          </p>
        </div>
        <SyncManager
          isSuperAdmin={superAdmin}
          initialLastSyncedAt={lastSyncedAt}
          hubspotConfigured={integrations.hubspot()}
          databaseConfigured={hasDatabase()}
        />
      </section>
    </div>
  );
}

async function WorkflowsTab({ roleLabels }: { roleLabels: Record<string, string> }) {
  const { getCsmAssignmentConfig, getImplementationAssignmentConfig, getCapacityConfig } = await import("@/lib/assignment/config");
  const { getTeamHealth } = await import("@/lib/assignment/health");
  const [csm, impl, capacity, teamHealth] = await Promise.all([
    getCsmAssignmentConfig(),
    getImplementationAssignmentConfig(),
    getCapacityConfig(),
    getTeamHealth(),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h2 className="font-display text-base font-semibold text-fg">Assignment workflows</h2>
        <p className="mt-1 font-body text-sm text-fg-muted">
          Define how new clients are routed to a CSM and an Implementation owner. Rules run automatically when a new
          client is synced from HubSpot; you can also run them on demand.
        </p>
      </div>
      <WorkflowManager initialCsm={csm} initialImpl={impl} initialCapacity={capacity} teamHealth={teamHealth} roleLabels={roleLabels} />
    </div>
  );
}
