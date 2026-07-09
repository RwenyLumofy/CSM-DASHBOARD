import Link from "next/link";
import { FolderKanban, Settings2, Workflow as WorkflowIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PropertiesManager } from "@/components/settings/PropertiesManager";
import { RoleLabelsManager } from "@/components/settings/RoleLabelsManager";
import { SyncManager } from "@/components/settings/SyncManager";
import { UsersManager } from "@/components/settings/UsersManager";
import { WorkflowManager } from "@/components/settings/WorkflowManager";
import { LumofyStaffManager } from "@/components/settings/LumofyStaffManager";
import { StakeholderTypesManager } from "@/components/settings/StakeholderTypesManager";
import { AttachmentCategoriesManager } from "@/components/settings/AttachmentCategoriesManager";
import { ProjectOptionsManager } from "@/components/settings/ProjectOptionsManager";
import { ProjectTemplatesManager } from "@/components/settings/ProjectTemplatesManager";
import { getAppUsers, getPropertyDefinitions, getRoleLabels } from "@/lib/data";
import { getProjectConfig, listProjectTemplates } from "@/lib/projects/data";
import { getCurrentUserEmail, isSuperAdmin } from "@/lib/auth";
import { hasDatabase, integrations } from "@/lib/config";
import { withDbTimeout } from "@/lib/db/client";
import { cn } from "@/lib/cn";
import type { LumofyStaffMember } from "@/components/settings/LumofyStaffManager";

export const metadata = { title: "Settings · Lumofy Signals" };
export const dynamic = "force-dynamic";
// Saving the Client Health formula (workflow-actions.saveClientHealthConfigAction)
// runs a full recomputeAllClientHealth() sweep — 74 clients, each with a usage
// read. Server actions are dispatched to their host route, so this ceiling
// applies to that save. Matches the client-health cron's maxDuration.
export const maxDuration = 300;

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
  let attachmentCategories: string[] = [];
  if (hasDatabase() && superAdmin) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      [lumofyStaff, stakeholderTypes, attachmentCategories] = await withDbTimeout(
        Promise.all([
          getWorkspaceConfigFromDb("lumofy_staff").then((v) => (v as LumofyStaffMember[]) ?? []),
          getWorkspaceConfigFromDb("stakeholder_types").then((v) => (v as string[]) ?? []),
          getWorkspaceConfigFromDb("attachment_categories").then((v) => (v as string[]) ?? []),
        ]),
      );
    } catch (err) {
      console.warn("[settings] workspace config read failed:", err);
    }
  }

  const activeTab =
    tab === "workflows" && superAdmin ? "workflows" : tab === "projects" ? "projects" : "workspace";

  // Projects is available to everyone (templates); Workflows stays admin-only.
  const tabs = [
    ["workspace", "Workspace", Settings2],
    ["projects", "Projects", FolderKanban],
    ...(superAdmin ? [["workflows", "Workflows", WorkflowIcon] as const] : []),
  ] as const;

  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Settings" description="Manage properties, team roles, automations, and workspace configuration." />

      <div className="flex gap-1 border-b border-border">
        {tabs.map(([key, label, Icon]) => (
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

      {activeTab === "workflows" ? (
        <WorkflowsTab roleLabels={roleLabels} />
      ) : activeTab === "projects" ? (
        <ProjectsSettingsTab superAdmin={superAdmin} currentUserEmail={currentUserEmail} />
      ) : (
        <WorkspaceTab superAdmin={superAdmin} defs={defs} appUsers={superAdmin ? await getAppUsers() : []} currentUserEmail={currentUserEmail} roleLabels={roleLabels} lumofyStaff={lumofyStaff} stakeholderTypes={stakeholderTypes} attachmentCategories={attachmentCategories} />
      )}
    </div>
  );
}

async function ProjectsSettingsTab({ superAdmin, currentUserEmail }: { superAdmin: boolean; currentUserEmail: string | null }) {
  const [config, templates] = await Promise.all([getProjectConfig(), listProjectTemplates()]);
  return (
    <div className="flex flex-col gap-8">
      <section className="max-w-3xl">
        <div className="mb-5">
          <h2 className="font-display text-base font-semibold text-fg">Project options</h2>
          <p className="mt-1 font-body text-sm text-fg-muted">
            {superAdmin
              ? "Configure the Status and Type vocabularies used on every account's Project Management tab. Statuses double as the kanban columns."
              : "Project statuses and types are managed by your admin and are read-only for your role."}
          </p>
        </div>
        <ProjectOptionsManager initialConfig={config} isSuperAdmin={superAdmin} />
      </section>

      <section className="max-w-3xl">
        <div className="mb-5">
          <h2 className="font-display text-base font-semibold text-fg">Project templates</h2>
          <p className="mt-1 font-body text-sm text-fg-muted">
            Reusable milestone/task blueprints any CSM can apply to a new project. Everyone sees every template; you can edit or delete the ones you created (super-admins can manage all).
          </p>
        </div>
        <ProjectTemplatesManager initialTemplates={templates} config={config} currentUserEmail={currentUserEmail} isSuperAdmin={superAdmin} />
      </section>
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
  attachmentCategories,
}: {
  superAdmin: boolean;
  defs: Awaited<ReturnType<typeof getPropertyDefinitions>>;
  appUsers: Awaited<ReturnType<typeof getAppUsers>>;
  currentUserEmail: string | null;
  roleLabels: Record<string, string>;
  lumofyStaff: LumofyStaffMember[];
  stakeholderTypes: string[];
  attachmentCategories: string[];
}) {
  let lastSyncedAt: string | null = null;
  if (hasDatabase()) {
    const { getSyncCheckpoint } = await import("@/lib/repo/drizzle");
    lastSyncedAt = await withDbTimeout(getSyncCheckpoint("last_synced_at")).catch(() => null);
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

          <section className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-display text-base font-semibold text-fg">Attachment categories</h2>
              <p className="mt-1 font-body text-sm text-fg-muted">
                Define the categories CSMs can tag files with on every account's Attachments tab (e.g. Contract, Invoice, Deck). These appear as filter and picker options there.
              </p>
            </div>
            <AttachmentCategoriesManager initialCategories={attachmentCategories} />
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
  const { getCsmAssignmentConfig, getImplementationAssignmentConfig, getCapacityConfig, getClientHealthConfig } = await import("@/lib/assignment/config");
  const { getTeamHealth } = await import("@/lib/assignment/health");
  const [csm, impl, capacity, teamHealth, clientHealth] = await Promise.all([
    getCsmAssignmentConfig(),
    getImplementationAssignmentConfig(),
    getCapacityConfig(),
    getTeamHealth(),
    getClientHealthConfig(),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h2 className="font-display text-base font-semibold text-fg">Workflows</h2>
        <p className="mt-1 font-body text-sm text-fg-muted">
          Two automations: how new clients are routed to a CSM and an Implementation owner, and how every account&apos;s
          health score is calculated. Pick one below.
        </p>
      </div>
      <WorkflowManager initialCsm={csm} initialImpl={impl} initialCapacity={capacity} teamHealth={teamHealth} initialClientHealth={clientHealth} roleLabels={roleLabels} />
    </div>
  );
}
